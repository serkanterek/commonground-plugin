#!/usr/bin/env node
'use strict';
/*
 * CommonGround PreToolUse publish guard (SER-217).
 *
 * Every rule that stopped CommonGround publishing something unasked was PROSE, and prose failed:
 * on 2026-08-04 a session published to the maintainer's own wiki three times, twice unasked, past
 * three separate written rules — including `/commonground:push` §2 ("Confirm"), which was bypassed
 * by calling the bundled binary directly. We shipped a gate and the gate was routed around. This is
 * the enforcing layer.
 *
 * It covers BOTH publish points, which is the whole reason it exists:
 *   • local-clone mode — `commonground push` publishes; the CONTENT write tools are BANNED here
 *     (SER-184), so far only in prose. Verdict: DENY, and say where the write belongs instead.
 *     The CLI is read in every shell tool Claude has, not only Bash: PowerShell and Monitor too,
 *     each in its own grammar (SER-327, see SHELL_DIALECT).
 *   • MCP mode — there is no local file, no staging and no push step: `save_page` IS the publish and
 *     is live the instant it lands, for the whole team on a shared wiki. Verdict: ASK.
 *
 * "DENY in local mode" is a rule about CONTENT, not about gated tools in general. A deny is only
 * defensible when it routes the call somewhere better; for a tool with no local equivalent it just
 * removes the only path to the thing. See OUTWARD_TOOLS.
 *
 * Read-only tools and the read-only CLI forms (`--dry-run`, `lint`, `status`) pass untouched. A
 * guard that blocks the safe preview teaches people to click through every prompt, which destroys
 * the guard everywhere else — the same reason `save_seeding_progress` is deliberately not gated.
 *
 * It guards COMMONGROUND publishes and nothing else. Not `git push`, not `gh pr create`, not `npm
 * publish`, not a deploy verb. A plugin hook is session-global rather than scoped to CommonGround
 * projects, so anything broader would impose our release policy on every repo belonging to anyone
 * who installed a wiki. See GATED_COMMANDS for the full reasoning; the boundary is pinned by tests.
 *
 * FAIL DIRECTION IS SPLIT, ON PURPOSE. The other two plugin hooks are fail-open because they inject
 * orientation and a broken one should be silent. A guard is different: an UNCERTAIN verdict resolves
 * to `ask`, never to allow (SER-202's review found the log gate's own read failing open — the same
 * bug, one layer down). But a hook that THROWS must never wedge a session, so the process-level
 * catch stays silent. Uncertainty → ask; crash → allow.
 */

const {
  readStdinInput,
  projectCwd,
  projectTeamId,
  routerMode,
  cliPath,
} = require(`${__dirname}/lib.cjs`);

/**
 * How text this hook hands the MODEL spells a CLI call: `node "<this build's CLI>" <args>` (SER-327).
 *
 * The bare `commonground` resolves only inside the Bash tool, the one place Claude Code puts a
 * plugin's `bin/` on PATH. The PowerShell tool never gets it, so an instruction naming the bare word
 * is an instruction that fails on Windows; `node "<path>"` runs from both shells, and it is the form
 * the command files define. Falls back to the bare word only when this build has no CLI to name (a
 * dev tree with the bundle parked), which is what every build said before.
 */
function cliCall(args) {
  const cli = cliPath();
  return cli ? `node "${cli}" ${args}` : `commonground ${args}`;
}

/**
 * Every tool the CommonGround connector exposes (SER-234).
 *
 * Used ONLY by the wrong-wiki guard below, which — unlike the publish gate — has to cover READS.
 * A wrong-wiki `search` is the whole defect; a wrong-wiki `save_page` is the rarer half.
 *
 * Only ever consulted for a tool {@link commongroundTool} recognises as ours. `search`, `get_page`,
 * `save_page` and `invite_teammate` are names any MCP server could use, and the `mcp__.*` matcher
 * sends every server's tools here, so gating on the bare name alone asked (or, in a local-clone
 * project, DENIED with "write the page as a file in the clone") for another system's writes.
 */
const COMMONGROUND_TOOLS = new Set([
  'search', 'get_page', 'get_index', 'get_started', 'get_awareness', 'get_coverage', 'get_history',
  'lint', 'list_suggestions', 'resolve_suggestion', 'save_charter', 'save_page',
  'save_seeding_progress', 'stage_sources', 'suggest_change', 'invite_teammate',
]);

/**
 * Refuse a CommonGround call when this project and the connector name DIFFERENT wikis (SER-234).
 *
 * The invariant: a session reads the wiki its project is bound to, or it refuses. It never silently
 * reads another. "The wiki" is the PRIMARY (SER-278): a project may read several, and the rest ride
 * in `COMMONGROUND_WIKIS`, but the one bare calls address is the one a confirmed disagreement on is
 * a wrong-wiki session. A drifted set is repaired and said by the SessionStart hook instead — it is
 * a missing wiki, not a wrong one, and denying every read over it would break far more than it
 * protects. Before SER-236/237 that could only be *detected*, and only if the user happened to
 * run `/commonground:status` — every answer in between came from the wrong wiki and looked normal.
 *
 * Both sides are readable right here, which is what makes a block possible at all:
 *   - what the PROJECT is bound to — the team marker in its own `CLAUDE.md` router block;
 *   - what the CONNECTOR was told to serve — `COMMONGROUND_WIKI`, which `init` writes into the
 *     project's `.claude/settings.json` and which reaches this process as an ordinary env var
 *     (verified: a hook spawned in a project sees that file's `env`). It describes the plugin's
 *     own server and no other, so `decide` asks this only for that server (see PLUGIN_SERVER).
 *
 * **Fires only on a CONFIRMED mismatch — never on an unknown.** No env var means the project
 * predates 0.7.4 or was never bound, and the connector will fall back to whatever it was authorised
 * for: possibly wrong, but *unknowable* from here, and denying on it would break every working
 * single-wiki setup on the machine. That case is a SessionStart nudge, not a block.
 *
 * Case-insensitive: the server canonicalises the wiki id, and a difference of casing is the same
 * wiki, not a mismatch.
 */
function wrongWikiVerdict(cwd) {
  const bound = projectTeamId(cwd);
  const serving = (process.env.COMMONGROUND_WIKI || '').trim();
  if (!bound || !serving) return null; // unknown — say nothing, block nothing
  if (bound.toLowerCase() === serving.toLowerCase()) return null;
  return {
    decision: 'deny',
    reason:
      `Restart this session. This project is set up for CommonGround wiki ${bound}, but this ` +
      `session's connector was told to serve ${serving}, and an answer from the wrong wiki looks ` +
      'exactly like a right one. The connector is told which wiki to serve when a session starts, ' +
      'so a restart is what puts it right.',
    instruction:
      'This project and the CommonGround connector name different wikis, so every wiki answer here ' +
      'would come from the wrong one. Do NOT retry the tool and do not work around it with another ' +
      'source. Tell the user plainly which two wikis disagree and that a session RESTART is what ' +
      'applies the right one (the SessionStart hook re-records it for them). If a restart does not ' +
      `end it, what this project records is stale: run \`${cliCall('init --refresh')}\` here (it ` +
      `re-records the whole set; never \`${cliCall(`init ${bound}`)}\`, which would reset the set ` +
      'of wikis this project reads to that one alone). Answer the rest of their question from what ' +
      'you already have, saying the wiki was not consulted.',
  };
}

