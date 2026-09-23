#!/usr/bin/env node
'use strict';
/*
 * CommonGround SessionStart hook (Plugin Pivot Step 2 first-boot · Step 4 awareness — SER-141/143;
 * Step-4 onboarding three-way state — SER-150).
 *
 * Outcomes, all fail-open (a detection/network hiccup never breaks the session):
 *   • signed in, project NOT pointed at a wiki → nudge the user to /commonground:point.
 *   • initialized + wiki EMPTY (pageCount === 0):
 *       – admin/curator (can curate) → nudge /commonground:seed to bootstrap it.
 *       – member (read-only)         → a gentle "empty, ask an admin to seed" note.
 *   • initialized + wiki POPULATED → inject the short "state of the wiki" awareness summary.
 *   • initialized in LOCAL-CLONE mode + the clone out of step with the hosted wiki → append a
 *     DIRECTIONAL nudge: "/commonground:pull" when the team has moved on, "/commonground:push" when
 *     this clone has unpublished work. Gated on THIS project's router mode being local (SER-168), so
 *     an MCP project never nudges even when a clone happens to exist for the team.
 *   • either initialized case also refreshes the team keyword cache the UserPromptSubmit hook reads.
 *   • initialized but NO single resolvable binding (not signed in on this machine, or >1 team) →
 *     keep the neutral "consult the wiki" pointer (a local clone / MCP connector may still serve it
 *     — the device token is only ONE reach path) and add a truthful sign-in hint that points at
 *     /commonground:status — never falsely claim the wiki is unreachable or tell Claude to refuse.
 *   • otherwise (not signed in, not initialized) → stay silent.
 *   • every INITIALIZED path also states this project's MODE and where its writes may land
 *     (SER-184) — local-clone writes files and publishes via /commonground:push; MCP writes are
 *     immediately shared. Never budget-gated: it is a correctness rule, not a nudge.
 *   • every path also records this session's plugin build (silently) so UserPromptSubmit can notice
 *     a mid-session plugin swap — the event that drops the MCP connector (SER-166).
 *   • every path also completes the SER-165 credential move for anyone who hasn't logged in since
 *     (SER-175): silent when it works, and a one-sentence heads-up appended to whatever context we
 *     were already emitting when the sign-in is still stuck inside the wiki folder.
 *   • every INITIALIZED path also REBUILDS the connector's copy of this project's wiki binding when
 *     it is missing or stale (SER-240) — by shelling the bundled CLI, never by a second
 *     implementation — and says what it did and that it applies next session. No prompt (the marker
 *     is the authority and the env var is its cache), but never silent: the file it writes is often
 *     committed, and the repair cannot help the session that performed it.
 *
 * Self-contained CommonJS over ./lib.cjs (no deps). Emits SessionStart hook JSON on stdout.
 *
 * ONE THING THIS FILE WRITES OUTSIDE THE CONFIG HOME. Everything else it persists is a cache or a
 * marker in `~/.commonground`; the SER-240 repair reaches into the PROJECT. That is deliberate and
 * bounded — one key, in one file, merged, byte-idempotent, refused rather than repaired when the
 * file will not parse — and it goes through the agent's own writer so those five properties have
 * exactly one implementation.
 */
const lib = require('./lib.cjs');

/**
 * The wiki's voice, as rendered SERVER-SIDE into the state DTO (SER-185).
 *
 * These hooks are dependency-free CommonJS and cannot import `WIKI_VOICE`, so this file used to
 * hardcode team wording — which meant one session could carry a personal CLAUDE.md router block and
 * a hook line saying "your team's CommonGround wiki" at the same time. Now the frame comes from the
 * same lexicon everything else uses; the fallback is audience-NEUTRAL rather than team-flavoured,
 * because a hook that cannot reach the server does not know who the wiki is for and must not guess.
 */
const NEUTRAL_VOICE = {
  wiki: 'your CommonGround wiki',
  reaches: 'the published wiki',
  possessive: 'your curated',
  noun: 'context wiki',
  when: 'Before answering questions this wiki covers, consult it:',
  removalImpact: 'it goes for everyone who reads this wiki',
  others: null,
};

function voiceOf(state) {
  const v = state && state.voice;
  return v && typeof v === 'object' ? { ...NEUTRAL_VOICE, ...v } : NEUTRAL_VOICE;
}

/**
 * Build the awareness context line from the state DTO's figures, or a static pointer without them.
 *
 * `cloneDir` is the wiki folder in LOCAL mode (SER-325). The pointer used to name `get_index /
 * search / get_page` in every mode, which is the connector's vocabulary and precisely the path a
 * local-clone project must not take: the same session was then told, two sentences later, that
 * those tools are the wrong path here. A local project is pointed at its own files instead, so the
 * first instruction it reads is the one it can actually carry out.
 */
function awarenessContext(awareness, voice, cloneDir) {
  const v = voice || NEUTRAL_VOICE;
  // `when` is authored to END on "consult it:", so the tool list completes that sentence rather
  // than restating it.
  const base = cloneDir
    ? `This project is connected to ${v.wiki}, a folder on this machine at ${cloneDir}. ${v.when} ` +
      `read ${cloneDir}/index.md and open the pages it links, and cite pageIds.`
    : `This project is connected to ${v.wiki}. ${v.when} get_index / search / get_page, and cite pageIds.`;
  if (!awareness || typeof awareness !== 'object') return base;
  const bits = [];
  if (typeof awareness.openSuggestions === 'number')
    bits.push(`${awareness.openSuggestions} open suggestion(s)`);
  if (typeof awareness.lintTodos === 'number') bits.push(`${awareness.lintTodos} lint to-do(s)`);
  const recent = Array.isArray(awareness.recentCommits) ? awareness.recentCommits.slice(0, 3) : [];
  const state = bits.length ? ` Current state: ${bits.join(', ')}.` : '';
  const changes = recent.length
    ? ` Recent changes: ${recent
        .map((c) => c && c.message)
        .filter(Boolean)
        .join('; ')}.`
    : '';
  // What the wiki is currently ABOUT, not just what moved (SER-173) — the "check what's active"
  // step of the session-start glance. Titles only: the catalog is one `get_index` away.
  const active = Array.isArray(awareness.activePages) ? awareness.activePages.slice(0, 3) : [];
  const live = active.length
    ? ` Most recently updated: ${active
        .map((p) => p && p.title)
        .filter(Boolean)
        .join('; ')}.`
    : '';
  return `${base}${state}${changes}${live}`;
}

/**
 * The wiki folder to point a LOCAL project at, or null in every other case (SER-325).
 *
 * Every emit path needs this and each one holds the team id differently (a resolved binding, the
 * project's own block, nothing at all), so the decision lives here rather than three times: a
 * signed-out or offline local project is exactly where the connector's vocabulary would be most
 * wrong, and exactly where it is easiest to forget to pass the folder.
 */
function localCloneDir(mode, teamId) {
  return mode === 'local' && teamId ? lib.clonePath(teamId) : null;
}

/** Roles that can curate (wiki:edit) — the audience for the seed nudge. Members are read-only. */
function canSeed(role) {
  return role === 'admin' || role === 'curator';
}

