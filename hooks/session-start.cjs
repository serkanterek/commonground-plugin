#!/usr/bin/env node
'use strict';
/*
 * CommonGround SessionStart hook (Plugin Pivot Step 2 first-boot · Step 4 awareness — SER-141/143;
 * Step-4 onboarding three-way state — SER-150).
 *
 * Outcomes, all fail-open (a detection/network hiccup never breaks the session):
 *   • signed in, project NOT initialized → nudge the user to /commonground:initialize.
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
 *
 * Self-contained CommonJS over ./lib.cjs (no deps). Emits SessionStart hook JSON on stdout.
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

/** Build the awareness context line from the state DTO's figures, or a static pointer without them. */
function awarenessContext(awareness, voice) {
  const v = voice || NEUTRAL_VOICE;
  // `when` is authored to END on "consult it:", so the tool list completes that sentence rather
  // than restating it.
  const base = `This project is connected to ${v.wiki}. ${v.when} get_index / search / get_page, and cite pageIds.`;
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
function updateNotice(state) {
  const latest = state?.active?.pluginUpdate?.latest;
  // Absent means either "current" or "we could not tell", and both are silence. The server never
  // sends this field to say you are up to date.
  if (!latest || lib.lastAnnouncedRelease() === latest) return '';
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
 * The one thing this hook CANNOT observe, stated so Claude doesn't mis-diagnose it (SER-182).
 *
 * The state fetch below authenticates with a DEVICE TOKEN. A device token says nothing about whether
 * the MCP CONNECTOR is alive in this session — so on a healthy-looking fetch we can cheerfully
 * report "14 pages, ask it something" while Claude holds no CommonGround tools at all. That is a
 * more convincing wrong signal than the silence it replaced, and it reads to a user like a
 * permissions problem. It cannot come from the server; it has to be said here, every time.
 */
const CONNECTOR_HEALTH_CLAUSE =
  'If the CommonGround tools are not actually available in this session, say so plainly rather ' +
  'than answering from assumption — that is a CONNECTION problem, never a permissions one, and ' +
  '`/mcp` or a session restart fixes it.';

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

function modeRule(mode, teamId, voice) {
  const v = voice || NEUTRAL_VOICE;
  // The RULE is frame-independent — where writes land does not depend on who reads the wiki — but
  // the CONSEQUENCE is: "nothing reaches the team" is false on a wiki with no team in it.
  const published = v.others ? 'the published wiki' : 'the published copy';
  if (mode === 'local') {
    // No resolvable team (signed out here, or several signed in) → still state the RULE, just
    // without a concrete path. The rule is what prevents the wrong write; the path is a convenience.
    const dir = teamId ? lib.clonePath(teamId) : null;
    return (
      `This project is in CommonGround LOCAL-CLONE mode: the wiki is a working copy` +
      (dir ? ` at ${dir}` : ' on this machine') +
      '. ' +
      'ALL curation — ingest, edits, lint fixes, seeding, the charter — writes FILES in that ' +
      'clone. Do NOT ' +
      'use the CommonGround MCP write tools (`save_page`, `stage_sources`, `save_charter`) in this ' +
      `project: they commit straight to ${published}, bypassing both the user's review ` +
      `and the publish step. Read from the clone too — it reflects unpublished work that ${published} ` +
      `does not. Nothing reaches ${v.reaches} until \`/commonground:push\`, which previews and asks ` +
      'first. Editing locally needs no particular role (it is the user\'s own copy); only ' +
      'publishing is admin/curator. The suggestions queue (`list_suggestions` / `suggest_change` / ' +
      '`resolve_suggestion`) is the one thing that legitimately stays server-side — it cannot live ' +
      'in git, because it carries messages from people with no write access to the repo. ' +
      CURATION_POSTURE
    );
  }
  return (
    'This project is in CommonGround MCP mode: there is no local copy, so every write is ' +
    'immediately live. `save_page`, `stage_sources` and `save_charter` commit straight to ' +
    `${published} — the moment one lands it is what ` +
    (v.others ? `${v.others}' Claude reads` : 'every Claude you use reads') +
    '. Show what you intend to write and get an explicit yes before each write; there is no ' +
    'staging step to undo it in. ' +
    CURATION_POSTURE
  );
}

/**
 * The one wrong-wiki case the PreToolUse guard deliberately cannot block (SER-234).
 *
 * That guard fires only on a CONFIRMED mismatch — this project's team marker versus the
 * `COMMONGROUND_WIKI` the connector was told to serve. A project bound by a plugin older than 0.7.4
 * has the marker and no variable, because nothing wrote one until `init` started to. From the guard's
 * side that is indistinguishable from a project on a single-wiki machine, where everything is fine,
 * so denying would break far more than it protects.
 *
 * What it is NOT is invisible. Such a project looks completely set up — router block, working
 * commands — while the connector quietly answers for whichever wiki it was authorised for. So it is
 * said once per session, here, where a nudge costs nothing and the fix is one command.
 *
 * MCP mode only: a local-clone project reads from its folder, and the CLI already resolves that per
 * project. Silent when the variable is present (the normal case) so this never becomes noise.
 */
function unrecordedWikiClause(cwd, mode) {
  if (mode === 'local') return '';
  const bound = lib.projectTeamId(cwd);
  if (!bound || (process.env.COMMONGROUND_WIKI || '').trim()) return '';
  return (
    `This project is bound to CommonGround wiki ${bound}, but nothing records that for the MCP ` +
    'connector — it was connected by a plugin older than 0.7.4, so the connector will answer for ' +
    'whichever wiki it was authorised for instead, which may not be this one. If wiki answers here ' +
    `look like they are about something else, that is why: "commonground init ${bound}" in this ` +
    'project records it, and a session restart applies it. Mention this only if it becomes relevant.'
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
      return 'This project is not connected to the wiki yet — suggest /commonground:initialize.';
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
    case 'review-suggestions':
      return 'Teammates have filed suggestions against this wiki. Mention /commonground:lint when there is a natural moment.';
    case 'invite-teammate':
      return 'This wiki works but has exactly one member. If it comes up, mention teammates can be invited at app.commongroundapp.io/team.';
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
function resolvedContext(state) {
  const step = (state && state.next) || { id: 'steady' };
  // The shared budget has decided we have said this enough. Drop the STEP, keep the facts: going
  // silent means we stop volunteering an action, not that we stop telling Claude what the wiki is.
  const silent = state && state.loudness === 'silent';
  const prose = silent ? '' : stepProse(step, state);
  const empty = step.id === 'await-seed' || step.id === 'seed-first-pages' || step.id === 'charter-wiki';
  const facts = empty ? '' : awarenessContext(awarenessFromState(state), voiceOf(state));
  return [facts, prose, CONNECTOR_HEALTH_CLAUSE].filter(Boolean).join(' ');
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
    lib.emitContext('SessionStart', [...parts, stranded].filter(Boolean).join(' '));
  const initialized = lib.isInitialized(cwd);

  if (!initialized) {
    // First-boot nudge — only if they've actually signed in somewhere (else the plugin's mere
    // presence is enough; don't badger a brand-new user).
    if (lib.isSignedIn()) {
      // Tier B — audience-NEUTRAL by construction. This branch runs before any team is resolved,
      // so it cannot know whether the wiki is personal or shared and must not guess.
      const claudeFacing =
        "You're signed in to CommonGround, but this project isn't connected to a wiki yet. " +
        'If the user wants their curated context available here, suggest running /commonground:initialize.';
      // The FIRST time this user sees the plugin anywhere, say it to THEM rather than only to
      // Claude — otherwise beat zero of the whole product is silence, and the person who just
      // installed it has no idea anything happened. Once ever, per user (see `hasWelcomed`).
      if (!lib.hasWelcomed()) {
        lib.markWelcomed(Date.now());
        emit(
          claudeFacing,
          lib.verbatimBlock(
            'CommonGround is connected to your account, but not to this project yet.\n' +
              'Run /commonground:initialize here and I\'ll wire this folder to your wiki — ' +
              'after that I can answer from it, and cite what I used.',
          ),
        );
        return;
      }
      emit(claudeFacing);
    }
    return;
  }

  // Initialized path: inject awareness + refresh the keyword cache. Both are best-effort.
  // The MODE RULE rides on every initialized emit below and is NEVER budget-gated (SER-184): it is
  // not a nudge to do something, it is where this project's writes are allowed to land. Going quiet
  // about it is how an ingest ends up on the hosted wiki instead of in the user's clone.
  const projectMode = lib.routerMode(cwd);
  const binding = lib.activeBinding(cwd);
  const unrecordedWiki = unrecordedWikiClause(cwd, projectMode);
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
          "this session can't auto-select one for live status — run /commonground:switch to choose " +
          'which wiki to work with, or /commonground:initialize to bind THIS project to one.'
        : " This machine isn't signed in to CommonGround, so live status and sync aren't available " +
          'in this session — run /commonground:status, or /commonground:initialize to sign in.';
    // The caveat matters MOST here (SER-182). This branch has just told Claude to consult a wiki
    // using tools it cannot verify are present — and with no device binding, a live connector is
    // precisely the thing that might still be serving content. Without it, "consult it and cite
    // pageIds" followed by every tool call failing reads to the user as a permissions problem.
    // The mode rule still applies with no binding: which surface may be written is a property of
    // the PROJECT, not of whether this machine can currently resolve a device token.
    emit(`${awarenessContext(null)}${hint}`, modeRule(projectMode, null), unrecordedWiki, CONNECTOR_HEALTH_CLAUSE);
    return;
  }

  const now = Date.now();
  const localMode0 = projectMode === 'local';

  // PREFERRED PATH (SER-178): one composed read that carries the shared resolver's answer, so this
  // hook and the web card cannot disagree about what to do next — and the keyword list rides along,
  // which is why the DTO carries it at all (dropping that field would rot the hot-path cache to a
  // permanently stale list with no visible failure).
  const state = await lib.fetchJson(
    // ambient=true: the user did not ask for this, so it SPENDS nudge budget and is subject to it.
    `/wiki/state?surface=code&projectInitialized=true&ambient=true`,
    binding,
    1500,
  );
  if (state && state.next && state.next.id) {
    const kw = state.active && state.active.wiki && state.active.wiki.keywords;
    if (Array.isArray(kw) && kw.length > 0) lib.writeKeywordsCache(binding.teamId, kw, now);
    const localHead0 = localMode0 ? lib.localCloneHead(binding.teamId) : null;
    // The sync nudge stays LOCAL knowledge: it compares this clone's HEAD to the hosted tip, which
    // no server-side resolver can see.
    const hostedHead0 = state.active && state.active.wiki && state.active.wiki.lastCommitOid;
    const hostedPresent0 =
      localHead0 && hostedHead0 ? lib.cloneHasCommit(binding.teamId, hostedHead0) : false;
    const nudge =
      localHead0 && hostedHead0 && hostedHead0 !== localHead0
        ? hostedPresent0
          ? 'This project has CommonGround wiki changes that have not been published to the team yet — ' +
            'suggest running /commonground:push.'
          : "The team's CommonGround wiki has moved on since this local clone last updated — suggest " +
            'running /commonground:pull.'
        : '';

    emit(
      resolvedContext(state),
      modeRule(projectMode, binding.teamId, voiceOf(state)),
      unrecordedWiki,
      nudge,
      delegatedWelcome(state),
      updateNotice(state),
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
    `${awarenessContext(null)} CommonGround could not be reached this session, so the figures above ` +
      'are unavailable — the wiki itself is fine; run /commonground:status to check.',
    modeRule(projectMode, binding.teamId),
    unrecordedWiki,
    localHead ? 'This project has a local wiki clone; /commonground:pull and /commonground:push still work offline-first.' : '',
    CONNECTOR_HEALTH_CLAUSE,
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
  modeRule,
  canSeed,
  stepProse,
  resolvedContext,
  awarenessFromState,
  delegatedWelcome,
  updateNotice,
  CONNECTOR_HEALTH_CLAUSE,
};
