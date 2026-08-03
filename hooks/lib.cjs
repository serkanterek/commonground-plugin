'use strict';
/*
 * Shared helpers for the CommonGround plugin hooks (Plugin Pivot Step 4 · SER-143). Self-contained
 * CommonJS (no workspace/npm deps) so it ships and runs inside the plugin bundle; both hooks
 * `require('./lib.cjs')`. Everything here is best-effort and fail-open — a hook must never break a
 * session, so every I/O path swallows its error and returns a safe default.
 *
 * Auth: the local device token (`cgdt_…`, stored by `commonground login`) is team-bound, so a plain
 * `Authorization: Bearer <token>` reaches the team's `/wiki/*` reads with no `X-Team-Id` header
 * (the API's device-token adapter resolves the team from the token itself).
 */
const cp = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Kept in sync with apps/sync-agent/src/injection.ts (ROUTER markers) + config.ts (BOTH homes —
// credentials vs wiki data, SER-165) and the CLI's default API base. This file ships standalone
// inside the plugin bundle, so it cannot import the sync agent: the split is mirrored by hand.
// Since SER-175 that mirror includes a WRITER of the credential store, not just a reader —
// `relocateLegacyCredential` reproduces config.ts's atomic move step for step, and
// scripts/credential-drift.test.ts is what keeps the two implementations honest.
const ROUTER_MARKER = 'commonground:router-rule:start';
const CONFIG_DIR = '.commonground'; // the legacy in-wiki store's directory (read for migration)
const CREDENTIALS_FILE = 'credentials.json';
const DEFAULT_API = 'https://api.commongroundapp.io';
/** How long a cached keyword list is served before the next SessionStart refreshes it. */
const KEYWORDS_TTL_MS = 60 * 60 * 1000; // 1 hour
/**
 * Not defined on Windows, where `0` degrades to a plain open. What still guards the adoption there is
 * the `fstat` regular-file check plus the ACLs on the user's own profile directory — NOT the mode
 * bits, which Windows does not have (see {@link isPrivateMode}).
 */
const O_NOFOLLOW = fs.constants.O_NOFOLLOW || 0;

// The plugin's own install directory: `hooks/` and `.claude-plugin/` are siblings at the plugin
// root by construction (scripts/publish-stage.ts ships exactly that shape), so `__dirname/..` is
// the manifest's parent both in-repo and inside an installed version directory.
const PLUGIN_ROOT = path.join(__dirname, '..');
const VERSION_FILE = 'plugin-version.json';

/** An env-provided directory, treating an empty value as unset (matches config.ts's `envDir`). */
function envDir(name, fallback) {
  const value = process.env[name];
  return value && value.trim() ? value : fallback;
}

/** Where the device token lives — separate from the wiki folder, so moving that never signs you out. */
function configHome() {
  return envDir('COMMONGROUND_CONFIG_HOME', path.join(os.homedir(), '.commonground'));
}

/** Where the per-team wiki clones live. Contains no secret. */
function dataHome() {
  return envDir('COMMONGROUND_HOME', path.join(os.homedir(), 'CommonGround'));
}

/** The credential store. One definition, shared by the reader and the relocation, so they can't disagree. */
function credentialsPath() {
  return path.join(configHome(), CREDENTIALS_FILE);
}

/** The pre-SER-165 store inside the wiki folder — read, and moved out of there, but never written. */
function legacyStorePath() {
  return path.join(dataHome(), CONFIG_DIR, 'config.json');
}

function apiBase() {
  return (process.env.COMMONGROUND_API_URL || DEFAULT_API).replace(/\/+$/, '');
}

/** Parse the hook's stdin JSON payload (contains `cwd`, and for UserPromptSubmit the `prompt`). */
function readStdinInput() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

/** The project directory the hook is running against (payload `cwd`, else process cwd). */
function projectCwd(input) {
  return (input && typeof input.cwd === 'string' && input.cwd) || process.cwd();
}

/** True when this project's CLAUDE.md carries the CommonGround router block (i.e. it's initialized). */
function isInitialized(cwd) {
  try {
    return fs.readFileSync(path.join(cwd, 'CLAUDE.md'), 'utf8').includes(ROUTER_MARKER);
  } catch {
    return false;
  }
}

/**
 * This project's wiki mode from its CLAUDE.md router block: 'local' (a clone on disk), 'mcp' (the
 * remote connector), or null when there's no block. Mirrors the sync agent's `parseRouterBlock`
 * (SER-168) — the explicit `commonground:mode:` marker is authoritative, with the legacy
 * `(local clone)` prose sniff as the fallback for pre-marker blocks. Used to gate the pull/push
 * nudge on THIS project being a clone, not merely on a clone existing somewhere for the team.
 */
function routerMode(cwd) {
  let block;
  try {
    const md = fs.readFileSync(path.join(cwd, 'CLAUDE.md'), 'utf8');
    block = /<!-- commonground:router-rule:start -->([\s\S]*?)<!-- commonground:router-rule:end -->/.exec(md);
  } catch {
    return null;
  }
  if (!block) return null;
  const marked = /<!-- commonground:mode:(mcp|local) -->/.exec(block[1]);
  if (marked) return marked[1];
  return block[1].includes('(local clone)') ? 'local' : 'mcp';
}

/**
 * True when the file's POSIX bits say "mine alone" — no group or other access AT ALL, not merely no
 * write bit. A store planted through a shared Dropbox/Drive vault arrives created by the VICTIM's own
 * sync daemon, so it passes the ownership check and lands at that daemon's default 0644; a gate that
 * only refused 0o022 would adopt it, which is the attack this gate exists to stop. Nothing legitimate
 * is excluded: the store has been written 0600 and chmod'ed 0600 since SER-84.
 *
 * Windows is exempt because its bits are a fiction — libuv synthesises 0o666 for every writable file
 * and 0o444 for a read-only one, so a privacy requirement there is unsatisfiable and would strand
 * every Windows user's token inside the wiki folder permanently.
 */
function isPrivateMode(mode) {
  return process.platform === 'win32' || (mode & 0o077) === 0;
}

/**
 * What the store file at `p` yielded — its parsed content, its exact bytes, and whether it is safe
 * to ADOPT — or null for anything else at all: absent, unreadable, not JSON, or carrying no `teams`
 * map. That shape check is not pedantry: `<dataHome>/.commonground/config.json` is also the filename
 * a wiki clone uses for its own `{schemaVersion}` file (packages/core's `fs-store`), and "it parsed"
 * is not grounds to delete anything. Fail-open like everything here — a null just means "nothing
 * usable at that path", never a thrown session.
 *
 * `adoptable` gates the copy-and-delete below, never the read: after relocation these bytes become
 * the durable credential and the source is gone, so anyone who can write into the wiki folder (a
 * shared Dropbox vault, a shared CI workspace) could otherwise plant a store holding THEIR device
 * token and have it adopted permanently with the evidence removed. It is taken by `fstat` on the
 * descriptor we actually read, so the file cannot be swapped between the check and the read.
 */
function readStoreFile(p) {
  let fd = null;
  try {
    // O_NOFOLLOW first, so a symlink at the store path is never adopted — it is still read on the
    // retry below (signing nobody out), just never copied and never deleted.
    let followedLink = false;
    try {
      fd = fs.openSync(p, fs.constants.O_RDONLY | O_NOFOLLOW);
    } catch (e) {
      if (!e || (e.code !== 'ELOOP' && e.code !== 'EMLINK')) throw e; // EMLINK: the BSD-lineage spelling
      followedLink = true;
      fd = fs.openSync(p, 'r');
    }
    const st = fs.fstatSync(fd);
    const uid = process.getuid ? process.getuid() : undefined;
    const adoptable =
      !followedLink && st.isFile() && (uid === undefined || st.uid === uid) && isPrivateMode(st.mode);
    const raw = fs.readFileSync(fd, 'utf8');
    const store = JSON.parse(raw);
    if (!store || !store.teams || typeof store.teams !== 'object') return null;
    return { store, raw, adoptable };
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* nothing left to close */
      }
    }
  }
}