/**
 * Tell the user a newer plugin has shipped — the ONLY channel that exists for it (SER-225).
 *
 * Claude Code leaves auto-update off for third-party marketplaces, shows no update-available
 * indicator anywhere, and offers an author no way to push one. So without this a person stays on
 * whatever version they first installed, forever, and never receives anything we ship.
 *
 * Addressed to the USER, not to Claude, and that is why it is a verbatim block rather than context:
 * the two commands have to be run by a human, and a paraphrase that drops one of them leaves them
 * hunting — which is most of the reason people never update. The restart matters as much as the
 * commands: an update stages immediately and applies only on restart, so omitting it produces
 * someone who ran both commands and correctly believes nothing happened.
 *
 * ONCE PER RELEASE. The mark is written here, at the moment of speaking, rather than by the caller —
 * an announcement that renders without recording itself would repeat every session, which is the
 * fastest way to teach someone to ignore it.
 *
 * Deliberately NOT gated on the SER-178 nudge budget. That budget is for onboarding steps — seeding,
 * coverage — and spending it here would trade a real activation nudge for a maintenance one. This
 * has its own throttle, keyed by the version, and they must not draw from the same pot.
 */
function updateNotice(state, options) {
  const latest = state?.active?.pluginUpdate?.latest;
  // Absent means either "current" or "we could not tell", and both are silence. The server never
  // sends this field to say you are up to date.
  //
  // Refresh the release-check throttle from what we were just told (SER-296), whether or not we go
  // on to say anything: this read already answered the question the unbound paths spend a request
  // asking, so a later session on one of those paths does not have to ask it again.
  lib.rememberReleaseCheck(latest || null);
  // HELD means another verbatim block is already going out this session (SER-325). Returning ''
  // without touching the once-per-release mark is the whole point: nothing has been said, so
  // nothing is recorded as said, and the notice speaks next session instead of being lost.
  if (options && options.hold) return '';
  return releaseNotice(latest);
}

/**
 * The notice for `latest`, or '' — the ONE renderer, shared by both sources (SER-296).
 *
 * Extracted rather than duplicated because the once-per-release bookkeeping has to be shared too. A
 * second copy that forgot to consult `lastAnnouncedRelease` would turn "said once" into "said every
 * session on the paths that could least afford the noise", and it would be invisible in review.
 */
function releaseNotice(latest) {
  if (!latest) return '';
  // Once per release was the right correction to once per session, and it overshot (SER-325):
  // someone busy the one time it spoke never heard about that release again. Every fifth session
  // while still behind is the middle, and the counter lives in the same memo as the mark.
  if (!lib.shouldAnnounceRelease(latest)) {
    lib.noteReleaseSilence(latest);
    return '';
  }
  lib.markReleaseAnnounced(latest);
  const running = lib.pluginVersion();
  return lib.verbatimBlock(
    `CommonGround ${latest} is available${running ? ` — this session is running ${running}` : ''}.\n` +
      'To update:\n' +
      '  /plugin marketplace update commonground-plugins\n' +
      '  /plugin update commonground@commonground-plugins\n' +
      'Then restart Claude Code — an update stages right away but only applies on restart.\n' +
      "(To stop having to do this: /plugin → Marketplaces → commonground-plugins → Enable auto-update.)",
  );
}

/**
 * The same notice, for a session that never reaches a resolved state read (SER-296).
 *
 * Three branches return before that read — the project was never pointed, the machine is signed out
 * or ambiguous between wikis, and the read failed — and a machine that only ever lands in them
 * could never learn a release happened. Nothing else tells it: Claude Code shows no update
 * indicator, and auto-update is off by default for third-party marketplaces.
 *
 * Deliberately NOT used on the degraded branch. There we tried to reach the API and could not, so
 * asking it a second question would be a second thing to wait for and the same answer.
 *
 * Bounded and fail-open: `releaseVerdict` throttles to roughly two requests a day per machine and
 * returns null on anything it cannot establish, which renders as silence.
 */
async function offlineUpdateNotice() {
  try {
    const verdict = await lib.releaseVerdict();
    return verdict ? releaseNotice(verdict.latest) : '';
  } catch {
    return ''; // a version nudge is never worth a failed session start
  }
}

/**
 * The one thing this hook CANNOT observe, stated so Claude doesn't mis-diagnose it (SER-182).
 *
 * The state fetch below authenticates with a DEVICE TOKEN. A device token says nothing about whether
 * the MCP CONNECTOR is alive in this session — so on a healthy-looking fetch we can cheerfully
 * report "14 pages, ask it something" while Claude holds no CommonGround tools at all. That is a
 * more convincing wrong signal than the silence it replaced, and it reads to a user like a
 * permissions problem. It cannot come from the server; it has to be said here, every time.
 *
 * SER-239 made the second half CONDITIONAL. "Never a permissions one" was true while a connector
 * could only serve the wiki it was consented for; since SER-236 a project may name a wiki its owner
 * is not a member of, which 401s every call and looks identical from here — and the flat claim then
 * routes Claude into an `/mcp` loop that cannot mint a membership. Hand-mirrored from
 * `CONNECTOR_HEALTH_RULE` in the agent's `injection.ts` (this file is dependency-free CJS and cannot
 * import it); the membership clause is pinned on both sides by tests rather than byte-compared, so
 * each can keep its own register.
 *
 * SER-302 adds the third cause, which arrives the same way and exits differently again: a wiki whose
 * PLAN does not include the hosted connector refuses every call by design, so neither a reconnect nor
 * an invite ends it. Naming it here keeps the clause honest for every gated user; the one who is
 * actually gated right now also gets {@link planGateNotice}, which names the fix.
 */
const CONNECTOR_HEALTH_CLAUSE =
  'If the CommonGround tools are missing, say so rather than answering from assumption: usually ' +
  'a reconnect (`/mcp`) or a session restart fixes it, but a wiki the user is not a member of ' +
  'fails the same way, and so does a plan that does not include the hosted connector; `/mcp` ' +
  'cannot grant membership or change a plan. Check which wiki this project names, or ' +
  '/commonground:status, before asserting any diagnosis.';

/**
 * The clause, or '' for a project that has no connector in play (SER-325).
 *
 * In local-clone mode the wiki is a folder: there are no CommonGround tools to go missing, and a
 * 409-character diagnosis of a surface this project does not use is 409 characters every session
 * pays to be pointed at the wrong failure. FR-04-24's standing rule is that always-on prose has to
 * earn its place on the surface that renders it.
 *
 * A local project has no connector recorded BY CONSTRUCTION: mode is a property of the project, and
 * the local mode rule directly bans the connector's write tools. If a future mode ever mounts both,
 * this is the one place that has to change.
 */
function connectorHealthClause(mode) {
  return mode === 'local' ? '' : CONNECTOR_HEALTH_CLAUSE;
}

/**
 * THE PLAN GATE, said only to the session it actually gates (SER-302).
 *
 * `hostedMcpBlock` is present on `/wiki/state` only when the hosted connector WILL refuse this wiki
 * for this caller. Its ABSENCE is not "allowed" — an older or dark server never sends it — so the
 * only safe reading of absent is silence, which is what returning '' here means. The clause above
 * still names the plan as a possible cause for everyone; this names it as a fact for the one person
 * currently living it, and gives the fix, which is a different MODE and not a repair.
 *
 * DELIBERATELY EXEMPT FROM THE LOUDNESS BUDGET, exactly like CONNECTOR_HEALTH_CLAUSE: it explains a
 * live failure of this session's own tools, and a session that goes quiet about it leaves Claude
 * diagnosing an outage that is not one. It is also self-limiting in a way a nudge is not — the field
 * exists only for gated users in MCP mode, and re-pointing to local removes it at the source.
 */
