#!/usr/bin/env node
'use strict';
/*
 * CommonGround UserPromptSubmit hook (Plugin Pivot Step 4 · SER-143) — the deterministic Code
 * auto-trigger. When the user's prompt mentions a team keyword (from the wiki index, derived by
 * GET /wiki/keywords), inject a nudge so Claude consults CommonGround before answering.
 *
 * It also carries the mid-session plugin-swap notice (SER-166): this is the only hook that
 * plausibly re-runs inside a live session, so it is the only place that can notice that the plugin
 * build changed under the session — the host event that re-registers (and thus tears down) the
 * CommonGround MCP connector. Detection is best-effort by construction; the durable fix is the
 * recovery prose in the project's CLAUDE.md router block, which no plugin swap can take away.
 *
 * HOT PATH — runs on EVERY prompt, so it does NO network: it only reads small local files (the
 * project's CLAUDE.md, the credential store, the keyword cache, plus this build's manifest and the
 * version marker — 5 synchronous reads). That cost is accepted to catch a rare, badly-misdiagnosed
 * failure; revisit it if this hook ever grows a network call.
 *
 * Silent unless something is actually true: for the keyword nudge (a) the project is initialized,
 * (b) a single team is resolvable, (c) a cache exists, (d) the prompt matches; for the swap notice,
 * a same-session version mismatch. Fail-open throughout — a hiccup must never block submission.
 */
const lib = require('./lib.cjs');

/**
 * The version this session started on, when the plugin has since changed underneath it — else null.
 * Silence is the default on every uncertainty: no marker (first run), another session's baseline,
 * an unreadable manifest (`current` null) or equal versions all return null, because announcing on
 * a guess is worse than saying nothing.
 */
function versionChange(marker, current, sessionId) {
  if (!current || !marker || typeof marker !== 'object') return null;
  if (marker.sessionId !== sessionId) return null; // a different session's baseline proves nothing
  const previous = typeof marker.version === 'string' ? marker.version : null;
  return previous && previous !== current ? previous : null;
}

/**
 * The notice's opening words, as a shared constant (SER-182).
 *
 * Not cosmetic: the guard proving SessionStart never announces a swap itself is a NEGATIVE
 * assertion, and a negative assertion against a literal typed into the test passes forever the
 * moment this sentence is reworded. Pointing both the code and the test at one constant means a
 * rewrite either keeps the guard honest or breaks the build.
 */
const SWAP_NOTICE_OPENING = 'The CommonGround plugin changed under this session';

/** The Claude-facing swap notice: what happened, what it is NOT, and the three ways back. */
function versionNotice(previous, current, cli) {
  return (
    `${SWAP_NOTICE_OPENING} (${previous} → ${current}). Claude Code ` +
    "re-registers a plugin's MCP server on a version change, so the CommonGround tools may have " +
    'been torn down mid-session. If a CommonGround tool is missing or a call fails, say so plainly ' +
    '— it is a CONNECTION problem, not a permissions one — and offer the fixes: run `/mcp` to ' +
    "reconnect, restart the session, or (only with the user's OK, since it writes files) " +
    `\`${cli || 'commonground'} pull [team]\`, which authenticates as the signed-in device rather ` +
    'than through the connector and leaves a readable copy of the wiki on disk.'
  );
}

/** The keyword auto-trigger nudge for this prompt, or '' when there's nothing to say. */
function keywordNudge(prompt, cwd) {
  // `cwd` disambiguates a machine signed in to several teams via THIS project's team marker
  // (SER-176) — without it a multi-team user gets no keyword trigger in any project.
  const binding = lib.activeBinding(cwd);
  if (!binding) return ''; // can't resolve a single team → don't guess

  const cache = lib.readKeywordsCache(binding.teamId);
  if (!cache || !Array.isArray(cache.keywords) || cache.keywords.length === 0) return '';
  // Stale cache is fine to use (SessionStart refreshes it); we only skip a totally missing one.

  const hits = lib.matchKeywords(prompt, cache.keywords, 6);
  if (hits.length === 0) return '';

  // Audience-NEUTRAL wording, deliberately (SER-185). This hook is on the prompt hot path and makes
  // ZERO network calls by design — its only local cache holds keywords, not the charter — so it
  // cannot know whether this wiki is personal or shared. "Their CommonGround wiki" is true either
  // way; "your team's" was a guess that read as wrong to every solo user.
  return (
    `The user's message mentions ${hits.map((h) => `"${h}"`).join(', ')}, which their ` +
    'CommonGround wiki likely covers. Before answering, search the wiki (search / get_index / ' +
    'get_page) and ground your answer in it, citing the pageIds you used. If nothing relevant is ' +
    'found, say so rather than guessing.'
  );
}

function main() {
  const input = lib.readStdinInput();
  const prompt = typeof input.prompt === 'string' ? input.prompt : '';
  if (!prompt.trim()) return;
  const cwd = lib.projectCwd(input);
  if (!lib.isInitialized(cwd)) return; // not a CommonGround project → stay out of the way

  const current = lib.pluginVersion();
  const sessionId = lib.sessionIdOf(input);
  const marker = lib.readVersionMarker();
  const previous = versionChange(marker, current, sessionId);
  let notice = '';
  if (previous) {
    notice = versionNotice(previous, current, lib.cliPath());
    // Re-baseline to CONSUME the notice: a swap is announced exactly once, not on every prompt.
    lib.writeVersionMarker(sessionId, current);
  } else if (!marker) {
    // No baseline at all — SessionStart never ran for this session (or the plugin was installed
    // mid-session). Seed one silently so a LATER swap is still noticeable. Deliberately NOT done
    // when a marker exists for another session: that would both erase their detection and rewrite
    // the file on every prompt of both sessions.
    lib.writeVersionMarker(sessionId, current);
  }

  const parts = [notice, keywordNudge(prompt, cwd)].filter(Boolean);
  if (parts.length) lib.emitContext('UserPromptSubmit', parts.join(' '));
}

if (require.main === module) {
  try {
    main();
  } catch {
    /* never block prompt submission on a hook hiccup */
  }
}

module.exports = { main, versionChange, versionNotice, keywordNudge, SWAP_NOTICE_OPENING };