/**
 * The whole device-binding store, or null if absent/unreadable — the credential home first, then the
 * legacy in-wiki location so a user who hasn't logged in since SER-165 still reads as signed in.
 * Unlike the CLI (which shouts about a corrupt store) a hook stays fail-open: going quiet is always
 * better than breaking a session.
 */
function readStore() {
  // The credential home is probed AGAIN after the legacy path, and the repetition is the point: a CLI
  // verb or another session's relocation can publish and unlink between the first two looks, and both
  // would then answer "nothing here" for a machine that is signed in. The destination is only ever
  // created, never removed, so a third look closes that window.
  for (const p of [credentialsPath(), legacyStorePath(), credentialsPath()]) {
    const found = readStoreFile(p);
    if (found) return found.store;
  }
  return null;
}

/** All persisted team bindings ({ token, userId, teamId, role }), possibly empty. */
function bindings() {
  const store = readStore();
  return store && store.teams && typeof store.teams === 'object' ? Object.values(store.teams) : [];
}

/** True when the user is signed in to at least one team. */
function isSignedIn() {
  return bindings().length > 0;
}

/**
 * The team binding to act for, or null if it can't be resolved unambiguously. v1 resolves the SOLE
 * binding — the common single-team case; a project isn't yet stamped with its teamId, so with
 * multiple teams we fail open (silent) rather than guess the wrong team's keywords.
 */