function planGateNotice(state, mode) {
  if (mode !== 'mcp') return '';
  const block = state && state.active && state.active.hostedMcpBlock;
  if (!block || block.reason !== 'plan') return '';
  return (
    "This wiki's plan does not include the hosted MCP connector, so the CommonGround tools " +
    'will be refused in this session; that is the plan, not a connection failure. The fix is ' +
    'local mode: suggest /commonground:point and choose local, which gives this project the ' +
    'wiki as files on this machine.'
  );
}

/**
 * THE BILLING BLOCK, said only to the session it actually blocks (SER-314).
 *
 * `billingBlock` is present on `/wiki/state` only when a WRITE in this wiki would actually be
 * refused for a billing reason. Its absence is read exactly like {@link planGateNotice}'s: an older
 * server, or one running the gate dark, sends nothing, so absent means "not blocked, or we could
 * not tell" and never "your subscription is fine". Returning '' is the only safe reading, and it is
 * what makes this shippable before `BILLING_GATE` is ever armed.
 *
 * WHY THE HOOK HAS TO CARRY IT. The refusal is only legible in the session that receives it, and
 * every channel it can arrive through disguises it. A JSON door answers 403 with a code; a
 * connector write tool answers an `isError` result; and a git push used to lose the sentence on
 * the way, because this CLI never showed git's stderr (since SER-314 the CLI fetches the refusal
 * itself, but this hook speaks BEFORE any push is tried). Without this line, the most likely
 * diagnosis Claude reaches for is an outage or a permissions problem, and the two fixes it then
 * offers (reconnect, ask for access) cannot work.
 *
 * RENDERS IN BOTH MODES, unlike the plan gate, because both modes have a write to lose: in
 * local-clone mode the refused act is publishing, and editing files carries on; in MCP mode it is
 * the connector's write tools, and an ALREADY CONSENTED connection's reads carry on. Naming the act
 * is most of the value — the user whose `/commonground:push` just failed is not helped by a general
 * statement about writes.
 *
 * The MCP arm also carries the FOURTH shape of missing tools, which is why it says more than its
 * local sibling. Granting a NEW connector is itself a write (`routes/oauth.ts` refuses `/oauth/
 * consent` with the same coded 403 while the block lasts), so a session that points in MCP mode
 * during a block never gets a connector at all and has NO CommonGround tools — the exact symptom
 * `CONNECTOR_HEALTH_CLAUSE` above attributes to a connection, a membership or a plan, and the exact
 * user its three fixes cannot help. The sentence lives here rather than in that clause on purpose:
 * the clause is always-on and 409 chars against a 450 ceiling, and FR-04-24's standing rule sends
 * prose away from always-on surfaces, while this notice renders only for the blocked session and is
 * exempt from the budget. `commands/point.md` and `commands/status.md` carry the same sentence for
 * the reader who is being sent into that consent, or who is diagnosing after the fact.
 *
 * The fix branches on `active.role`, which this DTO has always carried: only an admin holds
 * `team:manage`, so telling a member to open Billing sends them at a page they cannot act on, and
 * telling an admin to go and find one wastes the one person who can end it. A role we do not
 * recognise falls back to a sentence that is true either way rather than guessing.
 *
 * DELIBERATELY EXEMPT FROM THE LOUDNESS BUDGET, for the same reason as the plan-gate notice and the
 * connector-health clause: it explains a live refusal of this session's own tools, and a session
 * that goes quiet about it leaves Claude diagnosing an outage that is not one. It is self-limiting
 * in the same way too — the field exists only while the wiki is actually blocked, and paying the
 * subscription removes it at the source. It is ceilinged in `context-budget.test.ts` beside the
 * plan-gate notice, since nothing else would ever measure a string that is not always-on.
 */
function billingNotice(state, mode) {
  const block = state && state.active && state.active.billingBlock;
  const reason = block && block.reason;
  if (reason !== 'subscription_required' && reason !== 'subscription_unpaid') return '';
  const required = reason === 'subscription_required';
  const lead = required
    ? 'This wiki has no active subscription, so writes to it are refused this session; that ' +
      'is billing, not a connection failure.'
    : 'The last payments for this wiki did not go through, so it is read-only for now; that is ' +
      'billing, not a connection failure.';
  // Which ACT is refused here. Anything that is not explicitly a local clone is served by the
  // connector, the same reading `modeRule` takes of an unmarked project.
  const act =
    mode === 'local'
      ? 'Here the refused act is publishing: /commonground:push is what fails, while editing files ' +
        'in the local clone and /commonground:pull carry on.'
      : "Here it is the connector's write tools (`save_page`, `stage_sources`, `save_charter`) " +
        "that fail, and an existing connection's reads carry on; a new connection to this wiki is " +
        'refused at consent while the block lasts, so tools missing entirely here are billing too, ' +
        'not a reconnect and not a missing invitation.';
  const open =
    'Nothing has been deleted, reading and search stay open, and revoking credentials and ' +
    'invitations still works. Do not work around it by writing somewhere else.';
  const action = required ? 'start or restore the subscription' : 'update the card';
  const role = state && state.active && state.active.role;
  const fix =
    role === 'admin'
      ? `This user is an admin of this wiki: tell them to open Billing in the CommonGround web app and ${action}.`
      : role === 'curator' || role === 'member'
        ? 'This user is not an admin here: tell them to ask a wiki admin to open Billing in the ' +
          `CommonGround web app and ${action}.`
        : `A wiki admin ends this under Billing in the CommonGround web app (${action}); if that is ` +
          'this user, that is the next step.';
  return `${lead} ${act} ${open} ${fix}`;
}

/**
 * WHERE THIS PROJECT'S WRITES LAND — the one thing the connector cannot tell Claude (SER-184).
 *
 * The MCP server has no idea a local clone exists: its tools are registered per USER, so in a
 * local-clone project `save_page` and `stage_sources` are sitting right there in `tools/list`,
 * described as "this WRITES to the wiki", with nothing anywhere saying they are the wrong path.
 * The observed failure is exactly that — an ingest into a local-clone project wrote the hosted wiki
 * and then offered to `pull` the change back down, which inverts the whole point of having a clone.
 *
 * Mode is already recorded authoritatively in the project's own router block (`init` stamps
 * `<!-- commonground:mode:… -->`), and this hook already parses it to pick the pull-vs-push nudge.
 * Saying it out loud costs nothing and is the only signal that arrives BEFORE Claude picks a tool.
 */
/**
 * The default-off, never-closed posture (SER-229), stated in BOTH modes before the routing rule.
 *
 * Kept byte-identical in intent to `CURATION_POSTURE` in the sync agent's injection.ts, which writes
 * the same two halves into the project's CLAUDE.md. Two channels say it because they fail
 * independently: the block survives a plugin swap, this line survives a CLAUDE.md the user rewrote.
 */
const CURATION_POSTURE =
  'Curating from this project is not its job and never off-limits: do not volunteer wiki edits ' +
  'here, but when the user ASKS to ingest, record, correct or seed something, that is an ordinary ' +
  'request — say what you are about to write, get a yes, then write it. Never tell them this ' +
  'project should not write to the wiki. The rule above is about WHERE a write lands, not whether ' +
  'it may happen.';