/**
 * The project NAMES a wiki and this session's connector was never told which one (SER-325).
 *
 * This is the shape of the very first `/commonground:point`: `init` writes `COMMONGROUND_WIKI` into
 * `.claude/settings.json`, Claude Code reads that file at session START, and the session doing the
 * pointing therefore never sees it. Everything looks connected — the router block is there, the
 * tools are there — and a write lands in whatever wiki the connector was last authorized for.
 *
 * {@link wrongWikiVerdict} cannot cover it and correctly does not try: with no variable there is no
 * CONFIRMED mismatch, and denying on an unknown would break every project bound before 0.7.4 and
 * every repo that gitignores the settings file. So this is an ASK, on WRITES only. A read from the
 * wrong wiki in this state is a real risk too, but a prompt in front of every read would arrive
 * dozens of times in the session immediately after pointing, and a guard people click through is
 * the guard that was not there when it mattered.
 *
 * Silent whenever the env var IS set: the mismatch case above owns that ground. And `decide` asks
 * it only for the plugin's own server (PLUGIN_SERVER): a claude.ai connector never receives the
 * variable, so for its writes "a restart fixes it" would be untrue, and they get the generic ask.
 */
function unrecordedWikiVerdict(cwd) {
  const bound = projectTeamId(cwd);
  if (!bound) return null; // no declared wiki — nothing to compare, nothing to say
  if ((process.env.COMMONGROUND_WIKI || '').trim()) return null; // recorded; not this case
  return {
    decision: 'ask',
    reason:
      `This project reads CommonGround wiki ${bound}, but this session was started before that ` +
      'was recorded, so the connector has not been told which wiki to serve. This write may land ' +
      'in a different wiki of yours. Restarting the session is what fixes it for good.',
    instruction:
      `This project's CLAUDE.md names wiki ${bound} and COMMONGROUND_WIKI is unset in this ` +
      'session, which is the normal state immediately after a first /commonground:point (Claude ' +
      'Code reads that file at session start). Tell the user to restart the session. If they want ' +
      `it to go now anyway, pass \`wiki: "${bound}"\` explicitly on the call so the write cannot ` +
      'land anywhere else. Reads are not gated here; only writes are.',
  };
}

/**
 * Tools that write wiki CONTENT — a page, the charter, raw source material.
 *
 * Every one of these has a local-clone equivalent: a file in the clone, published later by
 * `commonground push`. That is what makes DENY the right verdict for them in local mode — the call
 * is refused *and* redirected, which is a different act from simply blocking it.
 */
const CONTENT_WRITE_TOOLS = new Set(['save_page', 'save_charter', 'stage_sources']);

/**
 * Gated tools that change hosted, team-visible state with NO local equivalent (SER-223).
 *
 * An invitation is minted server-side and the suggestion queue only exists server-side; neither is
 * a file, and no `commonground` verb produces either (check `USAGE` in the sync agent's cli.ts —
 * there is no `invite`). So the local-mode deny that content writes get was, for these two, not a
 * redirect but a dead end: a local-clone project could not invite anyone, and the refusal text told
 * the model to go and "write the page as a FILE in the clone" — advice with no referent, since
 * there is no page. The invite path was simply unreachable outside MCP mode and the web Team page.
 *
 * They stay GATED — both are outward-facing and awkward to walk back — but the verdict is `ask` in
 * every mode, because in every mode this call IS the act.
 */
const OUTWARD_TOOLS = new Set([
  'invite_teammate', // mints a real invite link that joins someone to the team
  'resolve_suggestion', // clears an item from the queue the whole team shares
]);

/**
 * Everything gated, in either class, by BARE tool name, once {@link commongroundTool} has said the
 * server is ours.
 *
 * `save_seeding_progress` is deliberately absent: it fires repeatedly through one seeding arc, and a
 * prompt per progress-save trains the user to approve without reading, which is worse than not
 * gating it. It writes bookkeeping, not wiki content.
 */
const GATED_TOOLS = new Set([...CONTENT_WRITE_TOOLS, ...OUTWARD_TOOLS]);

/**
 * The `ask` verdict for a tool in {@link OUTWARD_TOOLS}, worded for what it actually does.
 *
 * Reusing the content-write wording here is the bug this replaces: a person approving an invite was
 * being told about pages and local copies. The reason is plain consequence for a HUMAN; the
 * instruction is the model's channel (see `noticeFor`).
 */
function outwardVerdict(tool) {
  if (tool === 'invite_teammate') {
    return {
      decision: 'ask',
      reason:
        'This creates a real invitation to your CommonGround wiki. Whoever holds the resulting ' +
        'link can join your team and read everything in it, at the role being granted here — and ' +
        'the link works for anyone it is forwarded to, for the next 7 days.',
      instruction:
        'There is no local-clone equivalent of an invite and no CLI verb for it — this tool is the ' +
        'act itself, in every mode. Confirm the email address and the role with the user before ' +
        'retrying, and never invite anyone they did not name.',
    };
  }
  return {
    decision: 'ask',
    reason:
      'This resolves an inbound suggestion for everyone who shares your CommonGround wiki, not ' +
      'just for you — it leaves the queue and stops being something anyone else can act on.',
    instruction:
      'The suggestion queue is hosted-only: there is no local copy of it, so this is the act ' +
      'itself in every mode. Get an explicit go-ahead for THIS specific resolution.',
  };
}

/**
 * Shell forms that publish THE WIKI. Matched on what the command does, never on the string `git`.
 *
 * SCOPE, and it is deliberate: this list contains CommonGround verbs and nothing else. A plugin hook
 * is session-global — it is NOT scoped to CommonGround projects — so gating `git push`, `gh pr
 * create`, `npm publish` or a deploy verb here would reach into every unrelated repo on the machine
 * of anyone who installed a context wiki. That is not ours to police: a team's git and release
 * policy is their own, and a wiki plugin silently imposing one is a reason to uninstall it.
 *
 * It would also defeat this guard on its own terms. Prompting on every push in every repo teaches
 * the user to approve without reading, and the prompt that then gets clicked through is the one
 * protecting their wiki — the same reasoning that keeps `save_seeding_progress` out of GATED_TOOLS.
 *
 * A user who DOES want `git push` confirmed can say so in their own settings. That is their call to
 * make once, not ours to make for everyone.
 *
 * ACCEPTED RESIDUALS. These still publish with no dialog, and publish-guard.test.ts pins each one
 * as a known ALLOW, so closing one later shows up as a deliberate test change. Each needs the
 * shell to EVALUATE something before the binary and the verb exist as words, which text matching
 * cannot follow without becoming a shell:
 *   - a variable, function or alias holding the binary: `CG="…/commonground"; node "$CG" push`,
 *     `cg() { node "…/commonground" "$@"; }; cg push`, `alias cg=…; cg push`, and PowerShell's
 *     `$cg = "…\commonground"; node $cg push`;
 *   - `xargs`, or any program that reads the verb from stdin or a file: `echo push | xargs
 *     commonground`;
 *   - a substitution that yields the verb or nothing, and text assembled at run time:
 *     `commonground $(:) push`, commonground `#x` push, `iex ("commonground " + "push")`;
 *   - another interpreter's argv array: `python3 -c "subprocess.run(['commonground', 'push'])"`;
 *   - cmd's `^` escape: `cmd /c commonground pu^sh`;
 *   - a glob the shell matches against files: `node …/bin/common* push`, and `commonground pu?h`
 *     in a folder that holds a file called `push`;
 *   - a redirect target whose substitution nests more than once, `commonground 2>$(a $(b $(c)))
 *     push`: a target is read through one level of nesting, and pairing brackets to any depth is a
 *     parser's job.
 */