function activeBinding(cwd) {
  const all = bindings();
  if (all.length === 0) return null;
  if (all.length === 1) return all[0];
  // More than one team signed in on this machine. That used to end here, silently: every hook fell
  // back to the static pointer and a two-team user got no live awareness in ANY project, forever.
  // But an initialized project already records which team it belongs to — `init` stamps the team
  // marker inside its own router block — so ask the project rather than guessing (SER-176). Still
  // null when the project carries no marker (uninitialized, or a pre-marker block): guessing a team
  // would read one wiki's state while the router block points at another's.
  const teamId = cwd ? projectTeamId(cwd) : null;
  if (!teamId) return null;
  return all.find((b) => b && b.teamId === teamId) || null;
}

/**
 * The team THIS project is bound to, from the team marker inside its router block, or null.
 * Mirrors the sync agent's `parseRouterBlock` (injection.ts): the marker is written by `init` and
 * re-rendered by `init --refresh`, and it is scoped to the block so a stray comment elsewhere in a
 * user's CLAUDE.md cannot rebind the project.
 */
function projectTeamId(cwd) {
  try {
    const md = fs.readFileSync(path.join(cwd, 'CLAUDE.md'), 'utf8');
    const block = /<!-- commonground:router-rule:start -->([\s\S]*?)<!-- commonground:router-rule:end -->/.exec(md);
    if (!block) return null;
    const marker = /<!-- commonground:team:([^\s>]+) -->/.exec(block[1]);
    return marker ? marker[1] : null;
  } catch {
    return null;
  }
}