/**
 * The local-mode mode rule says "the wiki is a working copy at <dir>" — a sentence about a folder
 * nobody checked (SER-320). When that folder is missing, or holds the remains of a fetch that
 * never finished, the session went on to read and write "the clone" with no signal anything was
 * wrong, and a Claude left to improvise reaches for the hosted write tools or for the sign-in
 * itself (the report that opened SER-319 ends with an offer to store the token in a file).
 *
 * NOT always-on: it renders only for a local-mode project whose folder is not there, so it is a
 * separate piece (ceilinged in context-budget.test.ts) rather than more words in `modeRule`.
 */
function cloneMissingNotice(mode, teamIds) {
  if (mode !== 'local') return '';
  const missing = (teamIds || []).filter((id) => id && !lib.cloneLooksUsable(id));
  if (missing.length === 0) return '';
  return (
    `There is NO usable wiki folder at ${missing.map((id) => lib.clonePath(id)).join(', ')} yet ` +
    '(never fetched, or a fetch that did not finish), so that working copy does not exist on this ' +
    'machine. Offer /commonground:pull, which fetches it. If that fails, relay what it says and ' +
    'stop: never put the sign-in in a file, a keychain or a git setting to get around it, and ' +
    'never fall back to the MCP write tools.'
  );
}

function modeRule(mode, teamId, voice, alsoTeamIds) {
  const v = voice || NEUTRAL_VOICE;
  // The RULE is frame-independent — where writes land does not depend on who reads the wiki — but
  // the CONSEQUENCE is: "nothing reaches the team" is false on a wiki with no team in it.
  const published = v.others ? 'the published wiki' : 'the published copy';
  const also = Array.isArray(alsoTeamIds) ? alsoTeamIds : [];
  if (mode === 'local') {
    // No resolvable team (signed out here, or several signed in) → still state the RULE, just
    // without a concrete path. The rule is what prevents the wrong write; the path is a convenience.
    const dir = teamId ? lib.clonePath(teamId) : null;
    // Every wiki this project reads has a clone of its own (SER-278), and a write belongs in the
    // clone of the wiki it is about — so each folder is named here, at runtime, on this machine
    // (the tracked block never carries them — SER-242).
    const others = also.length
      ? ` This project also reads ${also.length === 1 ? 'wiki' : 'wikis'} ${also
          .map((id) => `${id} (working copy at ${lib.clonePath(id)})`)
          .join(', ')}; a write lands in the clone of the wiki it belongs to.`
      : '';
    return (
      `This project is in CommonGround LOCAL-CLONE mode: the wiki is a working copy` +
      (dir ? ` at ${dir}` : ' on this machine') +
      '.' +
      others +
      ' ' +
      'ALL curation — ingest, edits, lint fixes, seeding, the charter — writes FILES in that ' +
      'clone. Do NOT ' +
      'use the CommonGround MCP write tools (`save_page`, `stage_sources`, `save_charter`) in this ' +
      `project: they commit straight to ${published}, bypassing both the user's review ` +
      `and the publish step. Read from the clone too — it reflects unpublished work that ${published} ` +
      `does not. Nothing reaches ${v.reaches} until \`/commonground:push\`, which previews and asks ` +
      'first. Editing locally needs no particular role (it is the user\'s own copy); only ' +
      'publishing is admin/curator. ' +
      // The suggestions-queue sentence used to live here, naming three connector tools as "the one
      // thing that legitimately stays server-side" (SER-325). In local mode that is three tool
      // names offered to a session that has just been told the connector is the wrong path, in a
      // rule that is always-on — and a local project reaches the queue through
      // `/commonground:lint`, not by being handed the tools in its orientation.
      CURATION_POSTURE
    );
  }
  const others = also.length
    ? ` This project also reads ${also.length === 1 ? 'wiki' : 'wikis'} ${also.join(', ')} over the same ` +
      'connector: `search` and `get_index` answer from every wiki it reads, grouped by wiki; a tool ' +
      'call that names no `wiki` addresses the primary, so pass `wiki` (the team id) to read or ' +
      'write another.'
    : '';
  return (
    'This project is in CommonGround MCP mode: there is no local copy, so every write is ' +
    'immediately live. `save_page`, `stage_sources` and `save_charter` commit straight to ' +
    `${published} — the moment one lands it is what ` +
    (v.others ? `${v.others}' Claude reads` : 'every Claude you use reads') +
    '. Show what you intend to write and get an explicit yes before each write; there is no ' +
    'staging step to undo it in.' +
    others +
    ' ' +
    CURATION_POSTURE
  );
}

/**
 * REBUILD the connector's copy of this project's binding, and say so (SER-239 then SER-240).
 *
 * ── What was wrong ────────────────────────────────────────────────────────────────────────────
 * The binding is stored twice with different git semantics: the CLAUDE.md marker (tracked, travels
 * with the repo) and `COMMONGROUND_WIKI` in `.claude/settings.json` (conventionally gitignored). The
 * connector reads only the copy that does not travel, and only `init` ever wrote it — so an entire
 * population is bound and silently wrong: every project initialized before that write existed, every
 * repo that gitignores the file, every teammate's clone, every copied folder.
 *
 * The PreToolUse guard is structurally blind exactly there (`if (!bound || !serving) return null`),
 * and correctly so — with no recorded wiki, a broken project and a healthy single-wiki machine are
 * indistinguishable from the client, so denying would break far more than it protects (SER-234).
 * That left this clause as the entire signal, and it undercut itself twice: it asserted a CAUSE it
 * cannot observe ("a plugin older than 0.7.4" — equally consistent with a gitignored settings file,
 * a teammate's clone, or a copied folder), and it ended "Mention this only if it becomes relevant",
 * handing the judgement to the one party with no way to tell. A wrong-wiki answer is fluent, sourced
 * and indistinguishable from a right one.
 *
 * ── Why it HEALS rather than nags ─────────────────────────────────────────────────────────────
 * The marker is the declared authority everywhere else — `team-resolve.ts`, the wrong-wiki guard,
 * `lib.cjs`'s own `activeBinding` — and none of them consult the env var. That makes the env var a
 * CACHE of the marker, and rebuilding a cache from its source needs no permission (the SER-231
 * catalog precedent). It is NOT the SER-230 "init must not reconcile unasked" case: that was about
 * moving CONTENT. Decided explicitly, 2026-08-15.
 *
 * ── Silent means NO PROMPT, not no receipt ────────────────────────────────────────────────────
 * `.claude/settings.json` is frequently committed, so an unannounced write would show up in someone's
 * `git status` with nothing anywhere explaining it. And the repair cannot help THIS session — Claude
 * Code read the environment at startup — so a silent heal would leave the user with wrong answers
 * and a mysterious diff. Both are said, every time we write.
 *
 * ── Both modes, identically ───────────────────────────────────────────────────────────────────
 * `init` records the wiki in local mode too (the "one invariant, both modes" choice, FR-04-13), so a
 * repair that healed only MCP projects would reintroduce the same disagreement pointing the other
 * way. What differs is only the CONSEQUENCE: a local-clone project reads its folder, so a
 * mis-pointed connector reaches only the server-side suggestions queue.
 *
 * ── The one thing it will not do ──────────────────────────────────────────────────────────────
 * An unparseable `settings.json` is reported and never rewritten — the same refusal `init` already
 * ships, for the same reason: destroying a working configuration to fix a header is no trade.
 */