const GATED_COMMANDS = [
  {
    // `commonground push|import|sync`, HOWEVER it is invoked (SER-325). Routing around the slash command
    // is exactly how this failed once already, and the first matcher only understood the plainest
    // spellings: bare, an unquoted absolute path, or after a `cd ... &&`. Every one of these got
    // through it, and none is exotic — a path with a space in it is quoted by anything that writes
    // one, and `bash -c` is how a model reaches for a shell when a direct call is refused:
    //
    //   "/Users/me/My Plugins/bin/commonground" push      (a quoted binary path)
    //   node "/…/bin/commonground" push                   (run through node, as the hooks do)
    //   bash -c "commonground push"                       (a shell inside the shell)
    //   commonground.cmd push                             (Windows, where the shim carries .cmd)
    //
    // So a quote is a word boundary here, the binary may carry a Windows extension, and the verb
    // may be followed by the closing quote rather than whitespace. It over-gates by construction:
    // `git commit -m "commonground push"` now raises the dialog. That is the correct direction for
    // a guard — a needless prompt costs one click, a missed one costs an unasked publish — and it
    // is unavoidable, because `bash -c "commonground push"` is the same characters as a mention.
    //
    // SER-327 closed what was still getting through. Case: Windows and a default Mac disk resolve
    // `CommonGround` and `commonground.CMD` to the same file, hence the `i` flag (its over-gate is a
    // mention in any casing, and `commonground PUSH`, which the CLI rejects anyway). A quoted verb
    // (`commonground "push"`). And the end of the verb: `(cd /w && commonground push)`, `x=$(…)`,
    // `bash -c "commonground push;ls"` and `commonground push>out.txt` all ended in a character the
    // old lookahead did not accept. The groups are named because `readOnlyPreview` reads positions.
    //
    // The second lens review closed four more (SER-327). `!` and `=` start a word too, because a
    // program may run its value as a command: `git -c alias.p='!commonground push' p`, `git rebase
    // --exec=commonground\ push`; the cost is a prompt on `X=commonground push`. A substitution that
    // yields the BINARY may close between it and the verb: `$(which commonground) push`, `& (gcm
    // commonground) push`. A verb may end at `(`: PowerShell reads `push(…)` as two arguments.
    // And `sync`, which is plumbing and absent from the CLI's usage text, but for an admin or
    // curator publishes every local commit the hosted wiki does not have yet, with no preview.
    //
    // LINEAR ON PURPOSE: no character both STARTS a match (the first group) and continues a PATH,
    // so every character is scanned from one start at most. When `(){}` and the backtick were in
    // both sets, a 100 KB run of `(/` took 21 s to decide. `{` and `}` are path characters here,
    // so `${CLAUDE_PLUGIN_ROOT}/bin/commonground` stays one path, and the loose view in `gatedIn`
    // turns every brace into a space, so `&{commonground push}` still gates through it.
    re: /(^|[;&|()"'`!=]|\s)(?<path>[^\s;&|"'()`!=]*[/\\])?(?<bin>commonground(?:\.(?:cmd|exe|bat|ps1))?)["'`)]*\s+["']?(?<verb>push|import|sync)(?=[\s"'`;&|()}<>]|$)/di,
    // Shown to the PERSON in the approval dialog: what happens if they say yes, in plain language.
    reason:
      'This publishes your CommonGround wiki. From now on everyone who shares it — and every ' +
      'Claude session or tool that reads it — starts from these changes. It also commits ' +
      "everything sitting in your local copy, so any edit you haven't published yet goes out too.",
    // Injected into the MODEL's context: the operating instructions, which are meaningless to a
    // human staring at an approval dialog and were previously shown to them by mistake.
    instruction:
      `Before asking again, show the user \`${cliCall('push --dry-run')}\` so they can see exactly ` +
      'what would be published. Consent is per publish and never carries forward from an earlier one. ' +
      'THIS DIALOG IS THE CONFIRMATION: do not raise a separate yes/no question of your own before ' +
      'running the publish — two prompts back to back teach the user to click through both. Print ' +
      'the preview as text, then run it.',
    // What differs for one verb, keyed by it. `sync` records nothing new, so the push reason's
    // "it also commits everything" would overstate it in the one dialog that has to be believed.
    byVerb: {
      sync: {
        reason:
          'This publishes your CommonGround wiki. Every change already in the history of your ' +
          'local copy that the published wiki does not have yet goes out now, and from then on ' +
          'everyone who shares it, and every Claude session or tool that reads it, starts from ' +
          'those changes.',
        instruction:
          'sync is the CLI\'s internal verb and has no preview. To publish, show the user ' +
          `\`${cliCall('push --dry-run')}\` first and then run push; this dialog is its ` +
          'confirmation, so do not ask a yes/no question of your own as well. Consent is per ' +
          'publish and never carries forward from an earlier one.',
      },
    },
  },
];

/**
 * What THIS invocation adds to the base reason, read off THE SEGMENT THAT IS BEING GATED.
 *
 * This dialog is now the only confirmation on the publish path (SER-229): `/commonground:push` used
 * to raise its own `AskUserQuestion` first and the user got two prompts back to back, which is how a
 * guard stops being read. Removing the first one only works if the surviving one carries what the
 * first one carried — what is being published, and whether this run does anything worse than add.
 *
 * Takes the SEGMENT, not the whole command, and that is load-bearing rather than tidy. Reading the
 * whole string meant the dialog described a different command from the one about to run: for
 * `push --dry-run --message "preview only" && push --message "drops the poker section"` it quoted
 * `preview only`, and for `push --allow-deletes --dry-run && push --message "add two pages"` it
 * announced removals the real publish would not perform. Compound preview-then-publish is not an
 * exotic input here — it is the shape this file exists to gate.
 *
 * Flags are read from {@link unquoted} so a message that NAMES a flag cannot fake it, and their
 * boundary admits a shell operator (`--allow-deletes;echo done` is still `--allow-deletes`). The
 * message keeps its quotes, so it is reported as the user's own words. Unknown flags add nothing;
 * the base reason always stands alone.
 */