/*
 * Completing the SER-165 split for a terminal-free user (SER-175). The split only ever relocated an
 * existing store from `commonground login`, and someone already signed in never runs it again — the
 * legacy fallback above is precisely what keeps them signed in, so nothing ever prompts them. This
 * hook is the only trigger in the product that needs no user action, so it carries the move.
 *
 * Mirrors apps/sync-agent/src/config.ts step for step — same ordering, same modes, same exclusive
 * publish — under the same three rules: never sign anyone out (the bytes exist under the new name
 * BEFORE the old name is removed, and the publish can only ADD a name, never replace one); never
 * fail the caller (any failure leaves the legacy file authoritative and retries next session); never
 * delete what we did not prove (a parsed store with a `teams` map, in a private regular file we own).
 *
 * On the environment, which used to be the open question: this process and the CLI's both descend
 * from the Claude Code host and neither re-sources the user's shell profile, so both read the SAME
 * COMMONGROUND_CONFIG_HOME / COMMONGROUND_HOME (measured 2026-07-26 — the profile-set PATH reaches
 * the Bash tool's non-interactive shell unchanged, and every user-set variable with it). So the hook
 * honours both overrides and resolves both paths exactly as the CLI does, which is what lets an
 * override user be healed here at all. It takes them from THIS process's environment and acts on
 * nothing else: an override handed to a single command inline (`COMMONGROUND_CONFIG_HOME=/x
 * commonground …`) is carried by no environment we can observe, so we never guess at it — that one
 * invocation reads its own home, and the CLI's not-logged-in message names both paths. Whichever way
 * that falls, the token still exists and nobody is signed out.
 */

/**
 * `p` with the symlinks in its longest EXISTING prefix resolved. `realpath` on the whole path is no
 * use here: the credential file normally does not exist yet, and the guard below has to hold for a
 * path that is about to be created. Any failure degrades to the plain textual `resolve`.
 */
function resolveRealPath(p) {
  let head = path.resolve(p);
  const tail = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync(head), ...tail);
    } catch {
      const parent = path.dirname(head);
      if (parent === head) return path.resolve(p); // reached the root resolving nothing
      tail.unshift(path.basename(head));
      head = parent;
    }
  }
}

/**
 * True when `child` IS `parent` or lives beneath it. Path-boundary safe (`/a/bc` is not in `/a/b`),
 * symlink-safe (a credential home symlinked INTO the wiki tree is still inside it), and case-folded
 * where the filesystem is (`~/commonground` and `~/CommonGround` are one directory on macOS). Every
 * looser comparison leaves a way for the token to end up in a git clone, which has happened once.
 */
function isInside(parent, child) {
  const folds = process.platform === 'darwin' || process.platform === 'win32';
  const fold = (s) => (folds ? s.toLowerCase() : s);
  const rel = path.relative(fold(resolveRealPath(parent)), fold(resolveRealPath(child)));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * `fsync` a DIRECTORY, so a freshly created dirent survives a power loss. Opening a directory for
 * reading is POSIX-only, so a failure means "no barrier available" — the worst case is the ordering
 * guarantee we wanted, not a broken session.
 */
function fsyncDir(dir) {
  let fd = null;
  try {
    fd = fs.openSync(dir, 'r');
    fs.fsyncSync(fd);
  } catch {
    /* no barrier here */
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* nothing left to close */
      }
    }
  }
}

/**
 * Publish `raw` at `dest` (0600, inside a 0700 dir) without ever clobbering: the visible name
 * appears by hard LINK, which fails EEXIST instead of overwriting, so a `commonground login` landing
 * between our read and our publish keeps its freshly issued token. Returns false when it lost that
 * race — and on a filesystem with no hard links it throws instead, because falling back to `rename`
 * would reintroduce exactly the clobber this exists to make unreachable.
 *
 * This is the FIRST atomic write in the hook layer: `writeKeywordsCache` and `writeVersionMarker`
 * are plain `writeFileSync`, and that truncate-then-write shape is what stranded the credential in
 * the first place. A torn cache costs a nudge; a torn credential is a logout — so don't copy them.
 */