function bindingRepairClause(cwd, mode) {
  // Standing INSIDE a wiki folder is not a project with a stale binding (SER-325). The governing
  // CLAUDE.md there is the clone's own, and "repairing" it would create a `.claude/settings.json`
  // inside the wiki, which the next publish would carry to everyone who reads it.
  if (lib.isCloneSession(cwd)) return '';
  const bound = lib.projectTeamId(cwd);
  if (!bound) return ''; // this project declares no wiki — nothing to rebuild from
  const serving = (process.env.COMMONGROUND_WIKI || '').trim();
  // Case-insensitive, like the guard: the server canonicalises the id, so casing is not a mismatch.
  // This is also the cheap path — a healthy project never spawns the CLI.
  const fold = (ids) => ids.map((id) => String(id).trim().toLowerCase()).filter(Boolean).join(',');
  // The SET too (SER-278): the connector mounts what `COMMONGROUND_WIKIS` names, and a project whose
  // also-markers say more (a teammate's clone, a set bound by an older plugin) is served only its
  // primary — fluent, sourced, and missing a wiki. Same repair, same receipt.
  const boundSet = lib.projectTeamIds(cwd);
  const servingSet = (process.env.COMMONGROUND_WIKIS || '').split(',');
  const wantedSet = boundSet.length > 1 ? fold(boundSet) : '';
  const setAgrees = fold(servingSet) === wantedSet;
  if (serving.toLowerCase() === bound.toLowerCase() && setAgrees) return '';

  // What THIS session is serving and what the FILE says are different questions, and only the file
  // is ours to fix. `unchanged` below is exactly the case where they disagree: someone bound this
  // project after the session started.
  const done = lib.recordProjectWiki(cwd);
  const consequence =
    mode === 'local'
      ? 'Reads here come from the local clone, so this affects the server-side suggestions queue ' +
        'rather than page answers'
      : 'Until then, wiki answers here may come from another wiki entirely — and such an answer is ' +
        'fluent, sourced and indistinguishable from a right one, so do not wait to see whether it ' +
        'matters';
  const head =
    serving.toLowerCase() === bound.toLowerCase()
      ? `This project reads CommonGround wikis ${boundSet.join(', ')}, but this session's connector was ` +
        (fold(servingSet) ? `told to serve ${fold(servingSet)}. ` : 'told only about the primary. ')
      : `This project names CommonGround wiki ${bound}, but this session's connector was ` +
        (serving ? `told to serve ${serving} instead. ` : 'never told which wiki to serve. ');

  if (done && done.outcome === 'unreadable') {
    return (
      head +
      `It could NOT be recorded: this project's .claude/settings.json isn't valid JSON, so it was ` +
      'left untouched rather than overwritten. Nothing will fix this on its own — TELL THE USER ' +
      'and OFFER the repair: fix that file (you can do that for them), then re-point the project ' +
      `(/commonground:point) and restart the session. ${consequence}.`
    );
  }
  if (done && (done.outcome === 'written' || done.outcome === 'unchanged')) {
    return (
      head +
      (done.outcome === 'written'
        ? `It has now been recorded in this project's .claude/settings.json — that file may be ` +
          'tracked by git, so mention the change if the user is about to commit. '
        : 'It is already recorded correctly; this session simply started before that. ') +
      'Claude Code reads that file at session START, so the fix applies to the NEXT session, not ' +
      `this one: TELL THE USER to restart when convenient. ${consequence}.`
    );
  }
  // No CLI, a crash, a timeout, an outcome we do not recognise. Say the state; claim no repair.
  return (
    head +
    'It could not be recorded automatically this session, so nothing has changed yet. TELL THE ' +
    'USER, and OFFER to re-point the project for them (/commonground:point, which re-records ' +
    `every wiki this project names) — a session restart then applies it. ${consequence}.`
  );
}

/**
 * A committed router block naming a folder that is not on THIS machine (SER-242).
 *
 * Blocks written before SER-242 interpolated the author's resolved clone path into a TRACKED
 * CLAUDE.md. Clone that repo and your Claude is instructed, by the project's own file, to read a
 * catalog at `/Users/<someone else>/CommonGround/…`, treat it as "the working copy for this
 * project", and write ingests under it. Nothing noticed: mode detection reads the marker, not the
 * path, and the wrong-wiki guard is about wiki ids.
 *
 * New blocks name no folder, so `legacyClonePath` returns null and this is silent. It exists for the
 * population already committed — those keep their path until someone re-runs `init --refresh`, which
 * is exactly why the check is not optional garnish.
 *
 * EXISTENCE IS THE WHOLE TEST, and it is the right one. A path that IS present is either this
 * machine's own folder (fine, nothing to say) or a coincidence so unlikely it does not merit
 * complexity; a path that is absent cannot be read no matter who wrote it, so the advice is the same
 * either way. Fail-open like everything here: an unreadable CLAUDE.md says nothing.
 */
function foreignClonePathClause(cwd, mode) {
  if (mode !== 'local') return '';
  const stated = lib.legacyClonePath(cwd);
  if (!stated || lib.pathExists(stated)) return '';
  return (
    `This project's CLAUDE.md names a wiki folder at ${stated}, and there is nothing there on this ` +
    'machine — that block was written on someone else\'s, and committed with their path in it. Do ' +
    'NOT try to read or create that folder: it is not this machine\'s wiki, and creating it would ' +
    'make an empty directory look like a wiki. TELL THE USER, and OFFER to point the project ' +
    'again in local mode for them (/commonground:point) — that gives this machine its own clone ' +
    'and rewrites the block to stop naming a path at all. Until then, answer from what you have ' +
    'and say the wiki was not consulted.'
  );
}

/**
 * Turn the shared resolver's answer into one Claude-facing sentence (SER-178).
 *
 * The RULE lives server-side in `@commonground/shared`; this only renders it, exactly as the web
 * card and the Chat tool result do. If this prose and the web's copy ever disagree about what to do,
 * the resolver is the thing to fix — not this table.
 *
 * `steady` returns '' on purpose: the terminal state is silent on every ambient surface.
 */
