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
 * WHAT THE TEXT DOES NOT SPELL OUT (SER-331). Two families used to publish with no dialog, and
 * neither does now:
 *   - a NAME this same command binds to the binary or to a verb: a variable, a function or an alias
 *     (`CG=…/commonground; node "$CG" push`, `cg() { node … "$@"; }; cg push`, `V=push;
 *     commonground $V`), PowerShell's `$cg =`, `${cg} =`, Set-Variable and Set-Alias, and cmd's
 *     `set V=push&& commonground %V%`. {@link readNames} reads the definitions once per command
 *     and {@link gatedIn} reads every use through them;
 *   - a VERB SLOT the guard cannot read while the CLI is being run: a variable, a substitution, a
 *     splat, `%V%`, a glob that matches a gated verb, a redirect target nested past what
 *     {@link REDIRECT} pairs, or a runner that appends its input (`xargs`, `parallel`, `find
 *     -exec`). It may be `status`, so this asks in words of its own ({@link unreadableRun});
 *   - since round 2, a PROGRAM SLOT the guard cannot read before a literal gated verb, through a
 *     name this command defines ({@link unreadableProgram}, the narrowed D1), a positional parameter
 *     it sets (`set -- …/commonground; node "$1" push`, `sh -c 'node "$0" push' …/commonground`), or
 *     a token an earlier pipeline stage that names the binary fills (`… | xargs -I{} node {} push`,
 *     `… | ForEach-Object { & $_ push }`),
 *     and a lookup inline in the program slot (`node "$(which commonground 2>/dev/null)" push`, `&
 *     (Get-Command commonground -CommandType Application) push`, {@link collapseLookups}).
 * Argv arrays (`['commonground', 'push']`), cmd's `^` escape and PowerShell's literal concatenation
 * are read by the loose view, and `pwsh -EncodedCommand` is decoded and read as PowerShell. Where the
 * CLI is RUN is read with quotes understood ({@link quoteMask}): a mention inside a grep pattern, a
 * commit message or a heredoc's prose asks nothing.
 *
 * ACCEPTED RESIDUALS. These still publish with no dialog, and publish-guard.test.ts pins each one
 * as a known ALLOW, so closing one later shows up as a deliberate test change. In each, what
 * decides it is not in the text this hook receives:
 *   - a variable in the program slot that this command never defines: `node "$CG" push`, and
 *     PowerShell's `& $cg push` or `Start-Process $cg -ArgumentList push`. Its value came from the
 *     environment, the user's profile or (if the PowerShell tool keeps variables between calls, a
 *     SER-329 question) an earlier call. Asking there would also ask for `node "$SCRIPT" import`
 *     in every unrelated repo, which the scope rule above forbids. A name this command DOES define
 *     asks (the narrowed D1), but one of unknown value only in a command that names the binary, so
 *     `GIT=$(command -v git); "$GIT" push` in another repo is never asked about;
 *   - an alias or function defined in the user's profile, which Claude Code sources into every
 *     Bash call: `cg push`;
 *   - a script, Makefile or package script whose body runs the publish: `bash ./publish.sh`;
 *   - a variable inside another interpreter: `python3 -c "c = 'commonground'; subprocess.run([c,
 *     'push'])"`;
 *   - a program slot filled from another program's output where the text gives no sign of it: a
 *     plain replace-string (`… | xargs -I CG node CG push`), a stage that does not name the binary
 *     (`cat paths.txt | xargs -I{} node {} push`), a lookup whose body holds a heredoc;
 *   - text computed while the command runs and handed to another shell or program as code: `echo
 *     <base64> | base64 -d | sh`, character codes, a reversed string, and a program name assembled
 *     by a substitution (`$(echo common)ground push`), where no word of the text is the binary;
 *   - a pattern that starts and ends with `*` and opens its line (`*ground* push`, run where the
 *     binary sits): that is how markdown writes emphasis (`**On** push to main` in a PR body), and a
 *     commit message or heredoc line is read as a command start. After a runner it still asks.
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
    // A command the guard cannot read (SER-331): the verb, or the program, comes from a variable, a
    // substitution, a pattern or another program's input. It may well be `status`, so neither
    // channel may claim a publish: the push wording above would say "commits everything" about a
    // read, and a dialog that cries wolf is the one people stop reading. The instruction arrives
    // BEFORE the user answers, so it is conditional and forward-looking: advice to rewrite and run
    // the call would be a second publish if they said yes and a re-ask if they said no (the notice
    // head and push.md both forbid that).
    unreadable: {
      reason:
        'CommonGround cannot read exactly what this runs: the command it gives the CommonGround ' +
        'tool, or the tool itself, comes from a variable, a pattern or another program. If it ' +
        'runs push, import or sync, it publishes your CommonGround wiki, and everyone who shares ' +
        'it starts from those changes.',
      instruction:
        'The guard could not read which CommonGround command this call runs: its verb comes from ' +
        "a variable, a substitution, a glob or another program's input, or the program is a " +
        'pattern. If this call publishes, the user is deciding on it now: do not send it again in ' +
        'another spelling, and if they decline, stop. Next time, write the CommonGround command ' +
        `with its verb as a plain word: a read such as \`${cliCall('status')}\` then runs with no ` +
        `prompt, and a publish is shown first as \`${cliCall('push --dry-run')}\` and then run as ` +
        'push, whose own dialog is its confirmation, so do not ask a yes/no question of your own ' +
        'as well. Consent is per publish and never carries forward from an earlier one.',
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
 *     hide a flag. U+2018 to U+201B are single quotes and U+201C to U+201E double ones; U+201F is
 *     not a quote at all. In PowerShell a word also starts after a `,`, so `x,# --dry-run` is a
 *     comment. (SER-331 checked every rule in this paragraph against pwsh 7.6.6's own parser.)
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
 * included), '#' for a comment; `sep`, the separator that ended it (`|`, and in bash and zsh `|&`,
 * is a pipe into the next one, SER-331; a line end is `\n`, so a heredoc's body is told from its
 * opening line, round 5 of the SER-331 review); and `joined`, whether a line continuation was
 * consumed in it. An escape and the character after it are consumed as a PAIR, so
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
  let joinedHere = false;
  // The last character added when the shell reads it bare, else ''. Kept aside rather than read
  // back off `text`, which is still being concatenated and would be flattened on every read.
  let lastBare = '';
  const add = (chars, kinds) => {
    text += chars;
    kind += kinds;
    lastBare = kinds[kinds.length - 1] === ' ' ? chars[chars.length - 1] : '';
  };
  const cut = (sep = ';') => {
    out.push({ text, kind, sep, joined: joinedHere });
    joinedHere = false;
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
        cut('\n');
      } else add(c, '#');
      continue;
    }
    if (quote) {
      if (c === escape && quote !== "'") {
        const joined = !ps && quote === '"' ? continuation(i) : 0;
        if (joined) {
          i += joined - 1;
          joinedHere = true;
        }
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
        joinedHere = true;
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
      // `&&` / `||` are one separator, and so is bash and zsh's `|&` (a pipe that carries stderr
      // too); a lone `&` or `|` is also one.
      const sep = src[i + 1] === c ? c + c : !ps && c === '|' && src[i + 1] === '&' ? '|&' : c;
      i += sep.length - 1;
      cut(sep);
      continue;
    }
    if (c === ';' || lineEnd(c)) {
      cut(c === ';' ? ';' : '\n');
      continue;
    }
    add(c, ' ');
    wordStart = /\s/.test(c) || (ps ? /[(){},]/ : /[()<>]/).test(c);
  }
  cut();
  return out;
}

/**
 * `Start-Process commonground.cmd -ArgumentList push`: PowerShell's way to run a program with its
 * arguments in a list, where the verb never sits next to the binary for the regex to see. A folder
 * given as the working directory or a redirect file is not the program, so `Start-Process git
 * -ArgumentList push -WorkingDirectory C:\src\commonground` is not a publish (PowerShell accepts
 * any unambiguous prefix of a parameter name, hence `wo` and `red`, and pwsh 7.6.6 also lists
 * `RSO`, `RSE` and `RSI` as aliases of the three redirects, SER-331). The list may follow a colon
 * (`-ArgumentList:push`) and its verb may be spelled apart (pu`sh), so it is read in both views.
 */