function publishStore(dest, raw) {
  const dir = path.dirname(dest);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700); // `mode` is umask-masked, and a recursive create never tightens an existing dir
  // Unique AND unpredictable: a fixed `${dest}.tmp` is shared by every writer, so two sessions
  // interleave onto one file and one's cleanup makes the other's publish fail.
  const tmp = `${dest}.${crypto.randomUUID()}.tmp`;
  let published = false;
  try {
    // 'wx' (O_EXCL), never 'w': `w` follows a symlink planted at the temp path and writes the token
    // through it. O_EXCL also guarantees a freshly created file, which is the only way `mode` is
    // honoured at all.
    const fd = fs.openSync(tmp, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, raw);
      fs.fchmodSync(fd, 0o600); // on the descriptor — never re-resolves the path
      fs.fsyncSync(fd); // we may be about to delete the only other copy of this secret
    } finally {
      fs.closeSync(fd);
    }
    try {
      fs.linkSync(tmp, dest);
      published = true;
    } catch (e) {
      if (!e || e.code !== 'EEXIST') throw e; // EEXIST: someone published first, and theirs wins by design
    }
    // The dirent lives in THIS directory; the legacy unlink that follows lives in another, possibly
    // on another filesystem, with no ordering between their journals. Without this a power loss can
    // persist the removal and lose the link — "neither file" is the one state that is a real logout.
    if (published) fsyncDir(dir);
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* never staged, or already gone */
    }
  }
  return published;
}

/** True when the two bindings are the same sign-in, field for field. */
function sameBinding(a, b) {
  return (
    !!a &&
    !!b &&
    a.token === b.token &&
    a.userId === b.userId &&
    a.teamId === b.teamId &&
    a.role === b.role
  );
}

/** True when every binding in `subset` is already present, identical, in `live` — deleting it loses nothing. */
function coveredBy(subset, live) {
  return Object.keys(subset.teams).every((teamId) =>
    sameBinding(live.teams[teamId], subset.teams[teamId]),
  );
}

/** Remove the legacy store and the dot-dir the agent left behind inside the user's wiki folder. */
function removeLegacyStore(legacyPath) {
  try {
    fs.unlinkSync(legacyPath);
  } catch {
    /* already gone */
  }
  // `rmdir` refuses a non-empty directory — that refusal IS the safety proof, so this can only ever
  // remove the empty dot-dir the agent itself created inside the folder users open in Obsidian.
  try {
    fs.rmdirSync(path.dirname(legacyPath));
  } catch {
    /* not empty, or not ours to remove */
  }
}

/**
 * Both files exist — a crash between publish and unlink, or a restored wiki backup. Remove the
 * legacy copy ONLY when every binding it holds is already present and identical in the live store;
 * then deleting it provably loses nothing. Otherwise leave it alone: merging would resurrect a
 * possibly stale token, and deleting would drop a team the user would have to sign in for again.
 */
function sweepLegacyCredential(legacyPath, live) {
  const legacy = readStoreFile(legacyPath);
  if (!legacy || !legacy.adoptable) return;
  if (!coveredBy(legacy.store, live)) return;
  removeLegacyStore(legacyPath);
}

/**
 * Move a pre-v0.4.1 sign-in out of the wiki folder into the credential home, per the rules above.
 * Returns the destination path when the move completed, else null — nothing to move, not provably
 * ours, lost the race, or any failure at all. Never throws, never merges, never overwrites.
 */
function relocateLegacyCredential() {
  try {
    const dest = credentialsPath();
    const legacyPath = legacyStorePath();
    const live = readStoreFile(dest);
    if (live) {
      sweepLegacyCredential(legacyPath, live.store); // already moved; anything left is crash-window residue
      return null;
    }
    const legacy = readStoreFile(legacyPath);
    if (!legacy || !legacy.adoptable) return null; // read it, yes; adopt and delete it, no
    // Never write a secret into publishable territory: `push` runs `git add -A` on the clone and a
    // provisioned wiki has no `.gitignore`, so a credential home resolving under the wiki data root
    // is how a token rode into a clone and got PUSHED to a team wiki once already.
    if (isInside(dataHome(), dest)) return null;
    if (!publishStore(dest, legacy.raw)) return null;
    // Last, and only now: the exact bytes are durably under the new name, so this can lose nothing.
    removeLegacyStore(legacyPath);
    return dest;
  } catch {
    return null; // the legacy file is untouched and still authoritative — try again next session
  }
}