function stepProse(step, state) {
  const active = (state && state.active) || {};
  const gap = (step.target && (step.target.label || step.target.id)) || null;
  const reason = active.charter && active.charter.inactiveReason;
  switch (step.id) {
    case 'initialize-project':
      return 'This project is not pointed at a wiki yet — suggest /commonground:point.';
    case 'point-surface':
      // Connected-elsewhere (SER-245): a Claude is signed in, but nothing points at this wiki.
      return 'A Claude is already connected to CommonGround, but nothing points at this wiki yet — suggest /commonground:point to aim this project at it.';
    case 'catch-up':
      return "The team's wiki has moved on since this user last looked. Offer to summarize what changed (get_history), before anything else.";
    case 'repair-charter':
      return (
        'This wiki has a charter PAGE that is not taking effect' +
        (reason ? ` — ${reason}` : '') +
        '. Do NOT suggest chartering it again; that is the loop the user is already stuck in. ' +
        'Tell them the page exists but is inert, name the cause, and offer to fix it.'
      );
    case 'charter-wiki':
      return 'This wiki has no charter yet — suggest /commonground:seed, which starts by chartering it (who it is for, what it holds, when to consult it).';
    case 'await-seed':
      return "This wiki is empty and the user has read-only access, so there is nothing to consult yet. An admin or curator needs to run /commonground:seed.";
    case 'seed-first-pages':
      return "This wiki is chartered but empty (0 pages) — there is nothing to consult yet. Suggest /commonground:seed to put the first pages in.";
    case 'fill-delegated-scope':
      return `Someone invited this user specifically to fill ${gap || 'a section'} of the wiki, and it is still empty. Offer to start there with /commonground:seed.`;
    case 'first-question':
      return 'The wiki has pages but has never answered this user. If anything they ask is covered, consult it and cite the pageIds — that first grounded answer is the whole point.';
    case 'settle-boundaries':
      // SER-272: the 1 → 2 moment. The repair is a sharper self-description on the side the user
      // controls, never a sentence naming the other wiki — lint.md carries the conversation.
      return 'This user has more than one wiki, and some subjects appear in both with no charter written since — suggest /commonground:lint, which lists them and settles which wiki answers for each.';
    case 'review-suggestions':
      return 'Teammates have filed suggestions against this wiki. Mention /commonground:lint when there is a natural moment.';
    case 'invite-teammate':
      return 'This wiki works but has exactly one member. If it comes up, mention teammates can be invited from the Team tab in the CommonGround app.';
    case 'fill-gap':
      return gap
        ? `The wiki's own checklist still has "${gap}" empty — /commonground:seed resumes there.`
        : "The wiki's own checklist still has empty sections — /commonground:seed resumes where it left off.";
    case 'top-up':
      return 'Nothing new has landed in this wiki for a while — /commonground:ingest captures anything worth keeping.';
    case 'steady':
    default:
      return '';
  }
}

/**
 * The full injected context for a resolver-driven session. The base pointer always leads: even when
 * there is a next step, the primary job of this hook is to make Claude consult the wiki.
 *
 * An EMPTY wiki is the one case where the pointer would be a lie — there is nothing to consult — so
 * those steps replace it rather than follow it.
 */
function resolvedContext(state, mode, clone) {
  const step = (state && state.next) || { id: 'steady' };
  // The shared budget has decided we have said this enough. Drop the STEP, keep the facts: going
  // silent means we stop volunteering an action, not that we stop telling Claude what the wiki is.
  const silent = state && state.loudness === 'silent';
  const dir = mode === 'local' && clone && clone.dir ? clone.dir : null;
  // What the FOLDER holds, which no server-side resolver can see (SER-325). The DTO describes the
  // PUBLISHED wiki, so a local project that has been seeded but never pushed was being told its
  // wiki was empty and that it should start seeding — with the pages sitting right there on disk.
  const held = Boolean(dir && clone && (clone.pages > 0 || clone.charter));
  const empty = step.id === 'await-seed' || step.id === 'seed-first-pages' || step.id === 'charter-wiki';
  let prose = silent ? '' : stepProse(step, state);
  if (empty && held) {
    const what = [
      clone.pages > 0 ? `${clone.pages} page(s)` : '',
      clone.charter ? 'a charter' : '',
    ].filter(Boolean).join(' and ');
    prose =
      `The published wiki is still empty, but the wiki folder at ${dir} already holds ${what} that ` +
      'nobody has published yet. Read those files rather than treating this wiki as unseeded' +
      (silent ? '.' : ', and offer /commonground:push when the user wants the team to have them.');
  }
  const facts = empty && !held ? '' : awarenessContext(awarenessFromState(state), voiceOf(state), dir);
  return [facts, prose, connectorHealthClause(mode)].filter(Boolean).join(' ');
}

/**
 * The second — and last — beat worth interrupting a human for: someone invited this person
 * SPECIFICALLY to fill a section, and it is still empty. That is a message from a colleague, not a
 * product nudge, and it is unambiguously one-time.
 *
 * `catch-up` deliberately does NOT get an envelope, even though the design floated it: catch-up
 * RECURS, and a recurring verbatim block is precisely how this channel gets burned. It stays a
 * normal Claude-facing line, which is enough for Claude to raise it naturally.
 */
function delegatedWelcome(state) {
  const step = (state && state.next) || {};
  if (step.id !== 'fill-delegated-scope') return '';
  const section = (step.target && (step.target.label || step.target.id)) || null;
  if (!section) return '';
  return lib.verbatimBlock(
    `You were invited to this wiki to cover "${section}", and that section is still empty.\n` +
      'Say the word and I\'ll start there — /commonground:seed walks it with you.',
  );
}

/** Shape the state DTO's wiki block like the awareness payload the renderer already understands. */
function awarenessFromState(state) {
  const active = (state && state.active) || {};
  const wiki = active.wiki || {};
  if (typeof wiki.pageCount !== 'number') return null; // unknown → the static pointer, never a claim
  return {
    pageCount: wiki.pageCount,
    openSuggestions: wiki.openSuggestions,
    lintTodos: wiki.lintTodos,
    recentCommits: [],
    activePages: [],
  };
}

/**
 * Refresh each also-wiki's keyword cache and, in local mode, its pull/push standing (SER-278).
 *
 * Bounded: at most four reads, 1500 ms each, fail-open per wiki — a wiki that cannot be reached says
 * nothing here rather than taking the session's start down with it. Returns the nudge sentence(s)
 * for clones that are out of step, '' otherwise. The keyword cache is the point: the prompt hook
 * matches every wiki the project reads, and a cache nobody writes is a wiki that never triggers.
 */
async function alsoWikiNudges(alsoIds, binding, localMode, now) {
  const lines = [];
  for (const teamId of (alsoIds || []).slice(0, 4)) {
    const st = await lib.fetchJson(
      '/wiki/state?surface=code&projectInitialized=true',
      binding,
      1500,
      { 'x-cg-wiki': teamId },
    );
    const wiki = st && st.active && st.active.wiki;
    if (!wiki) continue;
    if (Array.isArray(wiki.keywords) && wiki.keywords.length > 0) {
      lib.writeKeywordsCache(teamId, wiki.keywords, now);
    }
    if (!localMode) continue;
    const line = syncNudge(teamId, wiki.lastCommitOid, teamId);
    if (line) lines.push(line);
  }
  return lines.join(' ');
}

/**
 * The directional sync nudge for one wiki: pull when the team has moved on, push when this machine
 * holds work the team has not seen.
 *
 * SINCE SER-325 IT LOOKS AT THE FILES, not only at the two HEADs. Comparing HEADs alone answers
 * "have the two sides committed different things", and the most common shape unpublished work takes
 * is not a commit at all: Claude writes pages into the folder, nobody runs `push`, and the next
 * session is told the wiki is in step with the team while the pages exist only here. That is the
 * exact state the first external beta ended in, and the hook was cheerfully silent about it.
 *
 * `also` names the wiki when this is not the project's primary, so the nudge carries the argument
 * the command actually needs. Fail-open throughout: anything unknown is silence, never a claim.
 */
