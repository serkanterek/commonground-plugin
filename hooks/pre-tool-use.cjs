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
 *   • local-clone mode — `commonground push` publishes; the write tools are BANNED here (SER-184),
 *     so far only in prose. Verdict: DENY, and say where the write belongs instead.
 *   • MCP mode — there is no local file, no staging and no push step: `save_page` IS the publish and
 *     is live the instant it lands, for the whole team on a shared wiki. Verdict: ASK.
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
 * Tools that publish. Gating is by BARE tool name — an MCP tool arrives as
 * `mcp__<server>__<tool>` and the server segment is a per-user connector id we cannot predict.
 *
 * `save_seeding_progress` is deliberately absent: it fires repeatedly through one seeding arc, and a
 * prompt per progress-save trains the user to approve without reading, which is worse than not
 * gating it. It writes bookkeeping, not wiki content.
 */
const GATED_TOOLS = new Set([
  'save_page',
  'save_charter',
  'stage_sources',
  'invite_teammate', // sends a real invite — outward-facing
  'resolve_suggestion', // mutates state the whole team sees
]);

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
      'what would be published. Consent is per publish and never carries forward from an earlier one.',
  },
];

/** Read-only forms that must never be gated. */
const READ_ONLY_FLAGS = /(--dry-run|--help)(\s|$)/;

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
    if (!cmd || READ_ONLY_FLAGS.test(cmd)) return null;
    const hit = GATED_COMMANDS.find((g) => g.re.test(cmd));
    if (!hit) return null;
    return { decision: 'ask', reason: hit.reason, instruction: hit.instruction };
  }

  if (!GATED_TOOLS.has(bareToolName(toolName))) return null;

  // A write tool fired. WHERE it lands depends on this project's mode, and the two answers differ.
  const mode = routerMode(projectCwd(input));

  if (mode === 'local') {
    return {
      decision: 'deny',
      reason:
        'Blocked. This project keeps a local copy of your wiki, and this would write straight to ' +
        'the hosted one instead — leaving your local copy behind and out of step with it. The page ' +
        'belongs in your local copy first; publishing it is a separate, deliberate step.',
      instruction:
        'This project is in LOCAL-CLONE mode, where the MCP write tools are the wrong path entirely ' +
        '(SER-184). Write the page as a FILE in the clone, then publish with /commonground:push ' +
        'once the user approves.',
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

module.exports = { main, decide, noticeFor, bareToolName, GATED_TOOLS, GATED_COMMANDS };