/**
 * One sentence for the session context when the sign-in is STILL inside the wiki folder — i.e. the
 * relocation above could not complete (an unwritable credential home, a filesystem without hard
 * links), so moving that folder would really sign the user out. '' in every other case, including a
 * store with no bindings: the clause is about a credential that would be lost, and an empty one
 * isn't. Never carries the token — only the path, which is what the user has to act on.
 */
function legacyCredentialClause() {
  try {
    if (readStoreFile(credentialsPath())) return '';
    const legacy = readStoreFile(legacyStorePath());
    if (!legacy || Object.keys(legacy.store.teams).length === 0) return '';
    return (
      "CommonGround's sign-in on this machine is still stored inside the wiki folder " +
      `(${legacyStorePath()}) rather than in its own private location, so moving or deleting that ` +
      'folder would sign the user out. If CommonGround comes up, mention it and suggest ' +
      '/commonground:status.'
    );
  } catch {
    return '';
  }
}

/** The cache sits beside the token (its 0600 comment must stay true), not in the wiki folder. */
function keywordsCachePath(teamId) {
  return path.join(configHome(), `keywords-${teamId}.json`);
}

/** The cached keyword payload `{ fetchedAt, keywords }` for a team, or null. */
function readKeywordsCache(teamId) {
  try {
    return JSON.parse(fs.readFileSync(keywordsCachePath(teamId), 'utf8'));
  } catch {
    return null;
  }
}

/** Persist the team's keyword list with a fetch timestamp (0600 — sits beside the token). */
function writeKeywordsCache(teamId, keywords, now) {
  try {
    const p = keywordsCachePath(teamId);
    // The credential home may not exist yet for someone still on the legacy in-wiki store — create
    // it, or the keyword nudge would silently stop working until their next `commonground login`.
    fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
    fs.writeFileSync(p, JSON.stringify({ fetchedAt: now, keywords }), { mode: 0o600 });
    fs.chmodSync(p, 0o600); // `mode` is ignored when overwriting an existing file — enforce it (as config.ts does)
  } catch {
    /* best-effort cache */
  }
}

/*
 * The one-time welcome (SER-178).
 *
 * Everything these hooks emit is addressed to CLAUDE, never to a human — which means beat zero of
 * the whole product is silence: someone installs the plugin, opens a project, and nothing visibly
 * happens. The verbatim envelope below is the only mechanism that gets a hook's words to a person,
 * so it is spent carefully: at most three beats ever, and the welcome exactly ONCE.
 *
 * Keyed per USER, not per project. Keying it per project — which is the obvious implementation —
 * means someone with thirty repos is told what CommonGround is thirty times, which is how a useful
 * message becomes something people learn to skip.
 */
function welcomedPath() {
  return path.join(configHome(), 'welcomed.json');
}

/** Has this machine's user already been welcomed? Unreadable/absent → not yet (fail toward saying it once). */
function hasWelcomed() {
  try {
    const raw = JSON.parse(fs.readFileSync(welcomedPath(), 'utf8'));
    return raw && raw.welcomedAt ? true : false;
  } catch {
    return false;
  }
}

/** Record the welcome. Best-effort: if this fails the worst case is saying it twice, never a crash. */
function markWelcomed(now) {
  try {
    const p = welcomedPath();
    fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
    fs.writeFileSync(p, JSON.stringify({ welcomedAt: now }), { mode: 0o600 });
    fs.chmodSync(p, 0o600);
  } catch {
    /* best-effort */
  }
}

/**
 * Wrap text so Claude prints it to the USER verbatim instead of paraphrasing it into the flow.
 *
 * Reserved for the three beats that are genuinely worth interrupting for — first install, a
 * delegated section someone was personally asked to fill, and a long absence. Using it more often
 * turns every session into an announcement and burns the one channel we have.
 */
function verbatimBlock(text) {
  return (
    '[CommonGround] At the start of your next reply, before anything else, print the block between ' +
    'the --- fences to the user verbatim. Do not summarise, restyle, or comment on it.\n' +
    `---\n${text}\n---`
  );
}