function publishDetail(segment, dialect = 'sh') {
  const bits = [];
  const m = /--message[=\s]+(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(segment);
  const message = m && (m[1] ?? m[2] ?? m[3]);
  // A bare `--message --mine` is the CLI's "no message" case (its parser rejects a `--`-leading
  // value), so quoting it here would attribute a commit message that never gets written.
  if (message && !message.startsWith('--')) {
    bits.push(`It goes into the history as: "${message.slice(0, 200)}".`);
  }
  const argv = unquoted(segment, dialect);
  const passed = (flag) => new RegExp(`${flag}([\\s;&|)]|$)`).test(argv);
  if (passed('--allow-deletes')) {
    bits.push(
      'This run also REMOVES pages: they stop being readable for anyone, though earlier versions ' +
        'stay in the history.',
    );
  }
  if (passed('--allow-unparseable')) {
    bits.push(
      'It also publishes a page that does not parse — it will appear in the catalog as an ' +
        'unreadable placeholder rather than as a page.',
    );
  }
  if (passed('--mine')) {
    bits.push('Where both sides changed the same page, your version is the one that survives.');
  }
  return bits.join(' ');
}

/**
 * The shell tools the guard reads, and the grammar each one speaks (SER-327).
 *
 * `Bash` was the only one until the Windows beta, and a `commonground push` typed into any other
 * shell tool went through with no dialog at all. Claude Code on Windows gives Claude a `PowerShell`
 * tool (the only shell there without Git for Windows, and beside Bash with it), and every OS has
 * `Monitor`, which runs a shell command in the same environment as Bash. A shell tool needs BOTH its
 * name here and a hooks.json matcher: missing from either, it is a tool the guard never sees. A Map
 * rather than an object literal, so a tool that happens to be called `constructor` is not a shell.
 */
const SHELL_DIALECT = new Map([
  ['Bash', 'sh'],
  ['Monitor', 'sh'],
  ['PowerShell', 'ps'],
]);

/**
 * Added to the publish reason when a shell this file does not know sends a publish (SER-327).
 * DORMANT by construction: the hook runs only for tools a hooks.json matcher names, and each of
 * those has a dialect above. It is here so that a matcher added before its dialect degrades to a
 * slightly over-eager prompt rather than to no prompt at all.
 */
const UNKNOWN_SHELL_NOTE =
  'CommonGround checks Bash, PowerShell and Monitor commands. This one came from a different ' +
  'shell, so check it does what you expect before you approve.';

/**
 * The flags that make a publish verb read-only, and the verbs each one does that for.
 *
 * `--dry-run` previews `push` only. `import` has no preview, so `import <dir> <wiki> --dry-run`
 * imports and publishes for real, and exempting it was a silent publish (SER-327). `sync` is in
 * no row: it reads no preview flag, so `sync acme --dry-run` publishes, and even its `--help`
 * (which cli.ts does honour) is asked about rather than paired, since nobody needs help with
 * plumbing.
 *
 * `--help` and `-h` are PAIRED WITH `main()` in apps/sync-agent/src/cli.ts, which prints the usage
 * and runs nothing when either appears anywhere after a verb (SER-327). Before that the CLI honoured
 * them only as the first word, so `commonground push --help` ran a REAL push and this exemption let
 * it through unasked. If cli.ts ever stops honouring them there, drop both rows in the same change;
 * the bundle-gated pairing test in publish-guard.test.ts is what notices.
 */
const PREVIEW_FLAGS = new Map([
  ['--dry-run', ['push']],
  ['--help', ['push', 'import']],
  ['-h', ['push', 'import']],
]);

/**
 * One shell command per element, split on the operators that START a new command — QUOTE-AWARE.
 *
 * Two distinct bugs live here, and both come from the same root: the guard used to look at raw
 * command TEXT and treat every occurrence of a flag as if it were argv.
 *
 *   1. The read-only escape was tested against the WHOLE command string, and returned before
 *      GATED_COMMANDS was consulted — so a preview anywhere in a compound command exempted the
 *      publish beside it, and `commonground push --dry-run && commonground push --message "x"`
 *      raised no dialog at all.
 *   2. Once split, the escape was still tested against raw segment text INCLUDING quoted values, so
 *      an ordinary single publish whose commit message merely mentioned `--dry-run` — the exact
 *      sentence a session that worked on the preview flag would write — went completely ungated.
 *      Same root, one level in, and strictly worse: no chaining required.
 *
 * Both matter more than they used to. `/commonground:push` no longer raises its own question, so a
 * missed verdict is now zero confirmations rather than one (SER-229).
 *
 * Parsing quotes here rather than stripping them later is what makes the whole chain honest: a
 * `&&` inside a `--message` no longer splits the command, so a segment is a real command and
 * {@link publishDetail} can read THIS publish's message and flags off it instead of guessing from
 * the whole string. An unterminated quote simply runs to the end, so the verb stays in that segment
 * and still gates. Escapes are understood since SER-327 (see {@link scanShell}); before that an
 * escaped quote closed the string early, which was a bypass, not merely an over-split.
 */
function commandSegments(cmd, dialect = 'sh') {
  return scanShell(cmd, dialect).map((s) => s.text);
}

/**
 * A segment with quoted runs blanked out, for anything that asks "was this flag PASSED?".
 *
 * Flag detection must never read argument TEXT as argv. Without this, `push --message "remember
 * --mine and --allow-deletes exist"` told the user their publish REMOVES pages — crying wolf on the
 * one warning that has to be believed, in the dialog that is now the only confirmation. Blanking
 * can only remove matches, never manufacture one.
 *
 * Escaped characters and comments are blanked too, and every blanked character becomes `_` rather
 * than a space (SER-327): `--message "a"--dry-run` is ONE word to the shell, the message, and
 * blanking its quotes to a space used to turn `--dry-run` into a word of its own.
 */
function unquoted(segment, dialect = 'sh') {
  return scanShell(segment, dialect).map(bareView).join(' ');
}

/** A scanned segment as the shell's own words: anything quoted, escaped or commented becomes `_`. */
function bareView({ text, kind }) {
  let out = '';
  for (let i = 0; i < text.length; i++) out += kind[i] === ' ' ? text[i] : '_';
  return out;
}

/**
 * The one escape-aware scanner behind {@link commandSegments} and {@link unquoted} (SER-327).
 *
 *   sh (Bash, Monitor): `\` escapes the next character outside quotes and inside "…" and $'…';
 *     nothing escapes inside '…'. `\` + LF is a line continuation and vanishes, inside "…" too.
 *     `\` + CR + LF is NOT one: bash keeps the escaped CR in the word and the LF still ends the
 *     command, so a flag on the next line of a CRLF command never reaches this one.
 *   ps (PowerShell): a backtick escapes the next character outside quotes and inside "…". Doubled
 *     quotes (`''`, `""`) need no code: close-then-reopen blanks the same characters. A backtick +
 *     LF or CRLF is a continuation and reads as a space. Unicode smart quotes ARE quotes to
 *     PowerShell, so they are mapped to ASCII first; a smart-quoted message is otherwise a place to
 *     hide a flag.
 *   both: `#` at the start of a word opens a comment to the end of the line (PowerShell's `<#`
 *     too, read the same way, which can only blank more); `;`, a newline, `&`, `&&`, `|` and `||`
 *     start a new command. In PowerShell a lone `&` is the call operator, and splitting on it only
 *     over-splits: the verb stays with its binary. PowerShell also ends a line at a lone CR; bash
 *     does not, and there a CR is an ordinary character of the word it ends.
 *   A `&` or `|` inside a redirect is not a separator: `2>&1`, `>&2`, `<&0`, `&>file`, `&>>file`,
 *     `>|file`. Cutting there put `commonground 2>&1 push` in two segments, and neither published.
 *
 * Each segment comes back as its text plus a same-length `kind`: ' ' for a character the shell reads
 * as a bare word or as syntax, 'q' for one inside quotes or escaped (the quote and escape characters
 * included), '#' for a comment. An escape and the character after it are consumed as a PAIR, so
 * a backslash escaped by another one (`\\` then a newline) leaves that newline a real separator
 * rather than a continuation; joining it would glue the next command onto a preview's flags.
 */
function scanShell(cmd, dialect) {
  const ps = dialect === 'ps';
  const escape = ps ? '`' : '\\';
  const src = ps ? cmd.replace(/[\u2018-\u201e]/g, (c) => (c < '\u201c' ? "'" : '"')) : cmd;
  const out = [];
  let text = '';
  let kind = '';
  let quote = null; // "'", '"', or sh's ANSI-C "$'", inside which a backslash escapes
  let comment = false;
  let wordStart = true;
  // The last character added when the shell reads it bare, else ''. Kept aside rather than read
  // back off `text`, which is still being concatenated and would be flattened on every read.
  let lastBare = '';
  const add = (chars, kinds) => {
    text += chars;
    kind += kinds;
    lastBare = kinds[kinds.length - 1] === ' ' ? chars[chars.length - 1] : '';
  };
  const cut = () => {
    out.push({ text, kind });
    text = '';
    kind = '';
    lastBare = '';
    wordStart = true;
  };
  // The length of a line continuation starting at the escape at `i`, or 0: escape + LF in both
  // dialects, escape + CRLF in PowerShell only (in bash the CR is an escaped character of the word).
  const continuation = (i) =>
    src[i + 1] === '\n' ? 2 : ps && src[i + 1] === '\r' && src[i + 2] === '\n' ? 3 : 0;
  const lineEnd = (c) => c === '\n' || (ps && c === '\r');

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (comment) {
      if (lineEnd(c)) {
        comment = false;
        cut();
      } else add(c, '#');
      continue;
    }
    if (quote) {
      if (c === escape && quote !== "'") {
        const joined = !ps && quote === '"' ? continuation(i) : 0;
        if (joined) i += joined - 1;
        else if (i + 1 < src.length) add(c + src[++i], 'qq');
        else add(c, 'q');
        continue;
      }
      add(c, 'q');
      if (c === quote[quote.length - 1]) quote = null;
      continue;
    }
    if (c === escape) {
      const joined = continuation(i);
      if (joined) {
        i += joined - 1;
        if (ps) {
          add(' ', ' ');
          wordStart = true;
        }
        continue;
      }
      if (i + 1 < src.length) {
        add(c + src[++i], 'qq');
        wordStart = false;
        continue;
      }
      // A lone trailing escape falls through as an ordinary character.
    }
    if (!ps && c === '$' && src[i + 1] === "'") {
      quote = "$'";
      add(c + src[++i], 'qq');
      wordStart = false;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      add(c, 'q');
      wordStart = false;
      continue;
    }
    if (wordStart && (c === '#' || (ps && c === '<' && src[i + 1] === '#'))) {
      comment = true;
      add(c, '#');
      continue;
    }
    if (c === '&' || c === '|') {
      if (lastBare === '>' || lastBare === '<' || (c === '&' && src[i + 1] === '>')) {
        add(c, ' '); // part of a redirect
        wordStart = true;
        continue;
      }
      if (src[i + 1] === c) i++; // `&&` / `||` are one separator; a lone `&` or `|` is also one
      cut();
      continue;
    }
    if (c === ';' || lineEnd(c)) {
      cut();
      continue;
    }
    add(c, ' ');
    wordStart = /\s/.test(c) || (ps ? /[(){}]/ : /[()<>]/).test(c);
  }
  cut();
  return out;
}