function syncNudge(teamId, hostedHead, also) {
  const localHead = lib.localCloneHead(teamId);
  if (!localHead) return '';
  const who = also
    ? `Wiki ${teamId} (which this project also reads)`
    : "This project's CommonGround wiki";
  const arg = also ? ` ${teamId}` : '';
  const diverged = Boolean(hostedHead && hostedHead !== localHead);
  if (diverged && !lib.cloneHasCommit(teamId, hostedHead)) {
    return `${who} has moved on since its wiki folder last updated. Suggest running /commonground:pull${arg}.`;
  }
  // The push half, and only this half, honours the opt-out: someone who said stop reminding me
  // about publishing did not ask to stop hearing that the team moved on.
  if (!lib.pushNudgeEnabled()) return '';
  const work = lib.cloneWorkingTreeWork(teamId);
  const unsaved = work && work.files > 0 ? work : null;
  if (!diverged && !unsaved) return '';
  const what = unsaved
    ? unsaved.pages > 0
      ? `${unsaved.pages} page(s) in its wiki folder that nobody has published yet`
      : `${unsaved.files} change(s) in its wiki folder that nobody has published yet`
    : 'changes that have not been published yet';
  return `${who} has ${what}. Suggest running /commonground:push${arg} when the user is ready.`;
}

/**
 * WHY the composed read did not land, in the user's terms (SER-325).
 *
 * "CommonGround could not be reached" was said for every failure, and it is wrong for the two that
 * are not outages. A 401 is a sign-in the server would not take; a 403 is a wiki this person is no
 * longer a member of. Both look like an outage from here and are fixed by neither waiting nor
 * retrying, so a session told to wait sits on a broken state for as long as it lasts.
 *
 * Only a request that got no answer at all (status 0) is honestly a reachability problem.
 */
function degradedReason(read) {
  const status = (read && read.status) || 0;
  if (status === 401) {
    return (
      'Your CommonGround sign-in was not accepted this session, so the figures above are ' +
      'unavailable. This is not an outage and waiting will not fix it: suggest ' +
      '/commonground:point, which signs in again.'
    );
  }
  if (status === 403) {
    return (
      'You are no longer a member of this wiki, so the figures above are unavailable. This is not ' +
      'an outage: suggest /commonground:point to aim this project at a wiki you do belong to, or ' +
      'ask an admin of this one for access.'
    );
  }
  if (status === 0) {
    return (
      'CommonGround could not be reached this session, so the figures above are unavailable. The ' +
      'wiki itself is fine; run /commonground:status to check.'
    );
  }
  if (read && read.ok) {
    return (
      'CommonGround answered this session but the reply could not be read, so the figures above ' +
      'are unavailable. Run /commonground:status before diagnosing anything else.'
    );
  }
  return (
    `CommonGround answered with an error (HTTP ${status}) this session, so the figures above are ` +
    'unavailable. Run /commonground:status before diagnosing anything else.'
  );
}