/** True when the cached keyword list is missing or older than {@link KEYWORDS_TTL_MS}. */
function keywordsCacheStale(cache, now) {
  return !cache || typeof cache.fetchedAt !== 'number' || now - cache.fetchedAt > KEYWORDS_TTL_MS;
}

/*
 * Plugin-version identity (SER-166). Claude Code installs each plugin BUILD into its own version
 * directory and re-registers the plugin's MCP servers when the active one changes — which tears a
 * live CommonGround connector down mid-session. Nothing here can prevent that (the lifecycle is the
 * host's), but the hooks can notice it after the fact and say so, which is the difference between
 * "CommonGround is broken / I lack permissions" and "run /mcp".
 */

/** This build's version from `<PLUGIN_ROOT>/.claude-plugin/plugin.json`, or null if unreadable. */
function pluginVersion() {
  try {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'),
    );
    const v = manifest && manifest.version;
    return typeof v === 'string' && v ? v : null;
  } catch {
    return null;
  }
}

/**
 * The absolute path of THIS build's bundled sync CLI, or null when it isn't there. The bare
 * `commonground` on PATH resolves through the ACTIVE version dir, which is exactly what a swap
 * changes — so recovery prose is better off naming the sibling that is valid right now.
 */
function cliPath() {
  try {
    const p = path.join(PLUGIN_ROOT, 'bin', 'commonground');
    return fs.existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

/** The host's session id from a hook payload (either casing), or null when it isn't provided. */
function sessionIdOf(input) {
  if (!input || typeof input !== 'object') return null;
  return input.session_id || input.sessionId || null;
}

/**
 * Where the session's plugin build is recorded. It sits beside the keyword cache in the credential
 * home deliberately: that is the only state location OUTSIDE every plugin version directory, so it
 * survives the swap it exists to detect (a marker inside the install would vanish with it).
 */
function versionMarkerPath() {
  return path.join(configHome(), VERSION_FILE);
}

/** The recorded `{ sessionId, version, at }` baseline, or null when absent/unreadable. */
function readVersionMarker() {
  try {
    return JSON.parse(fs.readFileSync(versionMarkerPath(), 'utf8'));
  } catch {
    return null;
  }
}

/** Record the baseline for a session. No-op without a version — never baseline a guess. */
function writeVersionMarker(sessionId, version) {
  if (!version) return;
  try {
    const p = versionMarkerPath();
    fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
    fs.writeFileSync(p, JSON.stringify({ sessionId: sessionId || null, version, at: Date.now() }), {
      mode: 0o600,
    });
    fs.chmodSync(p, 0o600); // `mode` is ignored when overwriting an existing file — enforce it (as config.ts does)
  } catch {
    /* best-effort marker */
  }
}

/** GET a `/wiki/*` JSON read with the device token, bounded by a timeout. Returns null on any failure. */
async function fetchJson(pathname, binding, timeoutMs) {
  if (typeof fetch !== 'function') return null; // very old Node without global fetch → skip
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiBase()}${pathname}`, {
      headers: { authorization: `Bearer ${binding.token}` },
      signal: ac.signal,
    });
    if (!res || !res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Where a team's clone lives on this machine — `<dataHome>/<teamId>`, mirroring the sync CLI's
 * `clonePath`. Purely positional: it says nothing about whether a clone is actually there.
 */
function clonePath(teamId) {
  return path.join(dataHome(), teamId);
}

/**
 * The local wiki clone's current HEAD commit sha for a team, or null. The clone lives at
 * `<dataHome>/<teamId>` (mirrors the sync CLI's clonePath); MCP-mode projects have no clone, so a
 * missing dir / non-repo / git failure all return null. Bounded so a slow git never stalls startup.
 */
function localCloneHead(teamId) {
  try {
    const dir = clonePath(teamId);
    if (!fs.existsSync(path.join(dir, '.git'))) return null; // MCP mode or not cloned
    const head = cp
      .execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], {
        encoding: 'utf8',
        timeout: 1000,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      .trim();
    return head || null;
  } catch {
    return null;
  }
}

/**
 * True when the clone already contains commit `oid`. This is how the SessionStart nudge tells
 * DIRECTION without any network: if the hosted wiki's newest commit is already in the clone, the
 * local side is the one that's ahead (unpublished work → push); if it isn't, the clone hasn't seen
 * the team's latest yet (→ pull). Fail-open: any error means "don't claim to know".
 */
function cloneHasCommit(teamId, oid) {
  try {
    const dir = clonePath(teamId);
    if (!fs.existsSync(path.join(dir, '.git'))) return false;
    cp.execFileSync('git', ['-C', dir, 'cat-file', '-e', `${oid}^{commit}`], {
      timeout: 1000,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The server's matching fold, mirrored (SER-212). MUST stay identical to `foldForMatching` in
 * `packages/shared/src/text.ts`, which is where the reasoning for each step lives; the plugin ships
 * as dependency-free CommonJS, so it cannot import it. `scripts/hook-fold.test.ts` pins the two
 * against each other over a corpus and reds the moment they diverge.
 *
 * Why the hook needs it at all: `deriveKeywords` folds, so a keyword is NFKC/NFC-normalised with the
 * Turkic dotted-i collapsed. Lowercasing the prompt alone leaves the two sides speaking different
 * normalisations — a wiki page `İstanbul` serves the keyword `istanbul` while the prompt lowercases
 * to `i` + U+0307 + `stanbul`, which does not contain it, so the hook silently stops firing for
 * Turkish. Folding one side of a comparison is worse than folding neither.
 */
function foldForMatching(s) {
  return String(s == null ? '' : s)
    .normalize('NFKC')
    .toLowerCase()
    .normalize('NFC')
    // U+0307 as an escape, never the literal combining mark: an invisible code point in source is
    // unreviewable, and survives a copy-paste only by luck.
    .replace(/i\u0307/gu, 'i');
}

/**
 * Which keywords appear in the prompt (case-insensitive, and normalisation-insensitive per
 * {@link foldForMatching}). Multi-word phrases match as a substring; single tokens match only on
 * word boundaries (so "api" doesn't fire inside "capital"). Returns at most `cap` hits, in the
 * keyword list's order.
 */
function matchKeywords(prompt, keywords, cap) {
  const hay = ` ${foldForMatching(prompt)} `;
  const limit = cap || 6;
  const hits = [];
  for (const raw of Array.isArray(keywords) ? keywords : []) {
    const k = foldForMatching(raw).trim();
    if (!k) continue;
    const found = k.includes(' ')
      ? hay.includes(k)
      : new RegExp(`(^|[^a-z0-9])${escapeRegExp(k)}([^a-z0-9]|$)`).test(hay);
    if (found && !hits.includes(k)) {
      hits.push(k);
      if (hits.length >= limit) break;
    }
  }
  return hits;
}

/** Emit a hook JSON payload injecting `additionalContext` for the given hook event, then done. */
function emitContext(hookEventName, additionalContext) {
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext } }),
  );
}

module.exports = {
  ROUTER_MARKER,
  CONFIG_DIR,
  foldForMatching,
  CREDENTIALS_FILE,
  KEYWORDS_TTL_MS,
  configHome,
  dataHome,
  credentialsPath,
  legacyStorePath,
  apiBase,
  readStdinInput,
  projectCwd,
  isInitialized,
  routerMode,
  readStore,
  bindings,
  isSignedIn,
  activeBinding,
  relocateLegacyCredential,
  legacyCredentialClause,
  keywordsCachePath,
  readKeywordsCache,
  writeKeywordsCache,
  keywordsCacheStale,
  hasWelcomed,
  markWelcomed,
  verbatimBlock,
  pluginVersion,
  cliPath,
  sessionIdOf,
  versionMarkerPath,
  readVersionMarker,
  writeVersionMarker,
  fetchJson,
  clonePath,
  localCloneHead,
  cloneHasCommit,
  matchKeywords,
  emitContext,
};