/**
 * `Start-Process commonground.cmd -ArgumentList push`: PowerShell's way to run a program with its
 * arguments in a list, where the verb never sits next to the binary for the regex to see. A folder
 * given as the working directory or a redirect file is not the program, so `Start-Process git
 * -ArgumentList push -WorkingDirectory C:\src\commonground` is not a publish (PowerShell accepts
 * any unambiguous prefix of a parameter name, hence `wo` and `red`). The list may follow a colon
 * (`-ArgumentList:push`) and its verb may be spelled apart (pu`sh), so it is read in both views.
 */
const START_PROCESS = /\b(?:start-process|saps|start)\b/i;
const LISTED_VERB = /(?:^|[\s"',:])(?<verb>push|import|sync)(?=[\s"',;)]|$)/i;
const START_PROCESS_PATHS = /-(?:wo|red)\w*[\s:]+(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi;

/**
 * `git -C <folder>`: a folder that happens to be called commonground, not the binary, so `git -C
 * ~/CommonGround push` is a git push and not ours to gate. Only git's OWN global options are read,
 * the flags between `git` and its subcommand, so another program's `-C` further along (`git log
 * $(strace -C commonground push)`) stays in view. A value is dropped when it cannot run anything:
 * a plain word, a single-quoted one, or a double-quoted one with no `$` or backtick in it
 * (`git -C "C:\Users\Some One\src\commonground" push`). Any other flag ends the walk where it
 * stops being a plain flag, so `git -c alias.p=… -C <folder>` still asks.
 */
const GIT_GLOBALS =
  /^(\s*git)((?:\s+(?:-C\s+(?:"[^"$`]*"|'[^']*'|[^\s"'$`;&|(){}<>]+)|--?[A-Za-z][\w-]*))*)/;
const GIT_DIRECTORY = /(\s)-C\s+(?:"[^"$`]*"|'[^']*'|[^\s"'$`;&|(){}<>]+)/g;

function withoutGitDirectory(segment) {
  const m = GIT_GLOBALS.exec(segment);
  if (!m || !m[2]) return segment;
  return m[1] + m[2].replace(GIT_DIRECTORY, '$1 ') + segment.slice(m[0].length);
}

/**
 * A redirect and its target (`>out`, `2>&1`, `&>/dev/null`, `*>$null`, `<in`, and bash's named
 * `{fd}>log`), never `<<` or `<(`. The target runs through escape pairs, a `${…}`, and a `$(…)`
 * with one level of nesting inside (`>/tmp/a\ b`, `2>$(mktemp)`, `2>$(echo $(mktemp))`), in the
 * escape character of each dialect. In bash the target may also be a process substitution
 * (`> >(tee log.txt)`, `< <(echo)`), which is one word to the redirect however many it holds.
 * The target is captured, because a substitution in it runs a command of its own.
 */
const redirect = (escape, source, opens) =>
  new RegExp(
    String.raw`${source}?(?:>>?|(?<!<)<(?![<(]))[&|]?\s*` +
      String.raw`((?:"[^"]*"|'[^']*'|${escape}[\s\S]|` +
      String.raw`${opens}\((?:[^()]|\([^()]*\))*\)|\$\{[^{}]*\}|[^\s<>;&|"'()])*)`,
    'g',
  );
const REDIRECT = {
  sh: redirect(String.raw`\\`, String.raw`(?:[0-9&*]|\{[A-Za-z_]\w*\})`, '[$<>]'),
  ps: redirect('`', '[0-9&*]', String.raw`\$`),
};

/**
 * A bash word for the heredoc and here-string forms below: quoted runs, escape pairs and plain
 * characters, each alternative starting on a different character so the scan stays linear.
 */
const SH_WORD = String.raw`(?:"[^"]*"|'[^']*'|\\[\s\S]|[^\s"'\;&|<>()])+`;
/** `<<< word`: the word is the program's stdin, which `bash <<< "commonground push"` runs. */
const HERE_STRING = new RegExp(String.raw`<<<\s*(${SH_WORD})`, 'g');
/** `<<EOF`, `<<-'EOF'`: the delimiter, whose body lines are segments of their own. */
const HEREDOC = new RegExp(String.raw`<<-?\s*${SH_WORD}`, 'g');
/** bash's `$'…'`, where `\x73`, `\163` and `\u0073` are all an `s`. */
const ANSI_C = /\$'((?:[^'\\]|\\[\s\S])*)'/g;
const ANSI_C_ESCAPE = /\\(?:x([0-9A-Fa-f]{1,2})|u([0-9A-Fa-f]{1,4})|U([0-9A-Fa-f]{1,8})|([0-7]{1,3}))/g;
/** `$NAME`, `${…}` in any form (`${x:-}`, `${!x}`), and the special `$1`, `$@`, `$*`, `$#`, `$?`… */
const PARAMETER = /\$(?:\{[^{}]*\}|[A-Za-z_]\w*|[0-9@*#?$!-])/g;

function decodeAnsiC(body) {
  return body.replace(ANSI_C_ESCAPE, (all, hex, u4, u8, octal) => {
    const point = octal ? parseInt(octal, 8) : parseInt(hex || u4 || u8, 16);
    return point <= 0x10ffff ? String.fromCodePoint(point) : all;
  });
}

/** PowerShell's inline `<# … #>` comments, dropped. Linear: one `indexOf` scan per comment. */
function withoutBlockComments(text) {
  let out = '';
  let i = 0;
  for (;;) {
    const open = text.indexOf('<#', i);
    const close = open === -1 ? -1 : text.indexOf('#>', open + 2);
    if (close === -1) return out + text.slice(i);
    out += `${text.slice(i, open)} `;
    i = close + 2;
  }
}

/**
 * The segment as the shell may read it once it has expanded what the raw text does not spell out:
 * an escape before a letter or a space (`pu\sh`, pu`sh, `commonground\ push`), `$'…'` with its
 * escapes decoded (`$'pu\x73h'`) and `$"…"`, a parameter expansion, quotes (`pu""sh`), brace
 * expansion and commas (`commonground {push,}`, `{commonground,push}`), a redirect between the
 * binary and its verb (`commonground 2>&1 push`, `commonground > >(tee log.txt) push`), a heredoc
 * delimiter, and a here-string (`commonground <<<y push`, `bash <<< "commonground push"`). A
 * here-string's word and a redirect's target move to the end as commands of their own: the word is
 * what the program reads, and a target may hold a substitution that runs (`x > >(commonground
 * pu${E}sh)`), so dropping either would hide a publish. In PowerShell also an inline `<# … #>`
 * comment, the stop-parsing token (`commonground --% push`), an empty `$()` or `@()`, and a splat
 * that may be empty (`commonground @args push`). Only ever used to FIND a publish, never to exempt
 * one, so reading too much into it costs a prompt and nothing else.
 *
 * It comes back as TWO views, because a parameter expansion can do either of two opposite things
 * and the text cannot say which: it may expand to nothing and join the words around it
 * (`commonground $EMPTY push`, `pu${EMPTY}sh`, `$1`, `$@`, `${x:-}`), or expand to whitespace and
 * split the word it sits in (`commonground${IFS}push`, `commonground$IFS'push'`). The first view
 * drops each expansion and the second turns it into a space. Keeping only one of them was a swap,
 * not a fix: each spelling published through the other.
 *
 * Redirects go before the escapes and expansions are resolved, so a target keeps the characters
 * that make it one word to the shell (`>/tmp/a\ b`, `>$HOME`) instead of spilling onto the verb.
 */
function looseView(segment, dialect) {
  const ps = dialect === 'ps';
  const moveTo = (list) => (_, word) => {
    list.push(word);
    return ' ';
  };
  const words = [];
  const targets = [];
  let text = ps
    ? withoutBlockComments(segment).replace(/--%/g, ' ').replace(/[$@]\(\s*\)|@[A-Za-z_]\w*/g, '')
    : segment.replace(HERE_STRING, moveTo(words)).replace(HEREDOC, ' ');
  text = [text, ...words].join(' ;').replace(REDIRECT[dialect], moveTo(targets));
  text = [text, ...targets].join(' ;');
  if (!ps) text = text.replace(ANSI_C, (_, body) => decodeAnsiC(body));
  return ['', ' '].map((expansion) =>
    text
      .replace(PARAMETER, expansion)
      .replace(ps ? /`(?=[a-z\s])/gi : /\\(?=[a-z\s])/gi, '')
      .replace(/\$(?=["'])/g, '')
      .replace(/["']/g, '')
      .replace(/[{},]/g, ' '),
  );
}

/**
 * Which gated command this segment runs, and the verb it runs it with, or null (SER-327).
 *
 * Four views, any one of which gates, so each can only ADD a match: the segment's own text; the two
 * readings of the {@link looseView}; and, in PowerShell, Start-Process naming the binary with the
 * verb in its argument list. The raw view is kept beside the loose ones because removing a
 * backslash can also REMOVE a match (`C:\x\bin\commonground push` loses its path). The only text
 * taken OUT of the own view is a folder: git's `-C <folder>` and, beside Start-Process, a working
 * directory or a redirect file.
 *
 * Every step is linear in the segment, and a segment that never names the binary in any view
 * stops before the gated regex runs at all, which is nearly every command a session sends.
 */
function gatedIn(segment, dialect) {
  let own = withoutGitDirectory(segment);
  const startProcess = dialect === 'ps' && START_PROCESS.test(own);
  if (startProcess) own = own.replace(START_PROCESS_PATHS, ' ');
  const views = [own, ...looseView(own, dialect)];
  if (!views.some((view) => /commonground/i.test(view))) return null;
  const find = (re) => views.reduce((m, view) => m || re.exec(view), null);
  const listed = startProcess && find(LISTED_VERB);
  for (const command of GATED_COMMANDS) {
    const m = find(command.re) || listed;
    if (m) return { command, verb: m.groups.verb.toLowerCase() };
  }
  return null;
}

/**
 * Does a PowerShell `prefix` leave a bare `(` open, with the binary already named before the
 * preview (rule 3 of {@link readOnlyPreview})? `N (N push --dry-run) push` does: the group closes
 * and hands `push` to the outer binary. `if (N push --dry-run) { … }` does not name the binary
 * before the group, so the lone preview it wraps keeps its exemption. `kind` is the scan's
 * same-length class string, so a quoted or escaped paren is not counted.
 */
function namedInOpenGroup(prefix, kind) {
  let depth = 0;
  for (let j = 0; j < prefix.length; j++) {
    if (kind[j] !== ' ') continue;
    if (prefix[j] === '(') depth++;
    else if (prefix[j] === ')' && depth > 0) depth--;
  }
  return depth > 0 && looseView(prefix, 'ps').some((view) => /commonground/i.test(view));
}

/**
 * Is this segment's publish actually a read-only preview (SER-327)?
 *
 * It replaced a test that asked whether `--dry-run` or `--help` appeared anywhere outside quotes,
 * which exempted real publishes: `import … --dry-run` (import has no preview), `bash -c
 * 'commonground push' --dry-run` (the flag belongs to the outer shell), `push --message x #
 * --dry-run` (a comment), `push > --dry-run` (a redirect target), `push --message=--dry-run` (the
 * message), and a message with an escaped quote in it. The rules, in order:
 *
 *   1. The verb is found in the segment's own text. A publish seen only through a loose view or
 *      through Start-Process is never exempt. And it is the ONLY publish in the segment: nothing
 *      before its binary or after its verb is gated in any view. PowerShell runs two commands in one
 *      statement with no separator between them (`if (<preview>) { <publish> }`, `try {…} finally
 *      {…}`, `while`, `switch`), and there the preview came first and vouched for the publish.
 *   2. The binary and the verb are two separate words and the verb is bare. A quoted verb is some
 *      other program's argument (`bash -c 'commonground push' --dry-run`, `bash -c "commonground
 *      "push --dry-run`). A quoted PATH is fine: `"C:\…\commonground" push --dry-run`.
 *   3. Nothing before the binary expands (`$`, a backtick), so the invocation cannot be assembled
 *      from the words after it: `sh -c 'eval "$0 $1"' commonground push --dry-run` publishes. And
 *      the preview does not sit inside a group opened before its binary, whose close hands the
 *      rest of the line back to an outer command: bash's `<(` and `>(` (`commonground <
 *      <(commonground push --dry-run) push`), or in PowerShell a bare `(` still open where the
 *      binary is already named (`N ([void](N push --dry-run)) push`). Rule 1 cannot see that
 *      publish, because its binary is before the preview and its verb after it.
 *   4. Nothing after the verb can run a command or be re-read by another shell: `$(`, a backtick,
 *      `<(`, `>(`, a heredoc; in PowerShell `$(`, `@(`, a bare `(`, a here-string, `--%`; in both a
 *      quoted or escaped `;` `&` `|` or newline, which `cmd /c`, `wsl`, `ssh` or `find -exec … \;`
 *      would read as the start of another command, and a quoted or escaped `#` that starts a word,
 *      which that shell reads as a comment and so drops the flag after it (`ssh host commonground
 *      push '#' --dry-run`, `--message "close #12" --dry-run`). Nor anything that DECODES to one:
 *      bash's `$'…'` (`$'\n'`, `$'\x3b'`), an escaped `\$\(` that `ssh` or `wsl` hands a second
 *      shell unescaped, and any PowerShell backtick escape in the tail ("`n", "`u{3b}").
 *   5. The flag is a whole word this invocation receives: before any redirect and before the `)`
 *      or `}` that closes a group or a script block, not glued to other text, not quoted, not in a
 *      comment, and valid for this verb (PREVIEW_FLAGS). `--message --dry-run` still previews,
 *      because the CLI refuses a `--`-leading value. Words end at a space or a tab and nothing
 *      else: bash reads a CR, a no-break space or any other Unicode space as part of the word, so
 *      `--dry-run` followed by a CR (a CRLF line) reached the CLI as `--dry-run\r` and published.
 *      PowerShell may split on more of them; reading fewer word ends can only withhold.
 *
 * Every rule can only withhold the exemption. Uncertainty resolves to ask.
 */
function readOnlyPreview(segment, dialect = 'sh') {
  const [scanned] = scanShell(segment, dialect);
  const { text, kind } = scanned;
  const m = GATED_COMMANDS[0].re.exec(text);
  if (!m || !m.indices || !m.indices.groups) return false; // rule 1
  const { path, bin, verb } = m.indices.groups;
  const start = (path || bin)[0];
  if (gatedIn(text.slice(0, start), dialect) || gatedIn(text.slice(verb[1]), dialect)) return false;

  let i = bin[1]; // rule 2
  if (kind[i] === 'q' && kind[i - 1] === 'q' && `"'`.includes(text[i])) i++; // a quoted path closing
  for (; i < verb[1]; i++) if (kind[i] !== ' ') return false;

  const prefix = text.slice(0, start); // rule 3
  if (/[$`]/.test(prefix)) return false;
  if (dialect === 'ps' ? namedInOpenGroup(prefix, kind) : /[<>]\(/.test(prefix)) return false;

  const tail = text.slice(verb[1]); // rule 4
  const tailKind = kind.slice(verb[1]);
  const runs = dialect === 'ps' ? /\$\(|@\(|@["']|--%/ : /\$\(|`|<\(|>\(|<<|\$'/;
  if (runs.test(tail) || (dialect !== 'ps' && runs.test(tail.replace(/\\([\s\S])/g, '$1')))) {
    return false;
  }
  for (let j = 0; j < tail.length; j++) {
    if (tailKind[j] === 'q' && /[;&|\n]/.test(tail[j])) return false;
    const startsWord = j === 0 || /[\s"'\\`(){}<>]/.test(tail[j - 1]);
    if (tailKind[j] === 'q' && tail[j] === '#' && startsWord) return false;
    if (dialect === 'ps' && tailKind[j] === ' ' && tail[j] === '(') return false;
    if (dialect === 'ps' && tailKind[j] === 'q' && tail[j] === '`') return false;
  }

  const own = bareView({ text: tail, kind: tailKind }); // rule 5
  const end = own.search(/[<>)}]/);
  const words = (end === -1 ? own : own.slice(0, end)).split(/[ \t]+/);
  return words.some((w) => (PREVIEW_FLAGS.get(w) || []).includes(m.groups.verb));
}

/**
 * The publish verdict for one shell command, read in each of `dialects`: judged PER SEGMENT, and
 * the escape is judged on FLAG POSITIONS, so a read-only form only exempts the command it is
 * actually a flag of, and only when it is a flag rather than message text. The gated verb itself is
 * matched on the RAW segment — quoted text there can only over-gate. Two dialects is the unknown
 * shell: a union, so it can only over-gate.
 */
function shellVerdict(cmd, dialects) {
  for (const dialect of dialects) {
    for (const segment of commandSegments(cmd, dialect)) {
      const hit = gatedIn(segment, dialect);
      if (!hit || readOnlyPreview(segment, dialect)) continue;
      const says = (hit.command.byVerb && hit.command.byVerb[hit.verb]) || hit.command;
      const detail = publishDetail(segment, dialect);
      return {
        decision: 'ask',
        reason: detail ? `${says.reason} ${detail}` : says.reason,
        instruction: says.instruction,
      };
    }
  }
  return null;
}

/**
 * What a shell tool is about to run. `command` is the field Bash, PowerShell and Monitor all use; a
 * payload without one is read as ALL of its string values, so an input shape we did not expect
 * resolves toward gating rather than toward a silent allow (fail-safe, as the header says).
 */
function shellCommand(toolInput) {
  if (typeof toolInput.command === 'string') return toolInput.command;
  return Object.values(toolInput)
    .filter((v) => typeof v === 'string')
    .join('\n');
}

/** The bare tool name from an MCP-qualified one (`mcp__abc__save_page` → `save_page`). */
function bareToolName(name) {
  if (typeof name !== 'string') return '';
  const parts = name.split('__');
  return parts.length > 1 ? parts[parts.length - 1] : name;
}

/** The SERVER segment of an MCP tool name (`mcp__<server>__<tool>`), or '' for any other name. */
function serverOf(name) {
  if (typeof name !== 'string' || !name.startsWith('mcp__')) return '';
  const end = name.indexOf('__', 'mcp__'.length);
  return end === -1 ? '' : name.slice('mcp__'.length, end);
}

/**
 * The plugin's own server, the only one {@link wrongWikiVerdict} and {@link unrecordedWikiVerdict}
 * speak for: `COMMONGROUND_WIKI` reaches that server alone, through the headersHelper in the
 * plugin's `.mcp.json`. A claude.ai connector never receives it and serves its own default, so a
 * verdict keyed on the variable would tell its user something untrue, and a restart would not
 * change it.
 */
const PLUGIN_SERVER = /^plugin_commonground_/i;

/**
 * The bare name of a CommonGround connector tool, or '' for every other tool.
 *
 * An MCP tool arrives as `mcp__<server>__<tool>`, and it is ours only when the SERVER segment (up to
 * the next `__`) is one of CommonGround's own names: the plugin's server
 * (`plugin_commonground_commonground`), or a name that IS `commonground` in any casing once `_` and
 * `-` are left out, bare (`commonground`, a hand-added server) or after the `claude_ai_` that
 * Claude Code puts before a claude.ai connector (`claude_ai_CommonGround`, and one saved as "Common
 * Ground", which arrives as `claude_ai_Common_Ground`). The whole name is compared, not searched:
 * `common-grounds-crm`, `uncommon-ground` and `Common-Ground-Health` are other products, and
 * reading them as ours DENIED their `save_page` in a local-clone project. Any other server's tool
 * is left alone whatever its bare name, because this hook runs for every MCP call in every session
 * on the machine and has no business judging another system's `save_page`.
 *
 * A server named only by an id is not recognised here. {@link unnamedConnectorVerdict} asks before
 * its gated writes instead, never denies them, and its reads are not judged at all.
 */
function commongroundTool(name) {
  const server = serverOf(name);
  const folded = server.replace(/^claude_ai_/i, '').replace(/[\s_-]/g, '');
  return PLUGIN_SERVER.test(server) || /^commonground$/i.test(folded) ? bareToolName(name) : '';
}

/** A server segment that is only an id: how the Claude desktop app names a claude.ai connector. */
const ID_ONLY_SERVER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * An ASK, never a deny, for a gated write on a connector whose server is only an id (SER-327).
 *
 * The Claude desktop app names claude.ai connectors by id (`mcp__<uuid>__save_page`), so a person
 * who connected CommonGround for Chat reaches the same write tools in the desktop Code tab with
 * nothing in the name that says CommonGround. Recognising only named servers would leave those
 * writes unprompted. Recognising any id-named `save_page` risks judging someone else's tool, so the
 * answer here is the mildest one that still gates: a prompt, worded as a question about which
 * connector this is. Never the local-mode deny, whose redirect only makes sense for CommonGround.
 */
function unnamedConnectorVerdict(toolName) {
  if (!ID_ONLY_SERVER.test(serverOf(toolName))) return null;
  const bare = bareToolName(toolName);
  if (!GATED_TOOLS.has(bare)) return null;
  return {
    decision: 'ask',
    reason:
      `A connector without a name here is about to run ${bare}. If it is CommonGround, this ` +
      'writes straight to your wiki and goes live for everyone who shares it. If it is another ' +
      'service, this prompt is only a precaution.',
    instruction:
      'The connector could not be identified by name. If it is CommonGround, get an explicit yes ' +
      'for THIS specific write; in a local-clone project, write the page as a file in the wiki ' +
      'folder instead.',
  };
}

/**
 * The verdict for one tool call, or null to stay out of the way.
 * Exported so tests can drive every branch without spawning a process per case.
 */
function decide(input) {
  const toolName = (input && input.tool_name) || '';
  const toolInput = (input && input.tool_input) || {};

  const dialect = SHELL_DIALECT.get(toolName);
  if (dialect) return shellVerdict(shellCommand(toolInput), [dialect]);
  // A shell tool with no dialect here. Dormant (see UNKNOWN_SHELL_NOTE); falls through on no hit,
  // so a non-shell tool that merely has a `command` field is judged exactly as before.
  if (!toolName.startsWith('mcp__') && typeof toolInput.command === 'string') {
    const verdict = shellVerdict(toolInput.command, ['sh', 'ps']);
    if (verdict) return { ...verdict, reason: `${verdict.reason} ${UNKNOWN_SHELL_NOTE}` };
  }

  const bare = commongroundTool(toolName);
  if (!bare) return unnamedConnectorVerdict(toolName);

  // WHICH WIKI, before WHETHER TO PUBLISH (SER-234). Checked ahead of the publish gate and ahead of
  // the GATED_TOOLS early return, because it is the only guard that has to cover READS — and
  // because asking someone to approve a write to the wrong wiki is the wrong question entirely.
  // Only for the plugin's own server, the one the variable it compares describes (PLUGIN_SERVER).
  if (COMMONGROUND_TOOLS.has(bare) && PLUGIN_SERVER.test(serverOf(toolName))) {
    const wrongWiki = wrongWikiVerdict(projectCwd(input));
    if (wrongWiki) return wrongWiki;
  }

  if (!GATED_TOOLS.has(bare)) return null;

  // Hosted-only, no local equivalent — the mode cannot change the answer, so it is never consulted.
  if (OUTWARD_TOOLS.has(bare)) return outwardVerdict(bare);

  // A CONTENT write fired. WHERE it lands depends on this project's mode, and the answers differ.
  const mode = routerMode(projectCwd(input));

  if (mode === 'local') {
    return {
      decision: 'deny',
      reason:
        'Sent down the wrong path, not refused. This project keeps a local copy of your wiki, and ' +
        'this would write straight to the published one instead — leaving your local copy behind ' +
        'and out of step with it. The same change belongs in your local copy first, and Claude ' +
        'should now write it there; publishing it is a separate, deliberate step.',
      instruction:
        'This project is in LOCAL-CLONE mode, where the MCP write tools are the wrong path entirely ' +
        '(SER-184). Write the page as a FILE in the clone, then publish with /commonground:push ' +
        'once the user approves. This is a REDIRECT, not a refusal of what the user asked for: ' +
        'carry on and do the ingest/edit as a file. Do not report back that this project cannot ' +
        'write to the wiki, and do not ask them whether they still want it.',
    };
  }

  // The connector was never told which wiki this project reads (SER-325). Named rather than folded
  // into the generic prompt below, because the two need different answers: this one is fixed by a
  // restart, and the user cannot know that from a sentence about irreversibility. Only for the
  // plugin's own server: no restart tells any other connector anything (PLUGIN_SERVER).
  const ownServer = PLUGIN_SERVER.test(serverOf(toolName));
  const unrecorded = ownServer && unrecordedWikiVerdict(projectCwd(input));
  if (unrecorded) return unrecorded;

  // MCP mode — and also the uncertain case (no router block, unreadable CLAUDE.md). Uncertainty
  // resolves to ASK: the cost of a needless prompt is one click, the cost of a wrong allow is a
  // published page nobody asked for.
  return {
    decision: 'ask',
    reason:
      'This writes straight to your CommonGround wiki. It goes live the moment it lands — for ' +
      'everyone who shares the wiki — and there is no local draft or preview step that could ' +
      'catch it afterwards.',
    instruction:
      'This is the publish itself: there is no staging and no later push step to gate. Get an ' +
      'explicit yes for THIS specific write, every time.',
  };
}

/**
 * The note for the MODEL's own transcript, alongside the dialog the user sees.
 *
 * THE TWO CHANNELS CARRY DIFFERENT AUDIENCES, and conflating them is a real defect we shipped once:
 * `permissionDecisionReason` renders in the approval dialog to a HUMAN, so it must be plain
 * consequence — what changes if they say yes. It briefly carried model instructions instead, and
 * users were shown "Show the user `--dry-run` and get an explicit yes", i.e. told to obtain their
 * own permission. Operating instructions belong here, where only the model reads them.
 *
 * The model never receives the reason and never sees the human's answer, so an approved `ask` is
 * byte-identical, from its side, to no hook at all — a dangerous blind spot: the first time this
 * guard was tested live, the model read a successful publish as "the guard did not fire" and began
 * diagnosing the hook, one step from patching a mechanism working exactly as designed. So the
 * inference is stated outright, because the wrong one is the expensive one. Emitted on `deny` too,
 * so both verdicts read the same way in a transcript.
 */
function noticeFor(decision, instruction) {
  const head =
    decision === 'deny'
      ? 'CommonGround publish guard: this call was REFUSED before it ran (nothing was written). ' +
        'Do not retry the same call, and do not edit or disable the guard.'
      : 'CommonGround publish guard: this call was intercepted and the user is being asked to ' +
        'approve it. You will NOT see their answer. If the command then succeeds, that is because ' +
        'they said yes — NOT because the guard failed to fire. Do not re-run it, do not look for ' +
        'another path to the same write, and do not investigate or modify the guard on the ' +
        'strength of a successful publish. If they decline, the call simply does not run.';
  return instruction ? `${head} ${instruction}` : head;
}

function main() {
  const verdict = decide(readStdinInput());
  if (!verdict) return; // silence = allow
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: verdict.decision,
        permissionDecisionReason: verdict.reason,
        // Injected into the model's context. If a Claude Code build ignores this field on
        // PreToolUse it is simply dropped — the gate itself is unaffected either way.
        additionalContext: noticeFor(verdict.decision, verdict.instruction),
      },
    }),
  );
}

// Only self-run when invoked directly (so tests can require this module without side effects).
if (require.main === module) {
  try {
    main();
  } catch {
    /* a crashing guard must never wedge a session */
  }
}

module.exports = {
  main,
  decide,
  noticeFor,
  publishDetail,
  bareToolName,
  unrecordedWikiVerdict,
  commandSegments,
  unquoted,
  readOnlyPreview,
  GATED_TOOLS,
  CONTENT_WRITE_TOOLS,
  OUTWARD_TOOLS,
  COMMONGROUND_TOOLS,
  GATED_COMMANDS,
  SHELL_DIALECT,
  PREVIEW_FLAGS,
  UNKNOWN_SHELL_NOTE,
};