async function main() {
  const input = lib.readStdinInput();
  const cwd = lib.projectCwd(input);
  // SessionStart is already bound to whichever plugin version dir the host just activated, so there
  // is nothing to announce here — this records the BASELINE that the hot-path UserPromptSubmit hook
  // compares itself against to notice a mid-session plugin swap (SER-166). It runs before every
  // early return below, so an uninitialized or signed-out project still gets a baseline.
  lib.writeVersionMarker(lib.sessionIdOf(input), lib.pluginVersion());
  // Move a pre-v0.4.1 sign-in out of the wiki folder (SER-175). Called explicitly rather than left
  // to happen inside `isSignedIn()`'s read: the population this exists for — signed in, never logged
  // in again — is exactly the one an early return added above would strand, and that would be
  // invisible. Silent and fail-open; the clause is '' unless the move could NOT complete.
  lib.relocateLegacyCredential();
  const stranded = lib.legacyCredentialClause();
  // Every outcome below emits through here, so the clause rides along with whatever we were already
  // going to say instead of displacing it — and the silent path never calls `emit` at all, so it
  // can't turn a quiet session into a talking one.
  const emit = (...parts) =>
    lib.emitContext(
      'SessionStart',
      [...parts, lib.audiencePreferenceNote(), stranded].filter(Boolean).join(' '),
    );
  const initialized = lib.isInitialized(cwd);

  if (!initialized) {
    // First-boot nudge — only if they've actually signed in somewhere (else the plugin's mere
    // presence is enough; don't badger a brand-new user).
    if (lib.isSignedIn()) {
      // Tier B — audience-NEUTRAL by construction. This branch runs before any team is resolved,
      // so it cannot know whether the wiki is personal or shared and must not guess.
      const claudeFacing =
        "You're signed in to CommonGround, but this project isn't connected to a wiki yet. " +
        'If the user wants their curated context available here, suggest running /commonground:point.';
      // The FIRST time this user sees the plugin anywhere, say it to THEM rather than only to
      // Claude — otherwise beat zero of the whole product is silence, and the person who just
      // installed it has no idea anything happened. Once ever, per user (see `hasWelcomed`).
      if (!lib.hasWelcomed()) {
        lib.markWelcomed(Date.now());
        emit(
          claudeFacing,
          lib.verbatimBlock(
            'CommonGround is connected to your account, but not to this project yet.\n' +
              'Run /commonground:point here and I\'ll aim this folder at your wiki — ' +
              'after that I can answer from it, and cite what I used.',
          ),
        );
        return;
      }
      // Signed in, but this project was never pointed — so no state read happens below and this is
      // the only place a machine in that shape can be told a release shipped (SER-296).
      emit(claudeFacing, await offlineUpdateNotice());
      return;
    }
    // NOT signed in, and never welcomed: beat zero of the product was total silence (SER-325).
    // Someone installs the plugin, opens a project, and nothing happens at all — no sign-in prompt,
    // no hint that anything was installed, and no verb to try. One sentence, once ever, naming the
    // two things they can do.
    //
    // Its OWN mark, not the signed-in welcome's. This branch runs first in the normal install order,
    // so sharing one mark meant this sentence spent the post-sign-in message before anybody could
    // see it. They are two different moments and each fires once; the connected mark still
    // suppresses this one, so nobody who has already been welcomed is told the plugin is installed.
    if (!lib.hasWelcomed('install')) {
      lib.markWelcomed(Date.now(), 'install');
      emit(
        lib.verbatimBlock(
          'CommonGround is installed. Run /commonground:seed to fill a wiki, or /commonground:point ' +
            'to connect this project to one you already have.',
        ),
      );
    }
    return;
  }

  // Initialized path: inject awareness + refresh the keyword cache. Both are best-effort.
  // The MODE RULE rides on every initialized emit below and is NEVER budget-gated (SER-184): it is
  // not a nudge to do something, it is where this project's writes are allowed to land. Going quiet
  // about it is how an ingest ends up on the hosted wiki instead of in the user's clone.
  const projectMode = lib.routerMode(cwd);
  const binding = lib.activeBinding(cwd);
  const bindingRepair = bindingRepairClause(cwd, projectMode);
  const foreignClone = foreignClonePathClause(cwd, projectMode);
  // The OTHER wikis this project reads (SER-278) — every initialized path names them in the mode
  // rule, and the live path below refreshes each one's keyword cache and sync standing.
  const alsoIds = lib.projectTeamIds(cwd).slice(1);
  if (!binding) {
    // Initialized, but no single resolvable binding — either signed out on THIS machine (0 tokens)
    // or signed in to several teams (>1, ambiguous). We can't fetch LIVE awareness for one team
    // either way, but that is NOT the same as the wiki being unreachable: a local clone stays
    // readable on disk and the MCP connector authenticates independently of the device token
    // (SER-166). Asserting "the wiki can't be reached" (and telling Claude to refuse team questions)
    // would flatly contradict the router block in this SAME CLAUDE.md wherever a clone or connector
    // is serving content. So keep the neutral "consult it" pointer and add only a truthful hint
    // about the sign-in state — naming the teams to disambiguate when more than one is signed in.
    const teams = lib
      .bindings()
      .map((b) => b && b.teamId)
      .filter(Boolean);
    const hint =
      teams.length > 1
        ? ` You have more than one CommonGround wiki (${teams.join(', ')}) and none is active, so ` +
          "this session can't auto-select one for live status — run /commonground:point to aim " +
          'THIS project at the one it should read.'
        : " This machine isn't signed in to CommonGround, so live status and sync aren't available " +
          'in this session — run /commonground:status, or /commonground:point to sign in.';
    // The caveat matters MOST here (SER-182). This branch has just told Claude to consult a wiki
    // using tools it cannot verify are present — and with no device binding, a live connector is
    // precisely the thing that might still be serving content. Without it, "consult it and cite
    // pageIds" followed by every tool call failing reads to the user as a permissions problem.
    // The mode rule still applies with no binding: which surface may be written is a property of
    // the PROJECT, not of whether this machine can currently resolve a device token.
    // Same reasoning as the uninitialized branch (SER-296): no binding means no state read below,
    // so without this a machine that drifted into being signed out — or into having several wikis
    // and no active one — could never be told about a release again.
    emit(
      // The clone still has to be named here (SER-325). This branch is where a local-first user
      // lands most often — no device token, or several wikis signed in — and it is the one emit
      // that has just told Claude the connector's write tools are the wrong path. Handing it
      // `get_index / search / get_page` in the same breath is the contradiction local mode exists
      // to remove; the project's own block knows the team id even when no binding resolves.
      `${awarenessContext(null, null, localCloneDir(projectMode, lib.projectTeamId(cwd)))}${hint}`,
      modeRule(projectMode, null, null, alsoIds),
      bindingRepair,
      foreignClone,
      await offlineUpdateNotice(),
      connectorHealthClause(projectMode),
    );
    return;
  }

  const now = Date.now();
  const localMode0 = projectMode === 'local';

  // PREFERRED PATH (SER-178): one composed read that carries the shared resolver's answer, so this
  // hook and the web card cannot disagree about what to do next — and the keyword list rides along,
  // which is why the DTO carries it at all (dropping that field would rot the hot-path cache to a
  // permanently stale list with no visible failure).
  // Read the RESULT, not just the body (SER-325): a 401 and a 403 are not outages, and the branch
  // below used to call both "CommonGround could not be reached".
  const read = await lib.fetchJsonResult(
    // ambient=true: the user did not ask for this, so it SPENDS nudge budget and is subject to it.
    `/wiki/state?surface=code&projectInitialized=true&ambient=true`,
    binding,
    1500,
  );
  const state = read.body;
  if (state && state.next && state.next.id) {
    const kw = state.active && state.active.wiki && state.active.wiki.keywords;
    if (Array.isArray(kw) && kw.length > 0) lib.writeKeywordsCache(binding.teamId, kw, now);
    // The sync nudge stays LOCAL knowledge: it compares this folder's HEAD and its uncommitted
    // work to the hosted tip, none of which a server-side resolver can see.
    const hostedHead0 = state.active && state.active.wiki && state.active.wiki.lastCommitOid;
    const nudge = localMode0 ? syncNudge(binding.teamId, hostedHead0, null) : '';
    // What the wiki FOLDER holds, for the empty-wiki prose below: the DTO describes the published
    // wiki, and a local project can have been seeded without a single page reaching it.
    const clone = localMode0
      ? { dir: lib.clonePath(binding.teamId), ...(lib.cloneContents(binding.teamId) || { pages: 0, charter: false }) }
      : null;
    // The also-wikis (SER-278): one more read each — the same token, the wiki SELECTED by header
    // (one sign-in reaches every wiki, SER-241) — to refresh that wiki's keyword cache and, in local
    // mode, to compare its clone with the hosted tip. NOT ambient: their `next` step is never
    // rendered here (one nudge per session is the budget), so their nudge budget is not spent.
    const alsoNudges = await alsoWikiNudges(alsoIds, binding, localMode0, now);

    // AT MOST ONE VERBATIM BLOCK PER EMIT (SER-325). Two blocks in one turn means Claude opens the
    // session with two announcements before it answers anything, and the second is the one people
    // learn to skip. The delegated welcome wins: it is a message from a colleague and fires once
    // ever. The update notice costs nothing to postpone, because `updateNotice` only records a
    // release as SAID on the path that actually emits it, so it speaks next session instead.
    const welcome = delegatedWelcome(state);
    emit(
      resolvedContext(state, projectMode, clone),
      modeRule(projectMode, binding.teamId, voiceOf(state), alsoIds),
      cloneMissingNotice(projectMode, [binding.teamId, ...alsoIds]),
      bindingRepair,
      foreignClone,
      planGateNotice(state, projectMode),
      billingNotice(state, projectMode),
      nudge,
      alsoNudges,
      welcome,
      updateNotice(state, { hold: Boolean(welcome) }),
    );
    return;
  }

  // DEGRADED: the one composed read failed (network, outage, expired token). There is deliberately
  // no second fetch to fall back to (SER-216). The old fallback called `/wiki/awareness` +
  // `/wiki/keywords`, which are mounted on the browser-session resolver and so returned 401 to the
  // device token this hook authenticates with — every time, for every plugin version. It read as a
  // version-drift safety net and was one only in appearance; worse, `fetchJson` is fail-open, so its
  // 401s were indistinguishable from "no wiki configured" and the branch went silent, which is the
  // one thing its own comment promised it would not do.
  //
  // Nor would a second fetch help: what actually fails here is the network, the API, or the token,
  // and those take every endpoint with them. So say plainly that the wiki could not be reached —
  // a session that looks unconfigured when it is merely offline is the failure worth avoiding.
  const localHead = projectMode === 'local' ? lib.localCloneHead(binding.teamId) : null;
  emit(
    // Offline is the case local mode was built for: the folder is right there and readable, so
    // this emit names it rather than the connector's tools (SER-325).
    `${awarenessContext(null, null, localCloneDir(projectMode, binding.teamId))} ${degradedReason(read)}`,
    modeRule(projectMode, binding.teamId, null, alsoIds),
    cloneMissingNotice(projectMode, [binding.teamId, ...alsoIds]),
    bindingRepair,
    foreignClone,
    localHead ? 'This project has a local wiki folder; /commonground:pull and /commonground:push still work offline-first.' : '',
    connectorHealthClause(projectMode),
  );
}

// Only self-run when invoked directly (so tests can require this module without side effects).
if (require.main === module) {
  main().catch(() => {
    /* never fail the session on a hook hiccup */
  });
}

module.exports = {
  main,
  awarenessContext,
  localCloneDir,
  releaseNotice,
  offlineUpdateNotice,
  modeRule,
  connectorHealthClause,
  degradedReason,
  syncNudge,
  cloneMissingNotice,
  alsoWikiNudges,
  canSeed,
  stepProse,
  resolvedContext,
  awarenessFromState,
  delegatedWelcome,
  updateNotice,
  bindingRepairClause,
  foreignClonePathClause,
  planGateNotice,
  billingNotice,
  CONNECTOR_HEALTH_CLAUSE,
};