const START_PROCESS = /\b(?:start-process|saps|start)\b/i;
const LISTED_VERB = /(?:^|[\s"',:])(?<verb>push|import|sync)(?=[\s"',;)]|$)/i;
const START_PROCESS_PATHS = /-(?:wo|red|rs[eio])\w*[\s:]+(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi;

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
const ANSI_C_ESCAPE =
  /\\(?:x([0-9A-Fa-f]{1,2})|u([0-9A-Fa-f]{1,4})|U([0-9A-Fa-f]{1,8})|([0-7]{1,3})|([abeEfnrtv\\'"?]))/g;
/** The one-letter escapes of `$'…'`, as bash and zsh decode them (`\n` is a newline). */
const ANSI_C_LETTERS = {
  a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v',
  '\\': '\\', "'": "'", '"': '"', '?': '?',
};
/** `$NAME`, `${…}` in any form (`${x:-}`, `${!x}`), and the special `$1`, `$@`, `$*`, `$#`, `$?`… */
const PARAMETER = /\$(?:\{[^{}]*\}|[A-Za-z_]\w*|[0-9@*#?$!-])/g;

/**
 * The body of a `$'…'` with its escapes decoded. With `quoted`, the result goes back between the
 * quotes, so a decoded `'` or `\` stays escaped (the string still ends where bash ends it).
 */
function decodeAnsiC(body, quoted = false) {
  return body.replace(ANSI_C_ESCAPE, (all, hex, u4, u8, octal, letter) => {
    const point = letter ? 0 : octal ? parseInt(octal, 8) : parseInt(hex || u4 || u8, 16);
    if (point > 0x10ffff) return all;
    const c = letter ? ANSI_C_LETTERS[letter] : String.fromCodePoint(point);
    return quoted && (c === "'" || c === '\\') ? `\\${c}` : c;
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
 * that may be empty (`commonground @args push`). And, since SER-331, the words of an argv array
 * (`['commonground', 'push']` in python or node), cmd's `^` escape (`pu^sh`), and a literal
 * concatenation (`iex ("commonground " + "push")`). Only ever used to FIND a publish, never to
 * exempt one, so reading too much into it costs a prompt and nothing else.
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
  let text = moveApart(
    ps
      ? withoutBlockComments(segment).replace(/--%/g, ' ').replace(/[$@]\(\s*\)|@[A-Za-z_]\w*/g, '')
      : segment,
    dialect,
  );
  if (!ps) text = text.replace(ANSI_C, (_, body) => decodeAnsiC(body));
  // A literal concatenation joins two strings in PowerShell only; in bash `+` is a word of its own,
  // and `'common' + 'ground'` there is another interpreter's code (an accepted residual).
  const joined = ps ? /["']\s*\+\s*["']/g : /(?!)/g;
  return ['', ' '].map((expansion) =>
    text
      .replace(PARAMETER, expansion)
      // An escaped quote is dropped with its escape (SER-331): a string another shell re-reads
      // (`bash -c "node \"<cli>\" push"`, `eval`, `ssh HOST "…"`) runs the words inside it.
      .replace(ps ? /`(?=[a-z\s"'])/gi : /\\(?=[a-z\s"'])/gi, '')
      .replace(/\^(?=[a-z])/gi, '')
      .replace(joined, '')
      .replace(/\$(?=["'])/g, '')
      .replace(/["']/g, '')
      .replace(/[{},[\]]/g, ' '),
  );
}

/**
 * A here-string's word and every redirect target moved to the end as commands of their own, and a
 * heredoc delimiter dropped: the part of {@link looseView} that {@link slotView} shares.
 */
function moveApart(text, dialect) {
  const moveTo = (list) => (_, word) => {
    list.push(word);
    return ' ';
  };
  const words = [];
  const targets = [];
  if (dialect !== 'ps') text = text.replace(HERE_STRING, moveTo(words)).replace(HEREDOC, ' ');
  text = [text, ...words].join(' ;').replace(REDIRECT[dialect], moveTo(targets));
  return [text, ...targets].join(' ;');
}

/**
 * The segment with its redirects, heredocs and PowerShell's inline comments and `--%` moved out of
 * the way, and every expansion LEFT IN PLACE: what {@link unreadableRun} reads the verb slot from.
 * A redirect between the binary and the next word is not that word (`commonground 2>&1
 * $(echo push)` runs argv [push] in bash 3.2), and neither is `2>&1 $v` in PowerShell.
 *
 * In bash a `$'…'` is decoded and kept between its quotes (SER-331): run by a shell, `bash -c
 * $'V=push\ncommonground $V'` is two commands, and read raw its binary was the word `…\ncommonground`.
 * A decoded newline is written as `;`, the same bound to the guard, so the quote still reads as
 * one string on one line.
 */
function slotView(segment, dialect) {
  if (dialect === 'ps') return moveApart(withoutBlockComments(segment).replace(/--%/g, ' '), dialect);
  return moveApart(segment, dialect).replace(ANSI_C, (_, body) => `$'${decodeAnsiC(body, true).replace(/\n/g, ';')}'`);
}

/*
 * NAMES THIS COMMAND BINDS (SER-331).
 *
 * `CG=…/commonground; node "$CG" push` published with no dialog: the binary and the verb were never
 * next to each other in the text. The fix is the smallest one that stays text-reading: collect what
 * the command itself defines, once, and read every later use through it. Nothing here is a shell;
 * a definition the text holds is followed once, and anything subtler is left to the unreadable-verb
 * ask below.
 */

/** What may stand before the binary in a value, and the binary itself up to where its word ends. */
const BIN_LEAD = String.raw`^|[\s/\\(=\x60{:+-]`;
const BIN_TAIL = String.raw`commonground(?:\.(?:cmd|exe|bat|ps1))?(?=$|[\s)}\x60;,])`;
/** A value that names the binary: a whole word, or the last part of a path or of a lookup. */
const BIN_VALUE = new RegExp(`(?:${BIN_LEAD})${BIN_TAIL}`, 'i');
/** A value whose first word is a gated verb. */
const VERB_VALUE = /^(push|import|sync)(?=$|[\s,;])/i;
/** Past this many tracked names in one command, the guard stops reading and asks. */
const MAX_NAMES = 50;
/** A value longer than this is read as the bare binary or verb it names, not written in whole. */
const MAX_VALUE = 512;
/** How much writing names in may add to one segment before the guard stops and asks instead. */
const MAX_GROWTH = 65_536;

/**
 * bash: `[export|local|readonly|typeset|declare -x] NAME=VALUE` and `alias NAME=VALUE`. The value
 * may be quoted, a `$(…)` with one level of nesting, a backtick run, a `${…}` (`CLI=${CLI:-…}`) or
 * escape pairs, and each alternative starts on a different character, so the scan stays linear.
 */
const SH_VALUE = String.raw`((?:"(?:[^"\\]|\\[\s\S])*"|'[^']*'|\$\((?:[^()]|\([^()]*\))*\)|` +
  String.raw`\x60[^\x60]*\x60|\$\{[^{}]*\}|\\[\s\S]|[^\s;&|()"'\x60\\])*)`;
const SH_ASSIGNMENT = new RegExp(
  String.raw`(?:^|[\s;&|(){}\x60!"'])(?:(alias)\s+|(?:export|local|readonly|typeset|declare)((?:\s+-[A-Za-z]+)*)\s+)?` +
    String.raw`([A-Za-z_]\w*)=${SH_VALUE}`,
  'dg',
);
/** bash `for NAME in WORDS`: the name takes each word in turn. */
const SH_FOR = /(?:^|[\s;&|(){}])for\s+([A-Za-z_]\w*)\s+in\s+([^;&|\n\r]*)/g;
/** `${NAME:=value}` and `${NAME=value}`: the value, unless the environment already set NAME. */
const SH_DEFAULT = /\$\{([A-Za-z_]\w*):?=([^{}]*)\}/g;
/** zsh's `functions[NAME]=body`, a function defined by assignment. */
const SH_FUNCTIONS = new RegExp(String.raw`(?:^|[\s;&|(){}])functions\[([^\]\s]+)\]=${SH_VALUE}`, 'g');
/**
 * `read`, `mapfile`, `readarray` and `printf -v`: they fill a name with a value the text does not
 * hold. Every identifier after them counts, option values included, which can only over-read.
 */
const SH_FILLS = /(?:^|[\s;&|(){}])(?:read|mapfile|readarray|printf[ \t]+-v)((?:[ \t]+[^\s;&|<>()]+)*)/g;
/**
 * PowerShell's `$a, $b = …`: each name gets one part of a value the text may not spell out. Only the
 * HEAD of a list may start a match (no `,` before it), or a long list with no `=` is rescanned from
 * every item: 208 s for a 512 KB run of `$a, ` before this lookbehind.
 */
const PS_MULTI = /(?:^|[\s;&|(){}\]])(?<!,\s*)(\$[\w:{}]+(?:\s*,\s*\$[\w:{}]+)+)\s*=(?!=)/g;
/**
 * PowerShell's `variable:` drive (`Set-Item variable:cg …`), and the two parameters that keep a
 * cmdlet's output past its pipeline: `-OutVariable` (`Get-Command commonground -OutVariable cg`) and
 * Tee-Object's `-Variable` (`… | Tee-Object -Variable cg`, round 4 of the SER-331 review), each by
 * every prefix pwsh 7.6.6 binds (`-ov`, `-OutV`; `-Var`, and `-V`, which Tee-Object reads as
 * `-Variable` rather than `-Verbose`). `-PipelineVariable` is gone once its pipeline ends (pwsh
 * 7.6.6), and the pipe rule reads its uses inside one; the error, warning and information variables
 * hold records, never a program.
 */
const PS_FILLS =
  /(?:^|[^$\w{])variable:([A-Za-z_]\w*)|(?:^|\s)-(?:ov|outv(?:a(?:r(?:i(?:a(?:b(?:le?)?)?)?)?)?)?|v(?:a(?:r(?:i(?:a(?:b(?:le?)?)?)?)?)?)?)(?:\s+|:)['"]?\+?([A-Za-z_]\w*)/gi;
/** A PowerShell variable scope, which names the same variable for this purpose. */
const PS_SCOPE = '(?:(?:env|global|script|local|private|using):)?';
/** PowerShell `$name = …`, `$env:NAME = …`, `${name} = …` and `+=`, to the end of the statement. */
const PS_ASSIGNMENT = new RegExp(
  String.raw`(?:^|[\s;&|(){}\]])\$(?:\{${PS_SCOPE}([^{}:]+)\}|${PS_SCOPE}([A-Za-z_]\w*))\s*\+?=(?!=)([^;|\n\r]*)`,
  'dgi',
);
/** Set-Variable, New-Variable, Set-Alias and New-Alias, by name or by alias (pwsh 7.6.6 lists all four). */
const PS_SETTER =
  /(?:^|[\s;&|(){}])(set-variable|new-variable|sv|nv|set-alias|new-alias|sal|nal)(?=\s)([^;|\n\r]*)/gi;
/** PowerShell `foreach ($name in …)`. */
const PS_FOREACH = /(?:^|[\s;&|(){}])foreach\s*\(\s*\$([A-Za-z_]\w*)\s+in\s+([^)\n\r;]*)/gi;
/** cmd's `set NAME=VALUE`, used as `%NAME%`, in either shell (`cmd /c "set V=push&& …"`). */
const CMD_SET = /(?:^|[\s;&|(){}"'])set\s+(?:\/a\s+)?"?([A-Za-z_]\w*)=([^"&|\n\r]*)/dgi;
/** The head of a function definition, up to and including its opening brace. */
const FUNCTION_HEAD = {
  sh: /(?:^|[\s;&|(){}])(?:function\s+([^\s(){}<>;&|$`'"]+)(?:\s*\(\s*\))?|([A-Za-z_][\w.:-]*)\s*\(\s*\))\s*\{/g,
  ps: /(?:^|[\s;&|(){}])(?:function|filter)\s+([^\s(){}$'"]+)(?:\s*\([^()]*\))?\s*\{/gi,
};
/** What a function body passes on from its call: `"$@"`, `$*`, `"$1"`, `"${@:2}"`, `@args`, `$args[0]`. */
const FORWARD = {
  sh: /"?\$(?:[@*1-9]|\{[@*1-9](?:[:#%/][^{}]*)?\})"?/g,
  ps: /[@$]args\b(?:\[\d+\])?|@PSBoundParameters\b/gi,
};

/** A name as the text spells it, keyed the way its shell looks it up. Variables and commands differ. */
function nameKey(kind, name, dialect) {
  const n =
    dialect === 'ps' ? name.toLowerCase().replace(/^(?:global|script|local|private|env|using):/, '') : name;
  return kind === 'var' ? `$${n}` : n;
}

/** A value's text without one layer of quotes around all of it. */
function unquote(value) {
  const m = /^(["'])([\s\S]*)\1$/.exec(value.trim());
  return m ? m[2] : value.trim();
}

/** Set-Variable/Set-Alias arguments: `-Name` and `-Value` by any prefix, else the first two positions. */
function setterDefinition(cmdlet, args) {
  const words = args.match(/"(?:[^"`]|`[\s\S])*"|'(?:[^']|'')*'|\S+/g) || [];
  const positional = [];
  let name;
  let value;
  for (let i = 0; i < words.length; i++) {
    const flag = /^-([a-z]+)(?::(.+))?$/i.exec(words[i]);
    if (!flag) {
      positional.push(words[i]);
      continue;
    }
    const p = flag[1].toLowerCase();
    if (/^(?:force|passthru|whatif|confirm|verbose|debug)$/.test(p)) continue;
    const v = flag[2] !== undefined ? flag[2] : words[++i];
    if ('name'.startsWith(p)) name = v;
    else if ('value'.startsWith(p)) value = v;
  }
  name = name ?? positional[0];
  if (!name) return null;
  const kind = /alias|^[sn]al$/i.test(cmdlet) ? 'alias' : 'var';
  return { kind, name: unquote(name), value: value ?? positional[1] ?? '', at: -1, multi: false };
}

/** The first word of a `for`/`foreach` list that names the binary or a verb, else ''. */
function listValue(list) {
  return (list.match(/[^\s,()'"@]+/g) || []).find((w) => BIN_VALUE.test(w) || VERB_VALUE.test(w)) || '';
}

/**
 * Every variable and alias definition in the command, in the grammar of `dialect` (and cmd's `set`).
 * A definition whose value the text does not hold (`read`, `printf -v`, `declare -n`, PowerShell's
 * `$a, $b =`) comes back with a null value: it counts as a definition, so the name is one this
 * command defines (the narrowed D1, {@link unreadableProgram}) and a preview through it asks.
 */
function* definitions(cmd, dialect) {
  const unknown = (name) => ({ kind: 'var', name, value: null, at: -1, multi: true });
  if (dialect === 'ps') {
    for (const m of cmd.matchAll(PS_ASSIGNMENT)) {
      const g = m[1] !== undefined ? 1 : 2;
      yield { kind: 'var', name: m[g], value: m[3], at: m.indices[g][0], end: m.indices[3][1], multi: false };
    }
    for (const m of cmd.matchAll(PS_SETTER)) {
      const d = setterDefinition(m[1], m[2]);
      if (d) yield d;
    }
    for (const m of cmd.matchAll(PS_FOREACH)) {
      yield { kind: 'var', name: m[1], value: listValue(m[2]), at: -1, multi: true };
    }
    for (const m of cmd.matchAll(PS_MULTI)) {
      for (const name of m[1].split(',')) yield unknown(name.trim().replace(/^\$\{?(?:[a-z]+:)?|\}$/gi, ''));
    }
    for (const m of cmd.matchAll(PS_FILLS)) yield unknown(m[1] || m[2]);
  } else {
    for (const m of cmd.matchAll(SH_ASSIGNMENT)) {
      const kind = m[1] ? 'alias' : 'var';
      // `declare -n R=CG` makes R another name for CG: its value is not the text after the `=`.
      if (/n/.test(m[2] || '')) yield unknown(m[3]);
      else yield { kind, name: m[3], value: m[4], at: m.indices[3][0], end: m.indices[4][1], multi: false };
    }
    for (const m of cmd.matchAll(SH_FOR)) {
      yield { kind: 'var', name: m[1], value: listValue(m[2]), at: -1, multi: true };
    }
    for (const m of cmd.matchAll(SH_DEFAULT)) yield { kind: 'var', name: m[1], value: m[2], at: -1, multi: true };
    for (const m of cmd.matchAll(SH_FUNCTIONS)) yield { kind: 'alias', name: m[1], value: m[2], at: -1, multi: false };
    for (const m of cmd.matchAll(SH_FILLS)) {
      for (const w of m[1].match(/\S+/g) || []) if (/^[A-Za-z_]\w*$/.test(w)) yield unknown(w);
    }
  }
  for (const m of cmd.matchAll(CMD_SET)) {
    yield { kind: 'var', name: m[1], value: m[2], at: m.indices[1][0], end: m.indices[2][1], multi: false };
  }
}

/**
 * Where each function body lies, over the WHOLE command (SER-331): per segment, the spans that sit
 * inside a body, with the function they belong to, and whether that body mentions the binary.
 *
 * Found across segments, not within one, because a body is split wherever a command ends: the
 * multi-line `cg() {⏎ node … "$@"⏎}`, `cg() { cd ~/w && node … "$@"; }`, and PowerShell's
 * `function cg { & node … @args }`, where the call operator `&` is a separator here. Braces are
 * counted outside quotes only. bash reads `{` and `}` as reserved words only where a command
 * starts, so only those count (a stray `echo }` is an argument); PowerShell counts every brace except
 * a `${…}` name. A brace this misses can only close a body EARLY, which makes a forward after it an
 * unreadable verb, which asks: the safe way to be wrong. Each span belongs to the innermost open
 * body, so the work is linear however deep the nesting.
 */
function functionBodies(scanned, dialect) {
  const ps = dialect === 'ps';
  const fns = new Map();
  const spans = scanned.map(() => []);
  const stack = [];
  let depth = 0;
  scanned.forEach(({ text, kind }, i) => {
    const heads = new Map();
    for (const m of bareView({ text, kind }).matchAll(FUNCTION_HEAD[dialect])) {
      // `function global:cg { … }` is called as `cg`.
      const name = (m[1] || m[2]).replace(/^(?:global|script|local|private):/i, '');
      const key = nameKey('fn', name, dialect);
      const fn = fns.get(key) || { name, defs: 0, mentions: false };
      fns.set(key, fn);
      fn.defs++;
      heads.set(m.index + m[0].length - 1, fn);
    }
    const first = text.search(/\S/);
    let from = 0;
    const close = (to) => {
      const top = stack[stack.length - 1];
      if (top && to > from) {
        spans[i].push([from, to, top.fn]);
        // The binary as a word or a path's last part, not a package name (`@commonground/api`).
        if (BIN_VALUE.test(text.slice(from, to).replace(/["']/g, ' '))) top.fn.mentions = true;
      }
      from = to;
    };
    let nameBraces = 0;
    for (let j = 0; j < text.length; j++) {
      const c = text[j];
      if (kind[j] !== ' ' || (c !== '{' && c !== '}')) continue;
      if (heads.has(j)) {
        close(j + 1);
        stack.push({ fn: heads.get(j), depth: ++depth });
      } else if (c === '{') {
        if (ps && text[j - 1] === '$') nameBraces++;
        else if (ps || (j === first && /^\s?$/.test(text[j + 1] || ''))) depth++;
      } else if (ps && nameBraces > 0) {
        nameBraces--;
      } else if (ps || j === first) {
        const top = stack[stack.length - 1];
        if (top && top.depth === depth) {
          close(j);
          stack.pop();
          const parent = stack[stack.length - 1];
          if (parent && top.fn.mentions) parent.fn.mentions = true;
        }
        if (depth > 0) depth--;
      }
    }
    close(text.length);
  });
  return { fns, spans };
}

/**
 * A segment with every forward (`"$@"`, `$1`, `@args`, …) inside the body of a function that
 * mentions the binary blanked to underscores. Those call sites are read through the function
 * instead, so `cg() { node … "$@"; }; cg status` is not an unreadable verb, while `sh -c
 * 'commonground "$@"' _ push`, which has no function to read through, still is.
 */
function maskForwards(text, spans, dialect) {
  const live = spans.filter(([, , fn]) => fn.mentions);
  if (!live.length) return text;
  let s = 0;
  return text.replace(FORWARD[dialect], (all, offset) => {
    while (s < live.length && live[s][1] <= offset) s++;
    return s < live.length && live[s][0] <= offset ? '_'.repeat(all.length) : all;
  });
}

/** The context of a command with no names worth reading: every lookup comes back empty. */
const NO_NAMES = {
  cmd: '',
  dialect: 'sh',
  uses: null,
  calls: null,
  overflow: false,
  mentions: false,
  records: null,
  lookup: () => undefined,
  masked: () => undefined,
};

/** The name a `uses` match captured, whichever of its alternatives matched. */
const usedName = (m) => m.slice(1).find((g) => typeof g === 'string');

/**
 * What this command binds that a later part of it may use (SER-331): the variables, aliases and
 * functions whose value names the binary or starts with a gated verb, and the regexes that find
 * their uses. Built once per command and dialect. Every definition is counted, tracked or not,
 * because a preview spelled through a name keeps its exemption only when that name has exactly one
 * ({@link previewThroughNames}), and a program slot spelled through ANY name this command defines is
 * read by {@link unreadableProgram}.
 *
 * A use is `$NAME`, `${NAME…}` and cmd's `%NAME%`; in zsh also `${=NAME}`, `${~NAME}`, `${(f)NAME}`
 * and `$~NAME`, which split or glob the value; in PowerShell a member or index after the name
 * (`$cg.Source`, `$cg[0]`), which is written in with the name. A call to a function or an alias may
 * be spelled with a backslash before it or quotes inside it (`\cg`, `c''g`, `"c"g`): the shell
 * removes both before it looks the name up.
 */
function readNames(cmd, dialect, scanned) {
  const ps = dialect === 'ps';
  const records = new Map();
  for (const d of definitions(cmd, dialect)) {
    const key = nameKey(d.kind, d.name, dialect);
    const r = records.get(key) || {
      kind: d.kind,
      name: d.name,
      defs: 0,
      at: -1,
      multi: false,
      value: null,
      first: null,
      bin: false,
      verb: null,
    };
    records.set(key, r);
    r.defs++;
    r.multi = r.multi || d.multi;
    if (d.value === null) continue;
    if (r.defs === 1) r.first = d.value;
    const bare = String(d.value).replace(/["']/g, '').trim();
    if (!r.bin && BIN_VALUE.test(bare)) Object.assign(r, { bin: true, value: d.value, at: d.at, end: d.end });
    else if (!r.bin && !r.verb && VERB_VALUE.test(bare)) {
      Object.assign(r, { verb: VERB_VALUE.exec(bare)[1].toLowerCase(), value: d.value, at: d.at });
    }
  }
  const { fns, spans } = functionBodies(scanned, dialect);
  for (const [key, fn] of fns) {
    if (fn.mentions) records.set(key, { kind: 'fn', name: fn.name, defs: fn.defs, at: -1, bin: true });
  }
  const tracked = [...records.values()].filter((r) => r.bin || r.verb);
  const masked = (i) => maskForwards(scanned[i].text, spans[i], dialect);
  const base = {
    ...NO_NAMES,
    cmd,
    dialect,
    masked,
    records,
    mentions: /commonground/i.test(cmd),
    lookup: (kind, name) => records.get(nameKey(kind, name, dialect)),
  };
  if (!tracked.length) return base;
  if (tracked.length > MAX_NAMES) return { ...base, overflow: true };
  const escaped = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const alt = (list, spell = escaped) =>
    list
      .map((r) => spell(r.name))
      .sort((a, b) => b.length - a.length)
      .join('|');
  const vars = alt(tracked.filter((r) => r.kind === 'var'));
  const commands = alt(
    tracked.filter((r) => r.kind !== 'var'),
    (name) => [...name].map(escaped).join(`["']*`),
  );
  const flags = ps ? 'gi' : 'g';
  const uses = ps
    ? String.raw`\$\{${PS_SCOPE}(${vars})\}|\$${PS_SCOPE}(${vars})(?![\w:])(?:\.\w+|\[[^\]\n]*\])*|%(${vars})%`
    : String.raw`\$\{(?:\([^()]*\))?[=~^]*(${vars})(?:[^\w}][^{}]*)?\}|\$[=~^]*(${vars})(?!\w)|%(${vars})%`;
  return {
    ...base,
    uses: vars ? new RegExp(uses, flags) : null,
    calls: commands
      ? new RegExp('(^|[\\s;&|(){}`!"\'\\\\])(' + commands + ')(?=[\\s;&|)"\'`]|$)', flags)
      : null,
  };
}

/** A call's name as the shell looks it up: with the quotes and a leading backslash removed. */
const calledName = (spelled) => spelled.replace(/["'\\]/g, '');

/** The substitution for a name, as its definition wrote it (a long value reads as the bare word). */
const writtenIn = (r) => (r.kind === 'fn' || r.value.length > MAX_VALUE ? stoodIn(r) : unquote(r.value));
/** The substitution for a name, as the one word that matters: the binary, or the verb. */
const stoodIn = (r) => (r.bin ? 'commonground' : r.verb);

/**
 * `text` with every use of a tracked name replaced by `pick(record)`, or null when that would grow
 * it by more than MAX_GROWTH (60 uses of a 500-character value do not get written in; they ask).
 */
function substitute(text, ctx, pick) {
  let room = MAX_GROWTH;
  const put = (r) => {
    const v = room > 0 && r ? pick(r) : '';
    room -= v.length;
    return v;
  };
  let out = text;
  if (ctx.uses) out = out.replace(ctx.uses, (...m) => put(ctx.lookup('var', usedName(m.slice(0, -2)))));
  if (ctx.calls) {
    out = out.replace(ctx.calls, (_, lead, n) => (lead === '\\' ? ' ' : lead) + put(ctx.lookup('fn', calledName(n))));
  }
  return room < 0 ? null : out;
}

/**
 * The segment read through the names it uses, in two readings: each name as its definition wrote
 * it (`CG="node … push"; $CG` is a publish in full), and each name as the one word it stands for
 * (`$cg = (Get-Command commonground).Source; & $cg push` is `commonground push`). [] when it uses
 * none, null when writing them in would be too large to read. FIND-ONLY, like the loose view: a
 * reading here never exempts anything by itself. `ambiguous` marks a reading through a name with
 * more than one definition, or a loop variable: which value it holds is not in the text.
 */
function resolvedViews(text, ctx) {
  const uses = (ctx.uses && text.search(ctx.uses) !== -1) || (ctx.calls && text.search(ctx.calls) !== -1);
  if (!uses) return [];
  const views = [substitute(text, ctx, writtenIn), substitute(text, ctx, stoodIn)];
  if (views.includes(null)) return null;
  const records = [
    ...(ctx.uses ? [...text.matchAll(ctx.uses)].map((m) => ctx.lookup('var', usedName(m))) : []),
    ...(ctx.calls ? [...text.matchAll(ctx.calls)].map((m) => ctx.lookup('fn', calledName(m[2]))) : []),
  ];
  views.ambiguous = records.some((r) => r && (r.defs > 1 || r.multi));
  return views;
}

/*
 * A VERB SLOT THE GUARD CANNOT READ (SER-331).
 *
 * `commonground $V`, `commonground $(echo push)`, `commonground p*`, `echo push | xargs
 * commonground`: the verb is not in the text, so no view finds it. When the CLI is being RUN and
 * the word in its verb slot is one the guard cannot read, that is an uncertain verdict, and the
 * header's rule says uncertainty asks. It asks only when the binary is the program: `grep -n
 * commonground $F`, `git log -- apps/commonground $X` and `xargs grep commonground` are not.
 */

const BIN_NAME = /^commonground(?:\.(?:cmd|exe|bat|ps1))?$/i;
const BIN_NAMES = ['commonground', 'commonground.cmd', 'commonground.exe', 'commonground.bat', 'commonground.ps1'];
const GATED_VERBS = ['push', 'import', 'sync'];
/** A run of word characters, split where a shell splits words or starts a command. */
const RUN_WORD = /[^\s;&|"'()`<>]+/g;
/**
 * One shell word at a position: quoted runs, escape pairs and plain characters. A bracket is part of
 * the word here, so `$(:)` and `$(echo push)` are read as the substitutions they are.
 */
const NEXT_WORD = {
  sh: /(?:"(?:[^"\\]|\\[\s\S])*"|'[^']*'|\\[\s\S]|[^\s;&|<>"'\\])+/y,
  ps: /(?:"(?:[^"`]|`[\s\S])*"|'(?:[^']|'')*'|`[\s\S]|[^\s;&|<>"'`])+/y,
};
/** How far back from the binary the guard looks for the start of its command. */
const WINDOW = 512;
const ASSIGNMENT = /^[A-Za-z_]\w*=/;
/**
 * Shells, and the programs that hand a shell their `-c` string (`su`, `flock`, `script`, `npx`).
 * `csh` and `tcsh` ship in /bin on every Mac. BusyBox needs no entry: its applet (`busybox sh -c`)
 * is the shell word.
 */
const SHELLS = new Set([
  'sh', 'bash', 'zsh', 'dash', 'ksh', 'mksh', 'ash', 'fish', 'csh', 'tcsh', 'pwsh', 'powershell',
  'su', 'script', 'flock', 'npx',
]);
/** A word's last path part, lowercased and without `.exe`: the program it names. */
const programName = (w) =>
  w.slice(Math.max(w.lastIndexOf('/'), w.lastIndexOf('\\')) + 1).toLowerCase().replace(/\.exe$/, '');
/** Could `w` be a shell? A known one, or a program the text does not spell (`$SHELL`, `"$0"`). */
const maybeShell = (w) => SHELLS.has(programName(w)) || w.startsWith('$');

/**
 * An option of ANY program whose next word it runs: PowerShell's `-Command` by any prefix, cmd's
 * `/c` and `/k`, and find's `-exec` family; and a shell's `-c` (case matters: `make -C dir` is a
 * folder), bundled or not (`bash -ec`, `sh -euc`, `zsh -fc`), counted only after a word that may be
 * a shell (`afterShell`, SER-331): `grep -c "CommonGround" $F` and `grep -ic` count lines.
 */
const runsNext = (w, afterShell = false) =>
  /^(?:-exec(?:dir)?|-ok(?:dir)?)$/.test(w) ||
  /^(?:-co(?:m(?:m(?:a(?:n(?:d)?)?)?)?)?|\/[ck])$/i.test(w) ||
  (afterShell && /^-[a-z]*c[a-z]*$/.test(w));
/** Start-Process switches, the only options of it that take no value. */
const SWITCHES = new Set([
  '-wait', '-nonewwindow', '-nnw', '-passthru', '-loaduserprofile', '-lup', '-usenewenvironment',
  '-whatif', '-wi', '-confirm', '-cf', '-verbose', '-vb', '-debug', '-db',
]);

/**
 * Programs that run the program named after their own options, and how to step over those
 * options: the ones that take a value (`sudo -u me`, `nice -n 5`), positional words before the
 * program (`timeout 5`, `ssh host`), `NAME=value` words (`env`), a named program option
 * (Start-Process `-FilePath`), and whether the runner APPENDS its input to the program's argv
 * (`xargs`, `parallel`), in which case a missing verb is as unreadable as a variable one. A bare
 * `--` is no runner of its own (`git log -- apps/commonground $X` runs git); after a runner it is
 * one more option to step over. A package runner runs a program only through its subcommand
 * (`pnpm exec`, `npm exec`, `yarn dlx`, `bun x`): `pnpm commonground` would run a package script.
 */
const RUNNERS = new Map([
  ...[
    '!', '.', 'builtin', 'call', 'command', 'do', 'elif', 'else', 'eval', 'gcm',
    'get-command', 'if', 'iex', 'invoke-expression', 'nohup', 'then', 'time', 'type', 'until',
    'where', 'which', 'while', 'setsid', 'unbuffer', 'pnpx',
  ].map((name) => [name, {}]),
  // SER-331: macOS `arch` and `caffeinate` (`-t 100`, `-w PID`), BSD `script` (its file comes
  // first), util-linux's scheduling runners.
  ['arch', { valued: new Set(['-arch', '-d', '-e']) }],
  ['caffeinate', { valued: new Set(['-t', '-w']) }],
  ['script', { valued: new Set(['-B', '-E', '-I', '-O', '-T', '-m', '-t']), positional: 1 }],
  ['flock', { valued: new Set(['-E', '-w', '--conflict-exit-code', '--timeout']), positional: 1 }],
  ['chrt', { valued: new Set(['-D', '-P', '-T', '--sched-deadline', '--sched-period', '--sched-runtime']), positional: 1 }],
  ['taskset', { positional: 1 }],
  ['ionice', { valued: new Set(['-c', '-n', '-p', '-P', '-u', '--class', '--classdata']) }],
  ['watch', { valued: new Set(['-n', '--interval']) }],
  ['npx', { valued: new Set(['-p', '-w', '--package', '--workspace']) }],
  ['bunx', { valued: new Set(['-p', '--package']) }],
  ['pnpm', { valued: new Set(['-C', '-F', '--dir', '--filter', '--filter-prod']), sub: new Set(['exec', 'dlx']) }],
  ['npm', { valued: new Set(['-p', '-w', '--package', '--prefix', '--workspace']), sub: new Set(['exec', 'x']) }],
  ['yarn', { valued: new Set(['--cwd']), sub: new Set(['exec', 'dlx']) }],
  ['bun', { sub: new Set(['x']) }],
  ['exec', { valued: new Set(['-a']) }],
  ...['node', 'nodejs'].map((name) => [
    name,
    { valued: new Set(['-r', '--require', '--import', '--loader', '--experimental-loader']) },
  ]),
  ['sudo', {
    valued: new Set([
      '-C', '-D', '-g', '-h', '-p', '-R', '-r', '-T', '-t', '-U', '-u', '--chdir', '--close-from',
      '--group', '--host', '--other-user', '--prompt', '--role', '--type', '--user',
    ]),
  }],
  ['doas', { valued: new Set(['-C', '-u']) }],
  ['env', { valued: new Set(['-C', '-P', '-S', '-u', '--chdir', '--split-string', '--unset']), assign: true }],
  ['nice', { valued: new Set(['-n', '--adjustment']) }],
  ['timeout', { valued: new Set(['-k', '-s', '--kill-after', '--signal']), positional: 1 }],
  ['stdbuf', { valued: new Set(['-e', '-i', '-o']) }],
  ['ssh', {
    valued: new Set([
      '-B', '-b', '-c', '-D', '-E', '-e', '-F', '-I', '-i', '-J', '-L', '-l', '-m', '-O', '-o', '-p',
      '-Q', '-R', '-S', '-W', '-w',
    ]),
    positional: 1,
  }],
  ['wsl', { valued: new Set(['-d', '-u', '--cd', '--distribution', '--user']) }],
  ['xargs', {
    valued: new Set([
      '-a', '-d', '-E', '-I', '-J', '-L', '-n', '-P', '-R', '-S', '-s', '--arg-file', '--delimiter',
      '--eof', '--max-args', '--max-chars', '--max-lines', '--max-procs', '--process-slot-var',
    ]),
    appends: true,
  }],
  ['parallel', {
    valued: new Set([
      '-a', '-C', '-d', '-E', '-I', '-j', '-L', '-l', '-N', '-n', '-P', '-S', '--arg-file', '--colsep',
      '--delimiter', '--jobs', '--max-args', '--max-lines', '--sshlogin',
    ]),
    appends: true,
  }],
  ...['start-process', 'saps', 'start'].map((name) => [
    name,
    { valued: 'all', program: /^-(?:f[a-z]*|path|pspath)$/i, startProcess: true },
  ]),
]);

/**
 * Does `spec`'s option `w` take the next word as its value? Case matters for a Unix program (`sudo
 * -H` is a flag, `sudo -h host` is not); Start-Process, whose options are nearly all valued, is read
 * case-insensitively through its switch list.
 */
function takesValue(spec, w) {
  if (spec.valued === 'all') return !SWITCHES.has(w.toLowerCase());
  return !!spec.valued && spec.valued.has(w);
}

/**
 * Starting at `words[i]`, is the word right after `words` run as a program? Steps over `NAME=value`
 * prefixes, then any chain of runners and their options. Returns what the chain says about the
 * program (it APPENDS input; it is Start-Process), or null when some other program runs.
 */
function runChain(words, i) {
  let appends = false;
  let startProcess = false;
  while (i < words.length && ASSIGNMENT.test(words[i])) i++;
  while (i < words.length) {
    const spec = RUNNERS.get(programName(words[i]));
    if (!spec) return null;
    appends = appends || !!spec.appends;
    startProcess = startProcess || !!spec.startProcess;
    let positional = spec.positional || 0;
    let sub = spec.sub; // `pnpm exec`: the runner runs a program only through this word
    for (i++; i < words.length; ) {
      const w = words[i];
      if (spec.program && spec.program.test(w)) return i + 1 === words.length ? { appends, startProcess } : null;
      if (spec.assign && ASSIGNMENT.test(w)) i++;
      else if (w.length > 1 && w[0] === '-') i += /[:=]/.test(w) || !takesValue(spec, w) ? 1 : 2;
      else if (sub) {
        if (!sub.has(w.toLowerCase())) return null;
        sub = null;
        i++;
      } else if (positional > 0) {
        positional--;
        i++;
      } else break;
    }
    if (sub) return null;
  }
  return i === words.length ? { appends, startProcess } : null;
}

/**
 * Which characters of `view` the shell reads as quoted data (SER-331): `kind` is ' ' for code (the
 * quote marks included) and 'q' for data, and `open[j]` is where the quoted run holding `j` opens.
 * A `$(…)` inside "…" is code again, and in bash so is a backtick run there. It is what lets
 * {@link runsAt} tell a separator from a character of a grep pattern or a commit message: `grep -E
 * "(^|x)commonground (a|b)"` runs grep. One pass, with a stack as deep as the nesting. `code` is
 * `view` with every quoted bound blanked, built once so each look-back is a slice.
 *
 * A view that spans lines is read TWICE, and a binary counts as run if either reading says so
 * (`carry`, round 3 of the SER-331 review). The first starts every line with no quote open, because
 * an apostrophe in a heredoc body is not a quote (`It's done.` must not hide the command after the
 * body). The second carries quotes across lines as bash does, because a quote that CLOSES a
 * multi-line commit message or `echo 'a⏎b'` read as one that opens hid the substitution after it
 * (`… -m 'Title⏎⏎Body' "$(commonground …)"`). Neither reading alone is safe; together they can only
 * read more as run.
 */
function quoteMask(view, dialect, carry = false) {
  const mask = quoteKinds(view, dialect, carry);
  const bounds = BOUNDS[dialect];
  let code = '';
  for (let j = 0; j < view.length; j++) code += mask.kind[j] !== ' ' && bounds.includes(view[j]) ? '_' : view[j];
  return carry || !view.includes('\n') ? { ...mask, code } : { ...mask, code, carry: quoteMask(view, dialect, true) };
}

/** Each reading a {@link quoteMask} holds: the line-by-line one, and the carried one when it spans lines. */
const readingsOf = (mask) => (mask.carry ? [mask, mask.carry] : [mask]);

/** The pass behind {@link quoteMask}: `kind` and `open` only. */
function quoteKinds(view, dialect, carry = false) {
  const ps = dialect === 'ps';
  const escape = ps ? '`' : '\\';
  const kind = [];
  const open = new Int32Array(view.length).fill(-1);
  const stack = [];
  for (let i = 0; i < view.length; i++) {
    const c = view[i];
    if (c === '\n' && !carry) {
      // The line-by-line reading: no quote is carried into the next line (see quoteMask).
      stack.length = 0;
      kind.push(' ');
      continue;
    }
    const top = stack[stack.length - 1];
    if (top && top.quote) {
      if (c === escape && top.quote !== "'" && i + 1 < view.length) {
        kind.push('q', 'q');
        open[i] = open[i + 1] = top.at;
        i++;
      } else if (c === top.quote[top.quote.length - 1]) {
        stack.pop();
        kind.push(' ');
      } else if (top.quote === '"' && c === '$' && view[i + 1] === '(') {
        stack.push({ depth: 1 });
        kind.push(' ', ' ');
        i++;
      } else if (top.quote === '"' && !ps && c === '`') {
        stack.push({ tick: true });
        kind.push(' ');
      } else {
        kind.push('q');
        open[i] = top.at;
      }
      continue;
    }
    if (c === escape && i + 1 < view.length) {
      kind.push(' ', 'q');
      i++;
      continue;
    }
    const quote = c === '"' || c === "'" ? c : !ps && c === '$' && view[i + 1] === "'" ? "$'" : '';
    if (quote) {
      stack.push({ quote, at: i });
      for (let k = 0; k < quote.length; k++) kind.push(' ');
      i += quote.length - 1;
      continue;
    }
    if (top && top.depth !== undefined) {
      if (c === '(') top.depth++;
      else if (c === ')' && --top.depth === 0) stack.pop();
    } else if (top && top.tick && c === '`') stack.pop();
    kind.push(' ');
  }
  return { kind: kind.join(''), open };
}

/**
 * Is the binary at `at` in `view` RUN? Read back to the start of its command (a separator, a
 * bracket, a backtick; in PowerShell also the `=` of an assignment), then forward through
 * {@link runChain}: the binary is the command's first word, or the program a chain of runners
 * starts. Failing that, it is the word after an option that runs its next word (`bash -c
 * 'commonground $V'`, `find -exec`). The look-back is bounded, and a command longer than it is taken
 * as run, so padding cannot hide a runner.
 *
 * With a {@link quoteMask} (SER-331), a separator inside quotes is no command start, and a binary
 * INSIDE a quoted string runs only when that string is itself run as a command: the program a chain
 * starts (`eval "…"`, `ssh host "…"`) or the value of an option that runs its next word (`bash -c
 * "cd /w && commonground $V"`). Such a string is then read from its own start, every bound in it
 * counting. `git commit -m "fix; commonground $V"` and `grep "(commonground $V)"` run nothing of
 * ours. A view read two ways (a quote mask's `carry`) runs the binary if either reading does.
 */
function runsAt(view, at, dialect, mask) {
  if (!mask) return runFrom(view, at, dialect, view);
  return readingsOf(mask).reduce((run, reading) => run || runsIn(view, at, dialect, reading), null);
}

/** {@link runsAt} under one reading of the quotes. */
function runsIn(view, at, dialect, reading) {
  const q = reading.kind[at] === 'q' ? reading.open[at] : -1;
  if (q < 0) return runFrom(view, at, dialect, reading.code);
  // The string's opening quote is always code in its reading, so this looks back from it once.
  if (!runFrom(view, q, dialect, reading.code)) return null;
  const from = Math.max(q + 1, at - WINDOW);
  return commandStart(view.slice(from, at), from > q + 1, dialect);
}

/** The look-back from code at `at`: a quoted bound is blanked, every other quoted character stays (`"$SHELL" -c`). */
function runFrom(view, at, dialect, code) {
  const from = Math.max(0, at - WINDOW);
  return commandStart(code.slice(from, at), from > 0, dialect);
}

/** Where a command starts: a separator, a bracket, a backtick; in PowerShell an assignment's `=`. */
const BOUNDS = { sh: ';&|(){}\n`', ps: ';&|(){}\n=' };

/**
 * The part of {@link runsAt} that reads `before`, the text up to the binary: back to the last bound,
 * then forward through the runners. `cut` says the look-back window ended before the text did.
 */
function commandStart(before, cut, dialect) {
  const text = before.replace(/\$\{[^{}]*\}/g, '_');
  const bounds = BOUNDS[dialect];
  let k = text.length - 1;
  while (k >= 0 && !bounds.includes(text[k])) k--;
  if (k < 0 && cut) return { appends: false, startProcess: false };
  const words = (text.slice(k + 1).match(/"[^"]*"|'[^']*'|[^\s"']+/g) || []).map((w) =>
    w.replace(/^["']|["']$/g, ''),
  );
  const chain = runChain(words, 0);
  if (chain) return chain;
  const shell = words.findIndex(maybeShell);
  for (let j = words.length - 1; j >= 0; j--) {
    if (!runsNext(words[j], shell !== -1 && shell < j)) continue;
    const inner = runChain(words, j + 1);
    return inner && { ...inner, appends: inner.appends || /^-(?:exec|ok)/i.test(words[j]) };
  }
  return null;
}

/**
 * Does the shell glob `pattern` match any of `names`? `*`, `?`, `[…]` and `[!…]`, case-insensitive
 * (a default Mac disk and Windows fold case). Iterative with one star to fall back to, so it costs
 * pattern × name at most: turning the glob into a RegExp instead took over 20 s on `commonground `
 * + 100 stars + `x`, and a hang stalls the session until the hook times out. A pattern longer than
 * 4096 characters is not judged at all: it counts as a match, which asks.
 */
function globMatches(pattern, names) {
  if (pattern.length > 4096) return true;
  const p = pattern.toLowerCase();
  const close = new Array(p.length);
  for (let k = p.length - 1, next = -1; k >= 0; k--) {
    close[k] = next;
    if (p[k] === ']') next = k;
  }
  const step = (pi, c) => {
    const t = p[pi];
    if (t === '?') return pi + 1;
    if (t === '[') {
      const negated = p[pi + 1] === '!' || p[pi + 1] === '^';
      const body = pi + (negated ? 2 : 1);
      const end = body < p.length ? close[body] : -1;
      if (end !== -1) {
        let hit = false;
        for (let k = body; k < end && !hit; k++) {
          if (p[k + 1] === '-' && k + 2 < end) {
            hit = c >= p[k] && c <= p[k + 2];
            k += 2;
          } else hit = p[k] === c;
        }
        return hit !== negated ? end + 1 : -1;
      }
    }
    if (t === '\\' && pi + 1 < p.length) return p[pi + 1] === c ? pi + 2 : -1;
    return t === c ? pi + 1 : -1;
  };
  return names.some((name) => {
    const s = name.toLowerCase();
    let pi = 0;
    let si = 0;
    let star = -1;
    let mark = 0;
    while (si < s.length) {
      if (pi < p.length && p[pi] === '*') {
        star = pi++;
        mark = si;
        continue;
      }
      const next = pi < p.length ? step(pi, s[si]) : -1;
      if (next !== -1) {
        pi = next;
        si++;
      } else if (star === -1) return false;
      else {
        pi = star + 1;
        si = ++mark;
      }
    }
    while (pi < p.length && p[pi] === '*') pi++;
    return pi === p.length;
  });
}

/**
 * A verb-slot word the guard cannot read, quotes already dropped: an expansion (`$V`, `${V}`,
 * `$(…)`, a backtick, `$args`), a splat or cmd variable (`@verb`, `%V%`), an expression or brace
 * expansion (`(…)`, `{push,}`, `{}` for find), a process substitution, or a glob that matches a
 * gated verb (`pu?h`, `pu[s]h`, `p*`).
 */
function unreadableWord(w) {
  if (!w) return false;
  if (w.length > 1 && /^[@%({<]/.test(w)) return true;
  if (/\$[\w{(@*#?!$-]|`|[<>]\(/.test(w)) return true;
  return /[*?[]/.test(w) && globMatches(w, GATED_VERBS);
}

/** The shell word after the binary that ends at `end`, past its closing quotes, or ''. */
function nextWord(view, end, dialect) {
  let p = end;
  while (p < view.length && '"\'`)'.includes(view[p])) p++;
  const gap = /[ \t]+/y;
  gap.lastIndex = p;
  if (!gap.test(view)) return '';
  const word = NEXT_WORD[dialect];
  word.lastIndex = gap.lastIndex;
  const m = word.exec(view);
  return m ? m[0] : /^\S*/.exec(view.slice(gap.lastIndex, gap.lastIndex + 4097))[0];
}

/** Start-Process's argument list, `-ArgumentList x`/`-Args:x`, or undefined. */
function startProcessList(view) {
  const m = /(?:^|\s)-a[a-z]*(?::\s*|\s+)((?:"[^"]*"|'[^']*'|[^\s,;])+)/i.exec(view);
  return m ? m[1].replace(/["']/g, '') : undefined;
}

/** Is `at` the first word of its line in `view`? Only spaces and tabs back to a newline or the start. */
function opensLine(view, at) {
  let k = at - 1;
  while (k >= 0 && (view[k] === ' ' || view[k] === '\t')) k--;
  return k < 0 || view[k] === '\n';
}

/**
 * Does `view` (a {@link slotView}) RUN the binary with a verb slot the guard cannot read? Also a
 * glob in the program slot whose last part matches the binary (`node …/bin/common* push`, `c*d
 * push`), and a runner that appends its input to a binary given no plain verb of its own (`echo
 * push | xargs commonground`, `find … -exec commonground {} \;`); `xargs commonground status` is
 * fine. Start-Process's verb slot is its argument list. Where the binary is RUN is read with the
 * view's {@link quoteMask}, so a quoted grep pattern or commit message is not a command.
 *
 * Markdown is not a program: a pattern that starts and ends with `*`, holds no folder, and opens
 * its line (`**On** push to main` in a PR body or a commit message, whose lines the quote mask may
 * read as commands) is left alone, while `node *ground* push` still asks.
 */
function unreadableRun(view, dialect) {
  let mask = null;
  for (const m of view.matchAll(RUN_WORD)) {
    const word = m[0];
    const lead = /^\{*/.exec(word)[0].length;
    const last = word.slice(Math.max(word.lastIndexOf('/'), word.lastIndexOf('\\'), lead - 1) + 1);
    const glob = !BIN_NAME.test(last);
    if (glob && !(/[*?[]/.test(last) && globMatches(last, BIN_NAMES))) continue;
    if (glob && /^\*.*\*$/.test(word) && !/[/\\]/.test(word) && opensLine(view, m.index)) continue;
    const end = m.index + word.length;
    let at = m.index + (/[/\\]/.test(word) ? 0 : lead);
    if (view[end] === '"' || view[end] === "'") {
      // The binary closes a quoted path: its word starts at the opening quote.
      const from = Math.max(0, at - WINDOW);
      const open = view.slice(from, at).lastIndexOf(view[end]);
      if (open !== -1) at = from + open;
    }
    let next = nextWord(view, end, dialect).replace(/["']/g, '').replace(/\)+$/, '');
    // A backtick that closes a substitution ends the word: `commonground pull` in prose is `pull`.
    if (dialect !== 'ps' && !next.startsWith('`') && next.includes('`')) next = next.slice(0, next.indexOf('`'));
    const plain = /^[A-Za-z][\w-]*$/.test(next);
    const verb = GATED_VERB.test(next);
    if (plain && !(glob && verb)) continue;
    // A pattern with no literal letter (`*`, `**`, `/*`) is the binary only when a gated verb follows
    // and its word is a path or names our folder (`node /x/bin/* push`, `cd bin && node ./* push`):
    // a JSDoc ` * push reminder` line or a markdown `**` in a heredoc is not a program.
    if (glob && !/[a-z]/i.test(last.replace(/\[[^\]]*\]/g, '')) && !(verb && /commonground|[/\\]/i.test(word))) continue;
    mask = mask || quoteMask(view, dialect);
    const run = runsAt(view, at, dialect, mask);
    if (!run) continue;
    if (run.startProcess) {
      if (unreadableWord(startProcessList(view) ?? (next.startsWith('-') ? '' : next))) return true;
      continue;
    }
    if (unreadableWord(next) || (glob && verb) || (run.appends && !plain)) return true;
  }
  return false;
}

/*
 * A PROGRAM SLOT THE GUARD CANNOT READ, before a literal gated verb (SER-331, round 2).
 *
 * The narrowed D1: `node "$CG" push`, where THIS command filled CG in a way the text does not spell
 * out (`read CG <<< …`, `printf -v CG`, `: ${CG:=…}`, `declare -n`, PowerShell's `$cg, $z = …` or
 * `Set-Item variable:cg`), or reads it through `${!R}`, a zsh flag (`${=CG}`, `$~CG`) or a member
 * (`$c.Path`). A name this command never defines stays the D1 residual (header): its value came from
 * elsewhere, and asking would police `node "$SCRIPT" import` in every repo. A name whose one value
 * the text does hold is written in and judged by what it spells: `P=common; node /x/${P}ground push`
 * is the binary, `G=git; $G push` is git. One of unknown value asks only in a command that names
 * the binary somewhere, so a command with nothing of ours in it is never asked about. The same
 * holds for a positional parameter in the program slot (`set -- …/commonground; node "$1" push`,
 * `run() { node "$1" push; }; run …/commonground`, round 3; `sh -c 'node "$0" push' …/commonground`,
 * round 4): the command sets it.
 *
 * And the pipe form: `ls …/bin/commonground | tail -1 | xargs -I{} node {} push`, where an earlier
 * stage of the pipeline names the binary and the program slot is a token filled from it; `|&` is a
 * pipe too, and in PowerShell so is the call operator inside a stage (`… | ForEach-Object { & $_
 * push }`), which the scanner cuts at.
 */

/**
 * Any use of a name: sh `$N`, `${…N…}` (zsh flags, `!` and `#` included), `$~N`; PowerShell `$N`,
 * `${N}`, `@N` and a member or index after it. Not cmd's `%N%`: cmd writes a `%N%` in when it reads
 * the line, before a `set` on that line runs, so `set P=…&& %P% push` never runs what it set.
 */
const NAME_USE = {
  sh: /\$\{([^{}]*)\}|\$([=~^]*)([A-Za-z_]\w*)/g,
  ps: /\$\{(?:[a-z]+:)?([^{}:]+)\}|([$@])(?:(?:env|global|script|local|private|using|variable):)?([A-Za-z_]\w*)((?:\.\w+|\[[^\]\n]*\])*)/gi,
};
/** A gated verb as a whole word, once {@link VERB_QUOTING} is removed. */
const GATED_VERB = /^(?:push|import|sync)$/i;
/** What the shell removes from a word before a program sees it, and PowerShell's block-closing `}`. */
const VERB_QUOTING = { sh: /["'\\]/g, ps: /["'`}]/g };

/** A {@link NAME_USE} match as the name it reads and whether it reads it plainly (`$N`, `${N}`). */
function nameUse(m, dialect) {
  if (dialect === 'ps') {
    if (m[1] !== undefined) return { name: m[1], plain: true };
    return { name: m[3], plain: m[2] === '$' && !m[4] };
  }
  if (m[1] !== undefined) {
    const inner = /^[!#]?(?:\([^)]*\))?[=~^]*([A-Za-z_]\w*)/.exec(m[1]);
    return inner && { name: inner[1], plain: /^[A-Za-z_]\w*$/.test(m[1]) };
  }
  return { name: m[3], plain: !m[2] };
}

/** The one value the text holds for `r`, or null: one plain definition, nothing it has to run. */
function literalValue(r) {
  if (!r || r.kind !== 'var' || r.defs !== 1 || r.multi || typeof r.first !== 'string') return null;
  const value = unquote(r.first);
  return /[$`(){}@%\n]/.test(value) ? null : value;
}

/**
 * Is the program word `w` one the guard must ask about? It uses a name this command defines, and
 * either that name's value is not in the text (asked only when the command names the binary), or
 * written in it spells the binary; or it is a bash positional parameter (`"$1"`, `$@`, and `"$0"`,
 * which is how `sh -c '…' ARG` receives its first argument), asked on the same terms; or, `piped`, it
 * is a token an earlier stage filled.
 */
function unreadableProgramWord(w, dialect, ctx, piped) {
  let defined = false;
  let unknown = false;
  const written = w.replace(NAME_USE[dialect], (...g) => {
    const use = nameUse(g, dialect);
    const r = use && ctx.records && ctx.records.get(nameKey('var', use.name, dialect));
    if (!r) return g[0];
    defined = true;
    const value = use.plain ? literalValue(r) : null;
    if (value === null) unknown = true;
    return value ?? g[0];
  });
  if (!defined && dialect !== 'ps' && /^["']?\$(?:[0-9@*]|\{[0-9@*][^}]*\})["']?$/.test(w)) return ctx.mentions;
  if (!defined) return piped && /[{}%$`@]/.test(w);
  if (unknown) return ctx.mentions;
  const bare = written.replace(/["']/g, '');
  const last = bare.slice(Math.max(bare.lastIndexOf('/'), bare.lastIndexOf('\\')) + 1);
  return BIN_NAME.test(last) || (/[*?[]/.test(last) && globMatches(last, BIN_NAMES));
}

/**
 * Does `view` (a {@link slotView}) RUN a program word of that kind right before a gated verb?
 *
 * Words are split where the SHELL splits them (round 3 of the SER-331 review): under each reading of
 * the quotes a quoted run stays inside its word, so `OUT="$(node "$CG" push)"` yields `"$CG"` and then
 * `push`, and once more with no quotes at all, so a program slot inside a string another shell runs
 * (`bash -c "node \"$CG\" push"`) is seen too; {@link runsAt} then decides whether it runs. The verb
 * is read the way the shell reads it, quotes and escapes removed (`pu""sh`, `pu\sh`; in PowerShell a
 * `}` that closes the block).
 */
function unreadableProgram(view, dialect, ctx, piped) {
  const positional = ctx.mentions && /\$(?:[0-9@*]|\{[0-9@*])/.test(view);
  if (!piped && !positional && !(ctx.records && ctx.records.size)) return false;
  const spelled = (text) => text.replace(VERB_QUOTING[dialect], '');
  if (!/push|import|sync/i.test(spelled(view))) return false;
  const mask = quoteMask(view, dialect);
  for (const kind of [null, ...readingsOf(mask).map((r) => r.kind)]) {
    let flat = view;
    if (kind) {
      flat = '';
      for (let j = 0; j < view.length; j++) flat += kind[j] === 'q' ? 'x' : view[j];
    }
    const words = [...flat.matchAll(/[^\s;&|<>()]+/g)];
    for (let i = 0; i + 1 < words.length; i++) {
      const at = words[i].index;
      const end = at + words[i][0].length;
      const next = words[i + 1];
      if (!/^[ \t]+$/.test(view.slice(end, next.index))) continue;
      if (!GATED_VERB.test(spelled(view.slice(next.index, next.index + next[0].length)))) continue;
      if (!unreadableProgramWord(view.slice(at, end), dialect, ctx, piped)) continue;
      if (runsAt(view, at, dialect, mask)) return true;
    }
  }
  return false;
}

/**
 * Which gated command this segment runs, and the verb it runs it with, or null (SER-327).
 *
 * Several views, any one of which gates, so each can only ADD a match: the segment's own text; the
 * two readings of the {@link looseView}; in PowerShell, Start-Process naming the binary with the
 * verb in its argument list; and each of those again for the segment read through the names this
 * command binds ({@link resolvedViews}, SER-331). The raw view is kept beside the loose ones
 * because removing a backslash can also REMOVE a match (`C:\x\bin\commonground push` loses its
 * path). The only text taken OUT of the own view is a folder: git's `-C <folder>` and, beside
 * Start-Process, a working directory or a redirect file. `named` says the verb was found only
 * through a name, which {@link previewThroughNames} needs to know. A verb found only through a name
 * with two definitions, or a loop variable, comes back `unreadable`: which value runs is not in the
 * text (`V=push; V=status; commonground $V` runs status).
 *
 * When no view finds a verb, the verb slot is checked (SER-331): a run binary with a slot the guard
 * cannot read comes back as `unreadable`, never with a verb, so no dialog claims a publish that may
 * be `status`. `masked` is the segment with its function-body forwards blanked (see
 * {@link maskForwards}). And a PROGRAM slot the guard cannot read before a literal gated verb comes
 * back `unreadable` too ({@link unreadableProgram}); `piped` says an earlier stage of this segment's
 * pipeline names the binary.
 *
 * Every step is linear in the segment, and a segment that never names the binary in any view (and
 * holds no glob) stops before the gated regex runs at all, which is nearly every command a session
 * sends.
 */
function gatedIn(segment, dialect, ctx = NO_NAMES, masked = segment, piped = false) {
  const resolved = resolvedViews(segment, ctx);
  if (resolved === null) return { command: GATED_COMMANDS[0], unreadable: true };
  const readings = [segment, ...resolved].map((text) => {
    let own = withoutGitDirectory(text);
    const startProcess = dialect === 'ps' && START_PROCESS.test(own);
    if (startProcess) own = own.replace(START_PROCESS_PATHS, ' ');
    return { views: [own, ...looseView(own, dialect)], startProcess };
  });
  const mentioned = readings.some(({ views }) => views.some((view) => /commonground/i.test(view)));
  if (!mentioned && !/[*?[]/.test(segment)) {
    return unreadableProgram(slotView(withoutGitDirectory(masked), dialect), dialect, ctx, piped)
      ? { command: GATED_COMMANDS[0], unreadable: true }
      : null;
  }
  for (const [index, { views, startProcess }] of readings.entries()) {
    const find = (re) => views.reduce((m, view) => m || re.exec(view), null);
    const listed = startProcess && find(LISTED_VERB);
    for (const command of GATED_COMMANDS) {
      const m = find(command.re) || listed;
      if (m && index > 0 && resolved.ambiguous) return { command, unreadable: true };
      if (m) return { command, verb: m.groups.verb.toLowerCase(), named: index > 0 };
    }
  }
  const slots = masked === segment ? [segment, ...resolved] : [masked, ...(resolvedViews(masked, ctx) || [])];
  const own = slotView(withoutGitDirectory(masked), dialect);
  return slots.some((text) => unreadableRun(slotView(withoutGitDirectory(text), dialect), dialect)) ||
    unreadableProgram(own, dialect, ctx, piped)
    ? { command: GATED_COMMANDS[0], unreadable: true }
    : null;
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

/** A program that re-reads the words after it as a new command line (rule 3 of readOnlyPreview). */
const REREADS = /(?:^|[\s;&|(){}])(?:eval|ssh|wsl|watch|su|cmd|iex|invoke-expression|pwsh|powershell)(?:\.exe)?\s/i;
/** `alias NAME=…`, `Set-Alias NAME …` and their short forms: the name an alias takes. */
const ALIAS_HEAD = /(?:^|[\s;&|(){}])(?:alias|set-alias|new-alias|sal|nal)[ \t]+(?:-[^\s;&|=]+[ \t]+)*([^\s;&|=]+)/gi;

/**
 * Every command name this command defines as a function or an alias, lowercased: bash and
 * PowerShell function heads, `alias`/`Set-Alias`, zsh's `functions[NAME]=` and PowerShell's
 * `function:` drive. Rule 3 of {@link readOnlyPreview} withholds a preview whose chain one shadows.
 */
function shadowNames(cmd, dialect) {
  const names = new Set();
  for (const m of cmd.matchAll(FUNCTION_HEAD[dialect])) {
    names.add((m[1] || m[2]).replace(/^(?:global|script|local|private):/i, '').toLowerCase());
  }
  for (const m of cmd.matchAll(ALIAS_HEAD)) names.add(m[1].toLowerCase());
  for (const m of cmd.matchAll(/(?:functions\[|function:)([^\]\s'"=;]+)/gi)) names.add(m[1].toLowerCase());
  return names;
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
 *      publish, because its binary is before the preview and its verb after it. And (SER-331) the
 *      binary is the program a known chain RUNS ({@link runsAt}, quoted text blanked): never an
 *      argument an interpreter may run with its own argv (`node -e '…' <cli> push --dry-run`,
 *      `python3 -c '…' commonground push --dry-run`), nor under a runner that appends its input.
 *      Nothing before it re-reads the line (`eval`, `ssh`, `wsl`, `watch`, `su`, `cmd`, `iex`,
 *      `pwsh -Command`) unless everything from the binary on is bare text, since that shell
 *      re-reads a quoted `'>'` as a redirect. And no function or alias this command defines shares
 *      a name with a word of that chain (`commonground() { command commonground "$1"; }`,
 *      `node() { … }`): its body decides the argv, not the text.
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
 *      PowerShell splits on more of them (pwsh 7.6.6 splits on a no-break and a thin space);
 *      reading fewer word ends can only withhold. And PowerShell reads a `<` or `>` as a redirect
 *      only where a word starts: `--dry-run>x` and `--dry-run>$null` reach the CLI as ONE argument
 *      (`--dry-run>`), so the CLI publishes (SER-331, checked against pwsh 7.6.6 with a stub CLI).
 *   6. PowerShell only (SER-331): nothing BEFORE the flag can fold the flag into an earlier
 *      argument ({@link legacyArgvRisk}).
 *
 * Every rule can only withhold the exemption. Uncertainty resolves to ask. `ctx` is what the whole
 * command binds, so rule 1 also sees a publish spelled through a name.
 */
function readOnlyPreview(segment, dialect = 'sh', ctx = NO_NAMES) {
  const [scanned] = scanShell(segment, dialect);
  const { text, kind } = scanned;
  const m = GATED_COMMANDS[0].re.exec(text);
  if (!m || !m.indices || !m.indices.groups) return false; // rule 1
  const { path, bin, verb } = m.indices.groups;
  const start = (path || bin)[0];
  if (gatedIn(text.slice(0, start), dialect, ctx) || gatedIn(text.slice(verb[1]), dialect, ctx)) {
    return false;
  }

  let i = bin[1]; // rule 2
  if (kind[i] === 'q' && kind[i - 1] === 'q' && `"'`.includes(text[i])) i++; // a quoted path closing
  for (; i < verb[1]; i++) if (kind[i] !== ' ') return false;

  const prefix = text.slice(0, start); // rule 3
  if (/[$`]/.test(prefix)) return false;
  let binAt = start;
  if (`"'`.includes(text[bin[1]] || '') && kind[bin[1]] === 'q') {
    const open = text.lastIndexOf(text[bin[1]], start);
    if (open !== -1) binAt = open;
  }
  let blanked = ''; // quoted text is an argument, never a command boundary; its quote marks stay
  for (let j = 0; j < binAt; j++) blanked += kind[j] === ' ' || `"'`.includes(text[j]) ? text[j] : '_';
  const run = runsAt(blanked, binAt, dialect);
  if (!run || run.appends) return false;
  if (REREADS.test(prefix) && /[^ ]/.test(kind.slice(start).replace(/#/g, ' '))) return false;
  const shadows = ctx === NO_NAMES ? shadowNames(text, dialect) : (ctx.shadows = ctx.shadows || shadowNames(ctx.cmd, dialect));
  const chain = (prefix.match(/[^\s"'&;|(){}]+/g) || []).concat([text.slice(bin[0], bin[1])]);
  if (chain.some((w) => shadows.has(programName(w)))) return false;
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
  // In bash a `}` closes a group only as a word of its own: `--dry-run}` reaches the CLI whole.
  const end = own.search(dialect === 'ps' ? /(?:^|[ \t])[0-9*]?[<>]|[)}]/ : /[<>)]|(?:^|[ \t])\}/);
  let flag = -1; // where the first preview flag starts in the tail
  let at = 0;
  for (const word of (end === -1 ? own : own.slice(0, end)).split(/([ \t]+)/)) {
    if ((PREVIEW_FLAGS.get(word) || []).includes(m.groups.verb)) {
      flag = at;
      break;
    }
    at += word.length;
  }
  if (flag === -1) return false;
  return dialect !== 'ps' || !legacyArgvRisk(tail.slice(0, flag), tailKind.slice(0, flag)); // rule 6
}

/**
 * Rule 6 of {@link readOnlyPreview}, PowerShell only (SER-331): can anything BEFORE the preview flag
 * swallow it? Windows PowerShell 5.1, and pwsh 7 under `$PSNativeCommandArgumentPassing = 'Legacy'`,
 * hand a native program ONE command line without escaping a `"` inside an argument, and the
 * program's own parser then reads on past that argument and takes the flag with it: pwsh 7.6.6 on
 * macOS, under Legacy, handed a stub CLI `--message 'a"b' --dry-run` as [push, --message, "ab
 * --dry-run"], and did the same for `"it""s"`, a `$m`, a `$env:MSG` and an `@extra` splat that
 * held a quote. So any of these, before the flag, withholds the exemption:
 *   - a quoted run whose content holds a `"` or ends in a `\` (the trailing backslash did NOT
 *     reproduce on pwsh 7.6.6 Legacy; Windows PowerShell 5.1 is SER-329's to check);
 *   - an expansion, bare or inside "…" (`$m`, `${m}`, `$env:X`) and a splat (`@extra`), whose value
 *     may hold one;
 *   - a bare `#`, since PowerShell opens a comment after more characters than the scanner knows.
 * After the flag the swallowing can only take later words, so `--dry-run --message $msg` stays a
 * preview (it did, under Legacy, with a quote in the message).
 */
function legacyArgvRisk(text, kind) {
  for (let j = 0; j < text.length; ) {
    if (kind[j] !== 'q') {
      if (kind[j] === ' ' && text[j] === '#') return true;
      if (kind[j] === ' ' && /[$@]/.test(text[j]) && /[\w{:?]/.test(text[j + 1] || '')) return true;
      j++;
      continue;
    }
    let k = j;
    while (k < text.length && kind[k] === 'q') k++;
    const run = text.slice(j, k);
    const quoted = /^(["'])([\s\S]*)\1$/.exec(run);
    const content = quoted ? quoted[2] : run;
    if (content.includes('"') || content.endsWith('\\')) return true;
    if (run[0] === '"' && /\$[\w{:?]/.test(content)) return true;
    j = k;
  }
  return false;
}

/**
 * The publish verdict for one shell command, read in each of `dialects`: judged PER SEGMENT, and
 * the escape is judged on FLAG POSITIONS, so a read-only form only exempts the command it is
 * actually a flag of, and only when it is a flag rather than message text. The gated verb itself is
 * matched on the RAW segment — quoted text there can only over-gate. Two dialects is the unknown
 * shell: a union, so it can only over-gate.
 *
 * What the command binds is read once, over the whole command, before any segment is judged
 * (SER-331): a name is defined in one segment and used in another. A command that binds more names
 * than the guard reads asks. A lookup inline in the program slot is read as the binary it returns
 * ({@link collapseLookups}). And a `pwsh -EncodedCommand` payload is decoded and judged as
 * PowerShell of its own, two levels deep; a third level, or more payloads than the guard decodes,
 * asks.
 *
 * A publish the guard can read wins over one it cannot (SER-331): the unreadable wording is kept
 * aside while the rest of the command is read, so `commonground $V; commonground push
 * --allow-deletes` still says that this run REMOVES pages.
 *
 * A segment after a pipe (`|`, bash and zsh's `|&`, and in PowerShell the call operator the scanner
 * cuts at inside a stage) knows whether an earlier stage of its pipeline names the binary.
 *
 * In bash, a line joined by a backslash-newline AFTER a heredoc opens keeps no preview exemption
 * unless EVERY heredoc opened before it feeds a shell that reads its body as the script, and so joins
 * such lines itself ({@link readsBodyAsScript}; round 3 of the SER-331 review, judged per heredoc
 * since round 4). The scanner joins them the way bash does, and the program that really reads a
 * quoted-delimiter body may not: `pwsh -Command -`, a `$P` holding pwsh, `sed -n 1p <<'EOF' | sh`,
 * a `while read -r l; do eval "$l"; done` loop, `sh -c 'pwsh -Command -' <<'EOF'` and a pwsh
 * heredoc after a `bash <<'A'` one each ran `commonground push \` then `--dry-run` as a publish.
 * `bash <<'EOF'` joins them, and stays a preview. Even then only the body's FIRST command is sure to
 * be read by that shell ({@link rawReadable}, round 5): a first line of `pwsh -Command -` or a
 * `while read` loop takes the rest of the body raw.
 */
function shellVerdict(cmd, dialects, depth = 0) {
  const unreadable = verdictFor({ command: GATED_COMMANDS[0], unreadable: true });
  let fallback = null;
  for (const dialect of dialects) {
    const scanned = scanShell(cmd, dialect);
    const ctx = NAMES_WORTH_READING.test(cmd) ? readNames(cmd, dialect, scanned) : NO_NAMES;
    if (ctx.overflow && /commonground/i.test(cmd)) fallback = fallback || unreadable;
    // The first heredoc whose reader may not join a backslash-newline itself: past it, a joined line
    // vouches for nothing.
    const withheld =
      dialect === 'sh' ? scanned.findIndex((s) => /<<(?!<)/.test(bareView(s)) && !readsBodyAsScript(s)) : -1;
    let raw = null; // which segments a heredoc body's reader may take raw, read once when needed
    let upstream = false; // an earlier stage of this pipeline names the binary
    for (const [i, { text: segment, joined }] of scanned.entries()) {
      const prev = i > 0 ? scanned[i - 1].sep : '';
      const piped = (prev === '|' || prev === '|&' || (dialect === 'ps' && prev === '&')) && upstream;
      upstream = piped || BIN_VALUE.test(segment);
      const hit = gatedIn(segment, dialect, ctx, ctx.masked(i), piped);
      if (!hit) continue;
      if (joined && dialect === 'sh' && !raw) raw = rawReadable(scanned);
      const exempt = !joined || ((withheld === -1 || i <= withheld) && !(raw && raw[i]));
      if (exempt && !hit.unreadable && readOnlyPreview(segment, dialect, ctx)) continue;
      if (exempt && hit.named && previewThroughNames(segment, dialect, ctx)) continue;
      if (!hit.unreadable) return verdictFor(hit, segment, dialect);
      fallback = fallback || unreadable;
    }
    for (const lookups of collapseLookups(cmd, dialect)) {
      for (const { text: segment } of scanShell(lookups, dialect)) {
        const hit = segment.includes(LOOKUP) && lookupRun(slotView(segment, dialect), dialect);
        if (hit) return verdictFor(hit, segment, dialect);
      }
    }
  }
  const encoded = encodedCommands(cmd);
  if (encoded.overflow || (encoded.texts.length && depth >= MAX_ENCODED_DEPTH)) return fallback || unreadable;
  let decoded = null;
  for (const text of encoded.texts) {
    const verdict = shellVerdict(text, ['ps'], depth + 1);
    if (verdict && verdict.reason !== unreadable.reason) return verdict;
    decoded = decoded || verdict;
  }
  if (encoded.unread && !decoded && /commonground/i.test(cmd)) decoded = unreadable;
  return fallback || decoded;
}

/** A command worth reading names in: it names the binary, holds a glob, or holds a gated verb. */
const NAMES_WORTH_READING = /commonground|[*?[]|push|import|sync/i;
/** Shells that join a backslash-newline in a heredoc body themselves (see {@link shellVerdict}). */
const JOINING_SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);

/**
 * Does a heredoc's opening segment run a shell that reads the body as its SCRIPT (round 4 of the
 * SER-331 review)? Its program, as written past any `NAME=value`, is one of {@link JOINING_SHELLS},
 * and every other word is a heredoc, a redirect or an option the text spells. A short option holding
 * a `c` (`-c`, `-ec`, and `-s -c`, where `-c` wins) makes the body data for the string, which may
 * hand it on unjoined (`sh -c 'pwsh -Command -' <<'EOF'`, `bash -c 'while read -r l; do eval "$l";
 * done' <<'EOF'`), wherever it sits (bash takes `bash <<'EOF' -c '…'` too); so does an operand, a
 * script file, unless `-s` came first (not `+s`, which zsh, dash and ksh read as no `-s`). A quoted,
 * escaped or expanded word is not read (`bash '-c' …`, `bash $OPT …`), so it withholds.
 *
 * Round 5: that holds after `-s` too, and for an option's value. The shells still read `-c` in
 * `bash -s '-c' …`, `-"c"`, `-\c`, `$O` and `"$@"`, and `-o $X` word-splits into `-o pipefail -c
 * pwsh`, so past `-s` an operand counts as an argument only when it is {@link PLAIN_WORD}, and so
 * must a `-o` or `-O` value. A redirect that closes a descriptor (`3>&-`, `<&-`) is complete; only
 * an operator alone on its word (`<<`, `2>`, `>&`, `>|`, `<<-`) takes the next word, so `bash -s
 * <<'EOF' 3>&- -c '…'` keeps its `-c`.
 */
function readsBodyAsScript(segment) {
  const bare = bareView(segment);
  const words = []; // each word as the shell reads it bare, and as written
  const found = [...bare.matchAll(/\S+/g)];
  for (let k = 0; k < found.length; k++) {
    const w = found[k][0];
    const at = found[k].index;
    // `<<'EOF'`, `2>&1`, `3>&-` are whole; `<< EOF`, `> log`, `>| log` take the next word.
    if (/^[\d&]*[<>]/.test(w)) k += /[<>&|]$|^\d*<<-$/.test(w) ? 1 : 0;
    else words.push([w, segment.text.slice(at, at + w.length)]);
  }
  let k = 0;
  while (k < words.length && ASSIGNMENT.test(words[k][0])) k++;
  if (!JOINING_SHELLS.has(programName((words[k] || [''])[0]))) return false;
  let stdin = false; // `-s`: stdin is the script, and the operands are its arguments
  for (k++; k < words.length; k++) {
    const [w, written] = words[k];
    if (w === '--' || w === '-') return stdin || k === words.length - 1;
    if (/^[-+][A-Za-z]+$/.test(w)) {
      if (w.includes('c')) return false;
      if (w[0] === '-' && w.includes('s')) stdin = true;
      // `-o pipefail`, `-O extglob`: the option's own value
      if (/[oO]$/.test(w) && !PLAIN_WORD.test((words[++k] || ['', ''])[1])) return false;
    } else if (!/^--[a-z][\w-]*$/.test(w)) {
      return stdin && PLAIN_WORD.test(written);
    }
  }
  return true;
}

/**
 * One word the shell reads exactly as written (round 5 of the SER-331 review): no quote, escape,
 * `$`, backtick, glob, brace, tilde or `=cmd`, and not an option.
 */
const PLAIN_WORD = /^[\w./][\w./:@%,+=-]*$/;
/** A heredoc operator, not a here-string (`<<<`). */
const HEREDOC_OP = /(?<!<)<<(?!<)/g;
/** A delimiter the guard can find again: one plain word, quoted whole or not at all. */
const DELIMITER = /^(?:'([\w.-]+)'|"([\w.-]+)"|([\w.-]+))$/;

/**
 * Where a heredoc body's reader may take a joined line RAW (round 5 of the SER-331 review), one flag
 * per segment. A shell that reads the body as its script is sure to parse only the body's first
 * command itself: that command may hand the rest of its stdin on (`bash <<'EOF'` then `pwsh
 * -NoProfile -Command -`, or a `while read -r l; do eval "$l"; done` loop, each published
 * `commonground push \` then `--dry-run`), and the rest arrives unjoined. So from a heredoc's
 * opening line to its terminator every segment is flagged but the body's first command (blank lines
 * and comments skipped), and one after the terminator is the outer shell's again: `bash <<'A'` then
 * `bash <<'B'` each keep their first command.
 *
 * The terminator is trusted only where the scanner's lines are the shell's: the opening line holds
 * that one heredoc and leaves no `(` or backtick open past it (the shells start the body after a
 * `$(…)` or backtick closes, on a later line); the delimiter is one plain word; the terminator is
 * that word alone on its line, unjoined; and no segment in the body holds a quoted newline (the
 * scanner's quotes are then the body's text, and can hide the next heredoc and fake a terminator).
 * Otherwise the flags run to the end of the command, and an opening line the guard cannot place
 * keeps no first command either. A nested heredoc's own first command is flagged by the outer body:
 * one extra click.
 */
function rawReadable(scanned) {
  const n = scanned.length;
  const flags = new Uint8Array(n);
  const bare = scanned.map(bareView);
  const ops = bare.map((b) => (b.match(HEREDOC_OP) || []).length);
  if (!ops.some(Boolean)) return flags;
  const lineEnd = new Int32Array(n); // the last segment of the line each segment is on
  for (let k = n - 1, end = n - 1; k >= 0; k--) {
    if (scanned[k].sep === '\n') end = k;
    lineEnd[k] = end;
  }
  const lineOps = new Int32Array(n); // heredocs on a line, kept at its last segment
  for (let k = 0, sum = 0; k < n; k++) {
    sum += ops[k];
    if (lineEnd[k] !== k) continue;
    lineOps[k] = sum;
    sum = 0;
  }
  // From each segment on: the first that holds a quoted newline, and the first that runs something.
  const multi = new Int32Array(n + 1).fill(n);
  const solid = new Int32Array(n + 1).fill(n);
  for (let k = n - 1; k >= 0; k--) {
    const { text, kind } = scanned[k];
    multi[k] = text.includes('\n') ? k : multi[k + 1];
    const comment = kind.indexOf('#');
    solid[k] = (comment === -1 ? text : text.slice(0, comment)).trim() ? k : solid[k + 1];
  }
  // Lines that may end a body: one plain word alone on its line, unjoined; `<<-` strips leading tabs.
  const ends = { exact: new Map(), tabs: new Map() };
  for (let k = 0; k < n; k++) {
    const { text, joined } = scanned[k];
    if (joined || lineEnd[k] !== k || (k > 0 && lineEnd[k - 1] !== k - 1) || !/^\t*[\w.-]+$/.test(text)) continue;
    for (const [map, word] of [[ends.exact, text], [ends.tabs, text.replace(/^\t+/, '')]]) {
      if (!map.has(word)) map.set(word, []);
      map.get(word).push(k);
    }
  }
  const cover = new Int32Array(n + 1); // a difference array: bodies over each segment
  const holes = new Int32Array(n); // bodies whose first command each segment is
  for (let j = 0; j < n; j++) {
    const le = lineEnd[j];
    if (!ops[j] || le === n - 1) continue;
    const opening = placeOpening(scanned, bare, j, le, lineOps[le]);
    let last = n - 1;
    if (opening) {
      const at = opening.delimiter ? (opening.tabs ? ends.tabs : ends.exact).get(opening.delimiter) : null;
      const t = at ? firstAfter(at, le) : -1;
      if (t !== -1 && multi[le + 1] >= t) last = t;
      if (solid[le + 1] <= last) holes[solid[le + 1]]++;
    }
    cover[le + 1]++;
    cover[last + 1]--;
  }
  for (let k = 0, sum = 0; k < n; k++) flags[k] = (sum += cover[k]) > holes[k] ? 1 : 0;
  return flags;
}

/**
 * The heredoc on an opening line the scanner splits where the shell does (see {@link rawReadable}),
 * as its delimiter (null when it is not one plain word) and whether `<<-` strips tabs; or null.
 */
function placeOpening(scanned, bare, j, le, heredocs) {
  if (heredocs !== 1) return null;
  const { text, kind } = scanned[j];
  let p = bare[j].search(HEREDOC_OP) + 2;
  const tabs = text[p] === '-' && kind[p] === ' ';
  if (tabs) p++;
  while (p < text.length && kind[p] === ' ' && (text[p] === ' ' || text[p] === '\t')) p++;
  const start = p;
  while (p < text.length && !(kind[p] === ' ' && /[\s;&|<>()]/.test(text[p]))) p++;
  const word = DELIMITER.exec(text.slice(start, p));
  let depth = 0;
  for (let k = j; k <= le; k++) {
    for (const c of k === j ? bare[j].slice(p) : bare[k]) {
      if (c === '`' || (c === ')' && --depth < 0)) return null;
      if (c === '(') depth++;
    }
  }
  if (depth) return null;
  return { delimiter: word && (word[1] || word[2] || word[3]), tabs };
}

/** The first index in the ascending list `at` past `k`, or -1. */
function firstAfter(at, k) {
  let lo = 0;
  let hi = at.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (at[mid] > k) hi = mid;
    else lo = mid + 1;
  }
  return lo < at.length ? at[lo] : -1;
}

/*
 * A LOOKUP INLINE IN THE PROGRAM SLOT (SER-331). `node "$(which commonground 2>/dev/null)" push`,
 * `$(ls -d …/bin/commonground | sort -V | tail -1) push`, and in PowerShell `node (Get-Command
 * commonground).Source push` or `& "$((gcm commonground).Path)" push` published with no dialog,
 * while the same value through a name asked. A substitution whose body names the binary is read as
 * the binary, which is what BIN_VALUE already says about a name holding one.
 */

/** A word no text spells, standing for the binary a lookup returns: its last part is the binary. */
const LOOKUP = '\u0001/commonground';
/** Where the binary starts as a whole word or a path's last part (BIN_VALUE, positioned). */
const BIN_WORD = new RegExp(`(?<=${BIN_LEAD})${BIN_TAIL}`, 'gi');
/**
 * PowerShell member access and indexing after a group: `(…).Source`, `(…).Source.Trim()`,
 * `(…)[0].Path`.
 */
const MEMBERS = /(?:\.\w+(?:\([^()\n]*\))?|\[[^\]\n]*\])+/y;

/**
 * Every spelling of the command with each `$(…)`, backtick run, and in PowerShell each `(…)` followed
 * by a member, whose body names the binary written as {@link LOOKUP}; [] when there is none. In
 * PowerShell a bare `(…)` counts too, since `& (…) push` runs its value (`& (Get-Command
 * commonground -CommandType Application) push`), unless its last word is the binary, which the
 * gated regex reads already and whose preview stays one (`& (gcm commonground) push --dry-run`).
 * Whole-command, because a pipe inside the substitution splits the command into segments.
 *
 * Brackets are paired three ways, and every spelling is read: without regard to quotes (a string
 * another shell runs, `bash -c 'node "$(which commonground 2>/dev/null)" push'`), and outside quotes
 * under each reading of {@link quoteMask} (a quoted `)` inside the body, `grep -v ')'`, closed it
 * early). The outermost group that qualifies is taken. A body that holds a heredoc is a commit or PR
 * message, not a lookup, and is left alone. FIND-ONLY: only a LOOKUP the command RUNS with a
 * literal gated verb after it counts ({@link lookupRun}), and it is never a preview.
 */
function collapseLookups(cmd, dialect) {
  if (!/commonground/i.test(cmd)) return [];
  const ps = dialect === 'ps';
  const n = cmd.length;
  const bins = new Int32Array(n + 1); // bins[k]: binary words that start before k
  const docs = new Int32Array(n + 1); // docs[k]: heredoc openers that start before k
  for (const m of cmd.matchAll(BIN_WORD)) bins[m.index + 1]++;
  for (const m of cmd.matchAll(/<</g)) docs[m.index + 1]++;
  for (let k = 0; k < n; k++) {
    bins[k + 1] += bins[k];
    docs[k + 1] += docs[k];
  }
  const pairings = [null, quoteKinds(cmd, dialect).kind];
  if (cmd.includes('\n')) pairings.push(quoteKinds(cmd, dialect, true).kind);
  const spellings = new Set();
  for (const quoted of pairings) {
    const closeOf = new Int32Array(n).fill(-1);
    const parens = [];
    let tick = -1;
    for (let k = 0; k < n; k++) {
      const c = cmd[k];
      if (quoted && quoted[k] === 'q') continue;
      if (c === '(') parens.push(k);
      else if (c === ')' && parens.length) closeOf[parens.pop()] = k;
      else if (!ps && c === '`' && cmd[k - 1] !== '\\') {
        if (tick === -1) tick = k;
        else {
          closeOf[tick] = k;
          tick = -1;
        }
      }
    }
    let out = '';
    let last = 0;
    for (let k = 0; k < n; k++) {
      const close = closeOf[k];
      if (close < 0) continue;
      const dollar = cmd[k] === '(' && cmd[k - 1] === '$';
      let end = close + 1;
      if (ps && cmd[k] === '(') {
        MEMBERS.lastIndex = end;
        const member = MEMBERS.exec(cmd);
        if (member) end += member[0].length;
      }
      const bare = cmd[k] === '(' && !dollar && end === close + 1;
      if (bare && (!ps || /commonground(?:\.\w+)?\s*$/i.test(cmd.slice(k + 1, close)))) continue;
      if (bins[close] - bins[k + 1] === 0 || docs[close] - docs[k + 1] > 0) continue;
      out += cmd.slice(last, dollar ? k - 1 : k) + LOOKUP;
      last = end;
      k = end - 1;
    }
    if (last) spellings.add(out + cmd.slice(last));
  }
  return [...spellings];
}

/** A {@link LOOKUP} in `view` that is RUN with a literal gated verb after it, as a hit, or null. */
function lookupRun(view, dialect) {
  let mask = null;
  for (let at = view.indexOf(LOOKUP); at !== -1; at = view.indexOf(LOOKUP, at + 1)) {
    const end = at + LOOKUP.length;
    const verb = nextWord(view, end, dialect).replace(/["']/g, '');
    if (!GATED_VERB.test(verb)) continue;
    mask = mask || quoteMask(view, dialect);
    // Inside quotes that close right after it, a lookup is a quoted path: its word starts there
    // (`node "$ROOT/$(ls bin | grep commonground)" push`).
    const quotedPath = `"'`.includes(view[end]);
    const run = readingsOf(mask).some((r) =>
      runsIn(view, quotedPath && r.kind[at] === 'q' && r.open[at] >= 0 ? r.open[at] : at, dialect, r),
    );
    if (run) return { command: GATED_COMMANDS[0], verb: verb.toLowerCase() };
  }
  return null;
}

/**
 * The dialog for a hit. A verb the guard could not read gets the `unreadable` wording and no
 * detail: its flags describe a command that may be `status`, and "this REMOVES pages" said about a
 * read is the warning people learn to skip.
 */
function verdictFor(hit, segment, dialect) {
  const says = hit.unreadable
    ? hit.command.unreadable
    : (hit.command.byVerb && hit.command.byVerb[hit.verb]) || hit.command;
  const detail = hit.unreadable ? '' : publishDetail(segment, dialect);
  return {
    decision: 'ask',
    reason: detail ? `${says.reason} ${detail}` : says.reason,
    instruction: says.instruction,
  };
}

/** A command that re-reads text as code, after which no name's value can be vouched for. */
const EVALUATES = /\b(?:eval|iex|invoke-expression|source)\b/i;

/**
 * D2 (SER-331): does a preview spelled through a name (`CG=<cli>; node "$CG" push --dry-run`) keep
 * its exemption? Only when writing the names in can change WHICH PROGRAM runs and nothing else, so
 * the one dialog on the publish path is not preceded by a second one on its preview. Every name the
 * segment uses must be a variable with exactly ONE definition in the whole command, holding one
 * bare path word (no glob, `$`, backtick or quote), and every other appearance of the name must be
 * a plain use: a second assignment, a `read`, a `for`, `printf -v`, `declare -n`, a `${NAME:=…}`,
 * a member (`$cg.x`) or a zsh flag naming it keeps the ask, and so does any `eval`, `iex` or
 * `source` in the command. Then the segment, with those paths written in, must pass
 * {@link readOnlyPreview} like any other. A function or an alias never qualifies; that preview asks,
 * one click.
 *
 * A path WITH SPACES (a Windows user folder) qualifies where the shell cannot split it (round 2 of
 * the SER-331 review, the owner's call): always in PowerShell, which never word-splits a variable,
 * and in bash only when every use of the name is inside double quotes. It is written in with its
 * spaces as `_`, so the preview is read as the one word the program receives.
 */
function previewThroughNames(segment, dialect, ctx) {
  if (ctx.evaluates === undefined) ctx.evaluates = EVALUATES.test(ctx.cmd); // once per command
  if (ctx.evaluates) return false;
  const used = [];
  if (ctx.uses) for (const m of segment.matchAll(ctx.uses)) used.push(ctx.lookup('var', usedName(m)));
  // A call has no path to write in (`cg "$CG" push --dry-run`): its body decides the argv, and its
  // record holds no value, so the writing-in below would throw (and a throw is an allow).
  if (ctx.calls && segment.search(ctx.calls) !== -1) return false;
  if (!used.length || !used.every((r) => r && onePathWord(r, ctx))) return false;
  const text = substitute(segment, ctx, (r) => unquote(r.value).replace(/ /g, '_'));
  return text !== null && readOnlyPreview(text, dialect, ctx);
}

/** Is `r` a variable defined once, to one bare path, and otherwise only read plainly? Cached. */
function onePathWord(r, ctx) {
  if (r.eligible === undefined) {
    const ps = ctx.dialect === 'ps';
    const path = ps ? /^[^\t\n\r\f\v"'`$*?[\]{}();&|<>@#,]+$/ : /^[^\t\n\r\f\v"'`$*?[\]{}();&|<>\\!#]+$/;
    const value = unquote(r.value);
    // A space inside the path, never one that starts a flag or a verb of its own.
    const spaced = / /.test(value);
    r.eligible =
      r.kind === 'var' && r.bin && r.defs === 1 && !r.multi && r.at >= 0 && path.test(value) &&
      !(spaced && /(?:^| )(?:-|(?:push|import|sync)(?: |$))/i.test(value)) &&
      plainUsesOnly(r, ctx, spaced && !ps);
  }
  return r.eligible;
}

/**
 * Is every appearance of `r`'s name in the command its one definition or a plain `$NAME`/`${NAME}`?
 * The definition's own value is skipped: it is one plain path by then (`$cg = 'C:\…\cg\…'`). With
 * `quoted`, every use must also sit inside double quotes, where bash does not split it.
 */
function plainUsesOnly(r, ctx, quoted) {
  const ps = ctx.dialect === 'ps';
  const name = r.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (quoted && !ctx.quotes) ctx.quotes = quoteMask(ctx.cmd, ctx.dialect);
  for (const m of ctx.cmd.matchAll(new RegExp(`(?<!\\w)${name}(?!\\w)`, ps ? 'gi' : 'g'))) {
    const i = m.index;
    const end = i + m[0].length;
    if (i >= r.at && i < r.end) continue;
    const reassigned = ps && /^\s*[-+*/%]?=(?!=)/.test(ctx.cmd.slice(end, end + 64));
    const member = /^(?:\.\w|\[)/.test(ctx.cmd.slice(end, end + 2));
    const plain = ctx.cmd[i - 1] === '$' && !reassigned && !member;
    const braced = ctx.cmd.slice(i - 2, i) === '${' && ctx.cmd[end] === '}';
    if (!plain && !braced) return false;
    const sigil = plain ? i - 1 : i - 2;
    if (quoted && !(ctx.quotes.kind[sigil] === 'q' && ctx.cmd[ctx.quotes.open[sigil]] === '"')) return false;
  }
  return true;
}

/**
 * `pwsh -EncodedCommand <base64>` (and `-e`, `-ec`, `--EncodedCommand`, Windows' `/e`):
 * PowerShell text in UTF-16LE, a spelling that sidesteps every quoting problem and so every view
 * above (SER-331). Read only where `pwsh` or `powershell` is named. Every literal payload is decoded,
 * whatever it holds (it may be another `pwsh -e`), with the whitespace pwsh ignores taken out
 * (`-e "YwBv AG0A…"`). And every other base64 word in the command that decodes to text is read as a
 * payload too (round 3 of the SER-331 review): a flag the guard cannot pair with its value (`"-e"`,
 * `('-e')`, `Start-Process pwsh -ArgumentList '-NoProfile','-e','…'`, or one string holding both) or
 * a value held in a name (`$e='…'; pwsh -e $e`) still hands pwsh the payload. More than MAX_PAYLOADS
 * is `overflow`, which asks. A value the text does not hold at all, after pwsh's own `-e` (`pwsh -e
 * $e`, `xargs pwsh -e`), is `unread`, and if no payload is ours while the command names the binary,
 * {@link shellVerdict} asks; another program's `-e` (`grep -e "$PAT"`, `echo -e "$MSG"`) is not.
 */
const POWERSHELL = /(?:^|[\s;&|(){}"'`\\/=])(?:pwsh|powershell)(?:\.exe)?(?=[\s;&|)"'`]|$)/i;
const POWERSHELL_WORDS = new RegExp(POWERSHELL.source, 'gi');
const ENCODED = /(?:^|[\s"'])(?:--?|\/)(?:e|ec|en[a-z]*)(?=[\s:"';&|)]|$)/gi;
const ENCODED_VALUE = /[: \t]*(?:"([^"]*)"|'([^']*)'|([^\s;&|)]*))/y;
const BASE64 = /^[A-Za-z0-9+/]{8,}={0,2}$/;
const MAX_PAYLOADS = 16;
const MAX_ENCODED_DEPTH = 2;
function encodedCommands(cmd) {
  const found = { texts: [], unread: false, overflow: false };
  if (!POWERSHELL.test(cmd)) return found;
  const decode = (b64) => Buffer.from(b64, 'base64').toString('utf16le');
  let payloads = 0;
  const seen = new Set();
  // Whether an `-e` follows pwsh in its own command: the command starts after the last separator,
  // and both lists are walked once, in order, so a flood of flags stays linear.
  const shells = [...cmd.matchAll(POWERSHELL_WORDS)].map((m) => m.index + m[0].length);
  const bounds = [...cmd.matchAll(/[;&|\n]/g)].map((m) => m.index);
  let from = 0;
  let shell = -1;
  let b = 0;
  let s = 0;
  for (const m of cmd.matchAll(ENCODED)) {
    for (; b < bounds.length && bounds[b] < m.index; b++) from = bounds[b] + 1;
    for (; s < shells.length && shells[s] <= m.index; s++) shell = shells[s];
    ENCODED_VALUE.lastIndex = m.index + m[0].length;
    const v = ENCODED_VALUE.exec(cmd);
    const raw = (v && (v[1] ?? v[2] ?? v[3])) || '';
    const compact = raw.replace(/\s+/g, '');
    if (BASE64.test(compact)) {
      seen.add(compact);
      if (++payloads > MAX_PAYLOADS) return { ...found, overflow: true };
      found.texts.push(decode(compact));
    } else if ((!raw || /^[$(@`%]/.test(raw)) && shell > from) found.unread = true;
  }
  for (const word of cmd.match(/[A-Za-z0-9+/]{16,}={0,2}/g) || []) {
    if (seen.has(word)) continue;
    const text = word.length % 4 === 0 ? decode(word) : '';
    if (!/^[\t\n\r\x20-\x7e]+$/.test(text)) continue;
    if (++payloads > MAX_PAYLOADS) return { ...found, overflow: true };
    found.texts.push(text);
  }
  return found;
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
