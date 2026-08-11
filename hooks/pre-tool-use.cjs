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
  routerMode,
} = require(`${__dirname}/lib.cjs`);

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
 * Everything gated, in either class. Gating is by BARE tool name — an MCP tool arrives as
 * `mcp__<server>__<tool>` and the server segment is a per-user connector id we cannot predict.
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
 */
const GATED_COMMANDS = [
  {
    // `commonground push|import`, however it is invoked — bare, via an absolute path to the bundled
    // binary, or after a `cd ... &&`. Routing around the slash command is exactly how this failed.
    re: /(^|[;&|(]|\s)([^\s;&|]*[/\\])?commonground\s+(push|import)(\s|$)/,
    // Shown to the PERSON in the approval dialog: what happens if they say yes, in plain language.
    reason:
      'This publishes your CommonGround wiki. From now on everyone who shares it — and every ' +
      'Claude session or tool that reads it — starts from these changes. It also commits ' +
      "everything sitting in your local copy, so any edit you haven't published yet goes out too.",
    // Injected into the MODEL's context: the operating instructions, which are meaningless to a
    // human staring at an approval dialog and were previously shown to them by mistake.
    instruction:
      'Before asking again, show the user `commonground push --dry-run` so they can see exactly ' +
      'what would be published. Consent is per publish and never carries forward from an earlier one. ' +
      'THIS DIALOG IS THE CONFIRMATION: do not raise a separate yes/no question of your own before ' +
      'running the publish — two prompts back to back teach the user to click through both. Print ' +
      'the preview as text, then run it.',
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
function publishDetail(segment) {
  const bits = [];
  const m = /--message[=\s]+(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(segment);
  const message = m && (m[1] ?? m[2] ?? m[3]);
  // A bare `--message --mine` is the CLI's "no message" case (its parser rejects a `--`-leading
  // value), so quoting it here would attribute a commit message that never gets written.
  if (message && !message.startsWith('--')) {
    bits.push(`It goes into the history as: "${message.slice(0, 200)}".`);
  }
  const argv = unquoted(segment);
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

/** Read-only forms that must never be gated. */
const READ_ONLY_FLAGS = /(--dry-run|--help)(\s|$)/;

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
 * the whole string. An unterminated quote simply runs to the end — the verb stays in that segment,
 * so it still gates — and a backslash-escaped quote closes early, which over-splits. Both failure
 * directions are toward MORE segments and more gating, which is the correct direction for a guard.
 */
function commandSegments(cmd) {
  const out = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (quote) {
      cur += c;
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      cur += c;
    } else if (c === '&' || c === '|') {
      if (cmd[i + 1] === c) i++; // `&&` / `||` are one separator; a lone `&` or `|` is also one
      out.push(cur);
      cur = '';
    } else if (c === ';' || c === '\n') {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

/**
 * A segment with quoted runs blanked out, for anything that asks "was this flag PASSED?".
 *
 * Flag detection must never read argument TEXT as argv. Without this, `push --message "remember
 * --mine and --allow-deletes exist"` told the user their publish REMOVES pages — crying wolf on the
 * one warning that has to be believed, in the dialog that is now the only confirmation. Blanking
 * can only remove matches, never manufacture one.
 */
function unquoted(segment) {
  return segment.replace(/"[^"]*"|'[^']*'/g, ' ');
}

/** The bare tool name from an MCP-qualified one (`mcp__abc__save_page` → `save_page`). */
function bareToolName(name) {
  if (typeof name !== 'string') return '';
  const parts = name.split('__');
  return parts.length > 1 ? parts[parts.length - 1] : name;
}

/**
 * The verdict for one tool call, or null to stay out of the way.
 * Exported so tests can drive every branch without spawning a process per case.
 */
function decide(input) {
  const toolName = (input && input.tool_name) || '';
  const toolInput = (input && input.tool_input) || {};

  if (toolName === 'Bash') {
    const cmd = typeof toolInput.command === 'string' ? toolInput.command : '';
    if (!cmd) return null;
    // Judged PER SEGMENT, and the escape is judged on FLAG POSITIONS: a read-only form only exempts
    // the command it is actually a flag of, and only when it is a flag rather than message text.
    // The gated verb itself is matched on the RAW segment — quoted text there can only over-gate.
    let hit = null;
    let publishing = '';
    for (const segment of commandSegments(cmd)) {
      if (READ_ONLY_FLAGS.test(unquoted(segment))) continue;
      hit = GATED_COMMANDS.find((g) => g.re.test(segment)) ?? null;
      if (hit) {
        publishing = segment;
        break;
      }
    }
    if (!hit) return null;
    const detail = publishDetail(publishing);
    return {
      decision: 'ask',
      reason: detail ? `${hit.reason} ${detail}` : hit.reason,
      instruction: hit.instruction,
    };
  }

  const bare = bareToolName(toolName);
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
  GATED_TOOLS,
  CONTENT_WRITE_TOOLS,
  OUTWARD_TOOLS,
  GATED_COMMANDS,
};
