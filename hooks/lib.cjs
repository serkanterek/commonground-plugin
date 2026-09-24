'use strict';
/*
 * Shared helpers for the CommonGround plugin hooks (Plugin Pivot Step 4 · SER-143). Self-contained
 * CommonJS (no workspace/npm deps) so it ships and runs inside the plugin bundle; both hooks
 * `require('./lib.cjs')`. Everything here is best-effort and fail-open — a hook must never break a
 * session, so every I/O path swallows its error and returns a safe default.
 *
 * Auth: the local device token (`cgdt_…`, stored by `commonground login`) is team-bound, so a plain
 * `Authorization: Bearer <token>` needs no `X-Team-Id` header — the API resolves the team from the
 * token. It does NOT reach every `/wiki/*` route: `wikiRoutes` is mounted on the browser-session
 * resolver because it also carries the write routes, so a device token only reaches the surfaces
 * that mount `deviceTokenAdapter` — `/wiki/state` and the git transport (SER-216).
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
const STATE_FILE = 'state.json'; // the active-WIKI pointer (SER-224) — non-secret, chosen by the user
const DEFAULT_API = 'https://api.commongroundapp.io';
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

/** The active-wiki pointer, beside the credential store but deliberately not inside it. */
function statePath() {
  return path.join(configHome(), STATE_FILE);
}

/**
 * The WIKI the user last chose, held as the team id that identifies it, or null (SER-224).
 *
 * Wikis, not teams: one of a user's wikis may be personal, one a team's, one the organization's,
 * and `team` already names a wiki's SCOPE — so this pointer is about which wiki is active, never
 * about switching teams.
 *
 * READ-ONLY here, and that asymmetry is deliberate: `commonground use` is the only writer. Hooks
 * run on every session start and every prompt, so a hook that could write this would be a hook that
 * could change which wiki a later command answers for — without anyone asking it to.
 *
 * Mirrors `readActiveWiki` in the agent's `config.ts` exactly, including trimming and treating an
 * empty string as absent. The two are hand-mirrored (this file ships standalone inside the plugin
 * bundle and cannot import the agent), which is why `active-wiki-drift.test.ts` compares them
 * behaviourally rather than trusting that they look alike.
 */
function readActiveWiki() {
  try {
    const raw = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
    const id = raw && raw.activeWiki;
    return typeof id === 'string' && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}

/**
 * The user's own preferences, from the same `state.json` the active-wiki pointer lives in (SER-325).
 *
 * READ-ONLY here, for the reason `readActiveWiki` is: `commonground prefs set` is the only writer,
 * so a hook can never quietly change what a later session does. An absent or unparseable file is
 * `{}`, which means every preference falls back to its default rather than to silence.
 */
function readPrefs() {
  try {
    const raw = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
    const prefs = raw && raw.prefs;
    return prefs && typeof prefs === 'object' && !Array.isArray(prefs) ? prefs : {};
  } catch {
    return {};
  }
}

/**
 * Is the "you have unpublished work" nudge wanted? ON unless the user turned it off.
 *
 * `commonground prefs set push-nudge off` is what a person gets when they say stop reminding me
 * about publishing — a real answer, rather than a nudge that keeps arriving and teaches them to
 * read past everything this hook says.
 */
function pushNudgeEnabled() {
  return String(readPrefs().pushNudge || '').trim().toLowerCase() !== 'off';
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

/**
 * The `CLAUDE.md` that GOVERNS `cwd`: its own, else the nearest ancestor's that carries the
 * CommonGround router block (SER-268). Mirrors the sync agent's `findRouterBlock` (commands.ts) —
 * Claude Code itself loads `CLAUDE.md` from the working directory and every parent, so a block two
 * folders up is already what Claude is reading; and a wiki clone's own block now carries a team
 * marker, so a session opened in a subfolder of your wiki must see the same wiki the CLI does.
 * Returns the file's text, or null. Bounded, offline, reads nothing but `CLAUDE.md` files, and
 * fail-open: an unreadable file is simply not a block.
 */
function governingClaudeMd(cwd) {
  let dir = path.resolve(cwd || process.cwd());
  for (let depth = 0; depth < 64; depth++) {
    try {
      const md = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
      if (md.includes(ROUTER_MARKER)) return md;
    } catch {
      /* no CLAUDE.md here — keep climbing */
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/** True when the CLAUDE.md governing this folder carries the CommonGround router block (i.e. it's initialized). */
function isInitialized(cwd) {
  return governingClaudeMd(cwd) !== null;
}

/**
 * The clone block's own heading, which is how a session opened INSIDE a wiki folder is told from a
 * project that reads one (SER-325). Hand-mirrored from `cloneRouterRule` in the agent's
 * `injection.ts`; `clone-path-drift.test.ts` is what keeps the two honest.
 */
const CLONE_BLOCK_HEADING = '## CommonGround wiki (this folder is the working copy)';

/**
 * Is the CLAUDE.md governing `cwd` the CLONE's own — i.e. is this session standing inside a wiki
 * folder rather than in a project that reads one?
 *
 * It matters for anything that tries to REPAIR a project's binding. A clone has no `.claude/`
 * settings to fix and never wanted one: writing there leaves a stray file inside the wiki that the
 * next publish would carry to everyone, and the receipt would tell the user to restart a session
 * to apply a repair that was never needed.
 */
function isCloneSession(cwd) {
  const md = governingClaudeMd(cwd);
  return md !== null && md.includes(CLONE_BLOCK_HEADING);
}

/**
 * This project's wiki mode from its CLAUDE.md router block: 'local' (a clone on disk), 'mcp' (the
 * remote connector), or null when there's no block. Mirrors the sync agent's `parseRouterBlock`
 * (SER-168) — the explicit `commonground:mode:` marker is authoritative, with the legacy
 * `(local clone)` prose sniff as the fallback for pre-marker blocks. Used to gate the pull/push
 * nudge on THIS project being a clone, not merely on a clone existing somewhere for the team.
 */
function routerMode(cwd) {
  const md = governingClaudeMd(cwd);
  if (md === null) return null;
  const block = /<!-- commonground:router-rule:start -->([\s\S]*?)<!-- commonground:router-rule:end -->/.exec(md);
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
 * The binding for the WIKI to act for, or null if it can't be resolved unambiguously.
 *
 * Resolves identically to the agent's `resolveWiki` (`team-resolve.ts`) — same order, same refusals —
 * FOR EVERYTHING THIS SIDE CAN SEE. They are hand-mirrored (this file ships standalone inside the
 * plugin bundle and cannot import the agent) and they have drifted before, so
 * `active-wiki-drift.test.ts` pins them against each other across the whole matrix rather than
 * trusting these comments.
 *
 * ONE DIVERGENCE IS DELIBERATE, and it is not drift to be repaired (SER-258). The CLI now confirms an
 * unheld marker/pointer against the server's membership listing and honours it; this cannot, and must
 * not try. Hooks run on every session start and every prompt, and this one is on the prompt hot path
 * with ZERO network calls by design — the asymmetry is structural, not an oversight. The two sides
 * also want opposite things from a candidate they cannot confirm: the CLI is choosing a wiki to
 * REPORT and PUBLISH to, where a wrong answer is what SER-258 was filed about, while this is choosing
 * a local keyword cache to read, where going quiet costs a nudge and nothing else. So this side keeps
 * the narrower rule and returns null rather than guessing — which is what the whole resolution order
 * exists to avoid. Widening it would mean acting for a wiki nobody confirmed, on every prompt.
 *
 * Order: this project's marker → the active wiki → the only wiki available → null.
 */
function activeBinding(cwd) {
  const all = bindings();
  if (all.length === 0) return null;

  // An initialized project already records which wiki it belongs to — `init` stamps the marker
  // inside its own router block — so ask the project first (SER-176). It outranks the active wiki
  // for the same reason it outranks everything in the CLI: a project bound to a wiki means it, and a
  // machine-wide switch must never silently retarget one that named its own.
  const marked = cwd ? projectTeamId(cwd) : null;
  const bound = marked ? all.find((b) => b && b.teamId === marked) : null;
  if (bound) return bound;

  // The user's own choice (SER-224). Before this, someone with several wikis, in a project that was
  // never initialized, got null — so keyword auto-trigger silently never fired there, in every such
  // folder, forever. Honoured only for a wiki we hold a binding for, because a hook cannot ask the
  // server whether the user is a member and must not act on a guess (SER-258 — the CLI CAN ask, and
  // does; see this function's header for why that divergence is deliberate). A pointer at a
  // signed-out wiki is stale data, not an instruction, which is what makes signing out safe without
  // anything clearing it. A marker naming a wiki we DON'T hold falls through to here rather than
  // being repaired — reading one wiki's state while the router block points at another's is the
  // failure the marker exists to prevent, and "the user picked this one" is a better answer than a
  // wrong guess.
  const active = readActiveWiki();
  const chosen = active ? all.find((b) => b && b.teamId === active) : null;
  if (chosen) return chosen;

  if (all.length === 1) return all[0];

  // Several wikis, no marker, no choice made. Still null, still silent: guessing here is what the
  // whole resolution order exists to avoid, and a hook has no way to ask.
  return null;
}

/**
 * The team THIS project is bound to, from the team marker inside its router block, or null.
 * Mirrors the sync agent's `parseRouterBlock` (injection.ts): the marker is written by `init` and
 * re-rendered by `init --refresh`, and it is scoped to the block so a stray comment elsewhere in a
 * user's CLAUDE.md cannot rebind the project.
 */
function projectTeamId(cwd) {
  const md = governingClaudeMd(cwd);
  if (md === null) return null;
  const block = /<!-- commonground:router-rule:start -->([\s\S]*?)<!-- commonground:router-rule:end -->/.exec(md);
  if (!block) return null;
  const marker = /<!-- commonground:team:([^\s>]+) -->/.exec(block[1]);
  return marker ? marker[1] : null;
}

/**
 * EVERY wiki this project reads, primary first (SER-278) — the team marker, then each also-marker
 * (`<!-- commonground:also:<id> -->`) in block order, duplicates and the primary dropped. `[]` when
 * the project names no wiki. Mirrors the sync agent's `parseRouterBlock` (SER-277), scoped to the
 * block like every reader here. {@link projectTeamId} stays the PRIMARY on purpose: every consumer
 * that asks "which wiki" still gets the one bare calls address, and only the consumers that want
 * the whole set ask this.
 */
function projectTeamIds(cwd) {
  const md = governingClaudeMd(cwd);
  if (md === null) return [];
  const block = /<!-- commonground:router-rule:start -->([\s\S]*?)<!-- commonground:router-rule:end -->/.exec(md);
  if (!block) return [];
  const primary = /<!-- commonground:team:([^\s>]+) -->/.exec(block[1]);
  if (!primary) return [];
  const ids = [primary[1]];
  for (const m of block[1].matchAll(/<!-- commonground:also:([^\s>]+) -->/g)) {
    if (!ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
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

/**
 * The whole welcome record, or `{}` — one reader so the two marks can never clobber (SER-325).
 *
 * There are TWO welcomes, and they are different moments: `install` speaks to someone who has not
 * signed in yet, `connected` to someone who has and whose project is not pointed at a wiki. One
 * shared mark meant the first one spent the second, permanently — the install sentence fires first
 * in the normal order, so the richer post-sign-in message could never be seen by the people it was
 * written for. A file written before this carries only `welcomedAt`, which still suppresses both.
 */
function readWelcomed() {
  try {
    const raw = JSON.parse(fs.readFileSync(welcomedPath(), 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

/**
 * Has this user already had this welcome? Unreadable/absent → not yet (fail toward saying it once).
 *
 * `install` is also suppressed by the connected mark: someone who was welcomed while signed in and
 * later signs out must not be told the plugin is installed, which they plainly know.
 */
function hasWelcomed(kind) {
  const raw = readWelcomed();
  return kind === 'install'
    ? Boolean(raw.installWelcomedAt || raw.welcomedAt)
    : Boolean(raw.welcomedAt);
}

/** Record one welcome, keeping the other's mark. Best-effort: worst case is saying it twice. */
function markWelcomed(now, kind) {
  try {
    const p = welcomedPath();
    const field = kind === 'install' ? 'installWelcomedAt' : 'welcomedAt';
    const next = { ...readWelcomed(), [field]: now };
    fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
    fs.writeFileSync(p, JSON.stringify(next), { mode: 0o600 });
    fs.chmodSync(p, 0o600);
  } catch {
    /* best-effort */
  }
}

/** Where the last-announced plugin release is remembered — beside the welcome marker. */
function updateNoticePath() {
  return path.join(configHome(), 'update-notice.json');
}

/** The whole update-notice record, or `{}` — one reader so the two fields can never clobber. */
function readUpdateState() {
  try {
    const raw = JSON.parse(fs.readFileSync(updateNoticePath(), 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

/**
 * MERGE a patch into the record. Merging rather than overwriting is load-bearing since SER-296:
 * `announced` and the release-check cache live in the same file, and the announce write happens on
 * a different code path from the check write — an overwrite would drop whichever one it did not
 * know about, silently re-arming a fetch or a notice that had already happened.
 */
function writeUpdateState(patch) {
  try {
    const p = updateNoticePath();
    fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
    fs.writeFileSync(p, JSON.stringify({ ...readUpdateState(), ...patch }), { mode: 0o600 });
    fs.chmodSync(p, 0o600); // `mode` is ignored when overwriting an existing file
  } catch {
    /* best-effort */
  }
}

/** The newest version we have already told this person about, or null (SER-225). */
function lastAnnouncedRelease() {
  const v = readUpdateState().announced;
  return typeof v === 'string' && v ? v : null;
}

/**
 * Remember that we announced `version`, so the notice fires ONCE PER RELEASE rather than once per
 * session (SER-225).
 *
 * Keyed by the version rather than a timestamp on purpose: a time-based throttle either nags for a
 * week or goes quiet before the user next opens the project, and neither has anything to do with
 * the thing being announced. Storing what we said means the next release speaks again immediately
 * and this one never does.
 *
 * Best-effort like `markWelcomed`: if this write fails the worst case is saying it twice, which is
 * a far better failure than a hook that throws.
 */
function markReleaseAnnounced(version) {
  writeUpdateState({ announced: version, sinceAnnounced: 0 });
}

/**
 * How many sessions have passed, in silence, since we last announced this release (SER-325).
 *
 * "Once per release" was the right correction to "every session", and it overshot: someone who is
 * mid-task the one time it speaks never hears about the release again, and stays on that build
 * until they happen to reinstall. Every fifth session is the middle — often enough to reach
 * somebody who was busy, rare enough that it is not the thing they learn to skip.
 */
const RELEASE_REANNOUNCE_EVERY = 5;

/** Should the notice for `latest` render this session? Silence is ONLY for a release already said. */
function shouldAnnounceRelease(latest) {
  if (!latest) return false;
  if (lastAnnouncedRelease() !== latest) return true;
  const seen = readUpdateState().sinceAnnounced;
  return (typeof seen === 'number' ? seen : 0) + 1 >= RELEASE_REANNOUNCE_EVERY;
}

/** Record a session that saw the release and said nothing, so the fifth one speaks. */
function noteReleaseSilence(latest) {
  if (!latest || lastAnnouncedRelease() !== latest) return;
  const seen = readUpdateState().sinceAnnounced;
  writeUpdateState({ sinceAnnounced: (typeof seen === 'number' ? seen : 0) + 1 });
}

/** How long a release verdict is trusted. Releases are rare; a drifted machine can wait half a day. */
const RELEASE_TTL_MS = 12 * 60 * 60 * 1000;
/** How long a FAILED check is remembered, so an outage costs one request per session-storm, not one per session. */
const RELEASE_FAILURE_TTL_MS = 30 * 60 * 1000;

/**
 * Is this machine behind the published plugin, as far as we can tell? `{ latest }` or null (SER-296).
 *
 * ## Why this exists rather than a cache of what `/wiki/state` said
 *
 * SER-296 originally proposed replaying the last `latest` the server told us on the paths that
 * cannot reach it. That is a NO-OP: `markReleaseAnnounced` fires the moment the server names a
 * version, so the cached value always equals the announced one and the notice always skips. A
 * replay can only repeat what a resolved session already said. The unbound paths need a SOURCE, so
 * this asks an endpoint that needs no token, no team and no project.
 *
 * ## Why the server returns the verdict
 *
 * Nothing here compares versions. `isBehind` is numeric rather than lexicographic for a reason that
 * is easy to get wrong twice (`0.6.10` sorts BEFORE `0.6.9` as a string), and this file is
 * dependency-free CommonJS that cannot import the tested copy — exactly the shape that needed a
 * drift guard for the credential and clone-path readers. Asking for the answer avoids the mirror.
 *
 * THROTTLED, because the caller runs on paths that fire in every project on the machine. The record
 * is keyed by the running version: if the plugin changed since the check, the verdict is about a
 * build we are no longer running and is discarded rather than trusted.
 *
 * Fail-open and silent throughout — null means "we do not know", which renders as SILENCE and never
 * as "you are up to date".
 */
async function releaseVerdict(nowMs = Date.now(), timeoutMs = 1500) {
  const running = pluginVersion();
  if (!running) return null; // unreadable manifest — we cannot say anything true about being behind
  const state = readUpdateState();
  const fresh =
    typeof state.checkedAt === 'number' &&
    state.checkedFor === running &&
    nowMs - state.checkedAt < (state.latest ? RELEASE_TTL_MS : RELEASE_FAILURE_TTL_MS);
  if (fresh) return state.behind && state.latest ? { latest: state.latest } : null;

  const answer = await fetchPublicJson('/plugin/latest', timeoutMs);
  const latest = answer && typeof answer.latest === 'string' ? answer.latest : null;
  const behind = Boolean(answer && answer.behind && latest);
  // Record the attempt either way: a failure that is not remembered is a failure repeated on every
  // session for as long as the outage lasts.
  writeUpdateState({ checkedAt: nowMs, checkedFor: running, latest, behind });
  return behind ? { latest } : null;
}

/**
 * Refresh the throttle from an answer we already have (SER-296).
 *
 * The resolved SessionStart path learns the same fact from `/wiki/state` as part of a read it makes
 * anyway. Recording it here means a later session on an unbound path does not spend a request
 * re-asking a question that was answered minutes ago. Free, and it keeps one notion of "when did we
 * last check" rather than two.
 */
function rememberReleaseCheck(latest, nowMs = Date.now()) {
  const running = pluginVersion();
  if (!running) return;
  writeUpdateState({
    checkedAt: nowMs,
    checkedFor: running,
    latest: typeof latest === 'string' && latest ? latest : null,
    behind: Boolean(latest),
  });
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
 * The `X-CommonGround-Client` header, or `{}` when this build's version can't be read (SER-226).
 *
 * A spread-ready object rather than a string so a caller cannot accidentally send the header with
 * an empty value — an empty client is indistinguishable from a broken one at the far end, and the
 * server's charset check would drop it anyway.
 *
 * Mirrored by `clientHeader()` in the agent's `backend.ts`; both send the same token for the same
 * build, which is what makes "plugin/0.6.9" mean one thing regardless of which half sent it.
 */
function clientHeader() {
  const v = pluginVersion();
  return v ? { 'x-commonground-client': `plugin/${v}` } : {};
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

/**
 * How Claude should SPELL a CLI command this hook hands it: `node "<cli>" <args>` when the bundled
 * binary is known, else the bare `commonground <args>` (SER-327).
 *
 * Claude Code puts the plugin's `bin/` on PATH in the Bash tool only, and PowerShell cannot run an
 * extensionless shebang file at all, so the bare word is a command that works in one of the two
 * shells Claude may pick. `node` plus the quoted absolute path runs from both, survives a space in
 * the path, and is the same form `recordProjectWiki` already uses. The bare fallback is for a
 * machine with no bundle (a dev checkout), where there is no path to name.
 */
function cliCommand(cli, args) {
  return cli ? `node "${cli}" ${args}` : `commonground ${args}`;
}

/** Does this path exist on THIS machine? Fail-open to `true` — never claim absence we can't prove. */
function pathExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return true;
  }
}

/**
 * A clone path a LEGACY router block committed into this project's CLAUDE.md, or null (SER-242).
 *
 * Blocks written before SER-242 interpolated the author's resolved folder — `is cloned at
 * `/Users/<them>/CommonGround/…`` — into a TRACKED file. On anyone else's machine that directory
 * does not exist, and nothing detected it: mode detection reads the marker, not the path. Their
 * Claude was told by the project's own CLAUDE.md to read a catalog there and write ingests under it.
 *
 * New blocks name no folder, so this returns null for them and the check that uses it goes quiet.
 * It exists entirely for the committed blocks already out there, which keep their embedded path
 * until someone re-runs `init --refresh` — that population is the reason this is not optional
 * garnish.
 *
 * Scoped to the router block, like every other reader here, so a path mentioned elsewhere in a
 * user's CLAUDE.md is not mistaken for a binding.
 */
function legacyClonePath(cwd) {
  const md = governingClaudeMd(cwd);
  if (md === null) return null;
  const block = /<!-- commonground:router-rule:start -->([\s\S]*?)<!-- commonground:router-rule:end -->/.exec(md);
  if (!block) return null;
  const found = /is cloned at `([^`\n]+)`/.exec(block[1]);
  return found ? found[1].trim() || null : null;
}

/**
 * Read what `commonground record-wiki` printed, or null for anything unusable (SER-240).
 *
 * Split out from the spawn purely so it can be tested against the AGENT's own serialization without
 * a built bundle: `record-wiki.contract.test.ts` feeds this the exact `JSON.stringify` of a real
 * `recordProjectWiki` result. That round trip is the whole drift guard — the hook and the CLI are in
 * different languages and different processes, and the only thing joining them is this shape.
 *
 * Validates the outcome against a closed set rather than trusting the field. An unknown value means
 * we are talking to a CLI that has moved on, and the honest response to that is "I don't know what
 * happened", not to render a receipt for an outcome we cannot name.
 */
const RECORD_OUTCOMES = ['written', 'unchanged', 'unreadable', 'no-marker'];
function parseRecordWiki(stdout) {
  try {
    const parsed = JSON.parse(String(stdout).trim());
    if (!parsed || typeof parsed !== 'object') return null;
    if (!RECORD_OUTCOMES.includes(parsed.outcome)) return null;
    const wiki = typeof parsed.wiki === 'string' && parsed.wiki.trim() ? parsed.wiki.trim() : null;
    // The whole set, when the project reads more than one wiki (SER-277/278). Optional on the wire
    // — a CLI that predates the set never prints it — and only ever a list of non-empty strings.
    const wikis =
      Array.isArray(parsed.wikis) && parsed.wikis.every((w) => typeof w === 'string' && w.trim())
        ? parsed.wikis.map((w) => w.trim())
        : null;
    return { outcome: parsed.outcome, wiki, ...(wikis ? { wikis } : {}) };
  } catch {
    return null;
  }
}

/**
 * Rebuild `COMMONGROUND_WIKI` for `cwd` by shelling THIS build's bundled CLI (SER-240).
 *
 * Shelled rather than reimplemented, on purpose. `writeProjectWikiEnv` merges into the user's own
 * `settings.json`, preserves unknown keys, overwrites a stale wiki rather than adding-if-absent, is
 * byte-idempotent, and refuses an unparseable file instead of rebuilding it — five behaviours that
 * are already built and already tested. A second copy of them in dependency-free CJS is exactly the
 * mirror that has bitten this codebase twice (the matching fold, the client header), and the failure
 * mode here is worse than either: a divergent copy would write the wrong wiki id, silently.
 *
 * `process.execPath` rather than executing the file, so this never depends on the exec bit surviving
 * an install or on the shebang resolving to the right node.
 *
 * FAIL-OPEN, and the cost of failing is nothing: no CLI, a crash, a timeout, junk on stdout all
 * return null, and the caller then simply SAYS the state instead of repairing it — which is the
 * behaviour that shipped before this existed.
 */
function recordProjectWiki(cwd) {
  const cli = cliPath();
  if (!cli) return null;
  try {
    return parseRecordWiki(
      cp.execFileSync(process.execPath, [cli, 'record-wiki'], {
        cwd,
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    );
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
/**
 * KEYED PER SESSION since SER-325, not one file per machine.
 *
 * The baseline exists to answer "did the plugin change under THIS session". One shared file could
 * not: two sessions open at once take turns overwriting each other's `sessionId`, so the swap check
 * in the prompt hook sees "another session's baseline" — which it correctly refuses to draw any
 * conclusion from — and a real swap goes unannounced for both. Anyone with two terminals open had
 * the detection silently off.
 *
 * The id is hashed rather than interpolated: it arrives from the host and becomes a filename, and
 * a path separator in it would write outside the config home. Without one (an old host, a manual
 * run) the historical machine-wide name is used, so nothing regresses for callers that have no id.
 */
function versionMarkerPath(sessionId) {
  const id = typeof sessionId === 'string' && sessionId.trim() ? sessionId.trim() : null;
  if (!id) return path.join(configHome(), VERSION_FILE);
  const key = crypto.createHash('sha256').update(id).digest('hex').slice(0, 16);
  return path.join(configHome(), `plugin-version-${key}.json`);
}

/** The recorded `{ sessionId, version, at }` baseline for this session, or null when absent. */
function readVersionMarker(sessionId) {
  try {
    return JSON.parse(fs.readFileSync(versionMarkerPath(sessionId), 'utf8'));
  } catch {
    return null;
  }
}

/** Record the baseline for a session. No-op without a version — never baseline a guess. */
function writeVersionMarker(sessionId, version) {
  if (!version) return;
  try {
    const p = versionMarkerPath(sessionId);
    fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
    fs.writeFileSync(p, JSON.stringify({ sessionId: sessionId || null, version, at: Date.now() }), {
      mode: 0o600,
    });
    fs.chmodSync(p, 0o600); // `mode` is ignored when overwriting an existing file — enforce it (as config.ts does)
    sweepVersionMarkers();
  } catch {
    /* best-effort marker */
  }
}

/** A session's marker outlives its session, so old ones are swept. Best-effort and bounded. */
const VERSION_MARKER_TTL_MS = 7 * 24 * 60 * 60 * 1000;
function sweepVersionMarkers(now = Date.now()) {
  try {
    const dir = configHome();
    for (const name of fs.readdirSync(dir)) {
      if (!/^plugin-version-[0-9a-f]{16}\.json$/.test(name)) continue;
      const p = path.join(dir, name);
      try {
        if (now - fs.statSync(p).mtimeMs > VERSION_MARKER_TTL_MS) fs.unlinkSync(p);
      } catch {
        /* one unreadable marker never stops the sweep */
      }
    }
  } catch {
    /* best-effort */
  }
}

/**
 * GET a PUBLIC json read with no credential at all (SER-296) — the sibling of {@link fetchJson} for
 * the paths that hold no device token. Declares the client like every other call, because the whole
 * point of the one route this serves is to answer a question about that version.
 */
async function fetchPublicJson(pathname, timeoutMs) {
  if (typeof fetch !== 'function') return null;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiBase()}${pathname}`, { headers: clientHeader(), signal: ac.signal });
    if (!res || !res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET a `/wiki/*` JSON read with the device token, bounded by a timeout, SAYING WHY it failed:
 * `{ ok, status, body }` (SER-325).
 *
 * `headers` lets a caller SELECT a wiki (`x-cg-wiki`, SER-241) — one sign-in reaches every wiki the
 * user belongs to, so the SessionStart hook can read an also-wiki's state with the same token it
 * holds for the primary (SER-278). Never an authorization: the server re-checks membership.
 *
 * `fetchJson` collapses every failure to null, so the SessionStart hook could only ever report
 * "CommonGround could not be reached" — which is false, and misleading, for the two failures that
 * are not outages at all. A 401 is a sign-in the server would not accept; a 403 is a membership
 * this person no longer has. Both send Claude hunting for a network problem that is not there, and
 * neither is fixed by waiting.
 *
 * `status` is 0 when the request never got an answer (no fetch, DNS, timeout, refused connection),
 * which is the only case that honestly reads as unreachable. A body that will not parse is `ok`
 * with a null body: the door answered, so the diagnosis is not a connection one.
 */
async function fetchJsonResult(pathname, binding, timeoutMs, headers) {
  if (typeof fetch !== 'function') return { ok: false, status: 0, body: null };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiBase()}${pathname}`, {
      // Declare which client is calling (SER-226). This hook runs every session, so it is the
      // highest-frequency place the server learns a person's plugin version — and the value it
      // records here is what an MCP request later reads back, since those arrive from Claude's own
      // MCP client with nowhere for us to put a header. Omitted rather than faked when the manifest
      // cannot be read: unknown is a state the server already handles, a guess is not.
      headers: { authorization: `Bearer ${binding.token}`, ...clientHeader(), ...(headers || {}) },
      signal: ac.signal,
    });
    if (!res) return { ok: false, status: 0, body: null };
    if (!res.ok) return { ok: false, status: res.status || 0, body: null };
    try {
      return { ok: true, status: res.status || 200, body: await res.json() };
    } catch {
      return { ok: true, status: res.status || 200, body: null };
    }
  } catch {
    return { ok: false, status: 0, body: null };
  } finally {
    clearTimeout(timer);
  }
}

/** The body of {@link fetchJsonResult}, or null — the shape every caller that only wants data uses. */
async function fetchJson(pathname, binding, timeoutMs, headers) {
  return (await fetchJsonResult(pathname, binding, timeoutMs, headers)).body;
}

/** The team-profile cache the CLI keeps beside the token — non-secret, and never written here. */
function profilesPath() {
  return path.join(configHome(), 'profiles.json');
}

/** A team's cached profile, or `{}`. Fail-open: this only ever degrades a nudge. */
function readTeamProfile(teamId) {
  try {
    const raw = JSON.parse(fs.readFileSync(profilesPath(), 'utf8'));
    return (raw && raw.teams && raw.teams[teamId]) || {};
  } catch {
    return {};
  }
}

/**
 * Where a team's clone lives on this machine — the READ half of `config.ts`'s `resolveClonePath`
 * (SER-221), in the same four steps and the same order:
 *
 *   1. a folder the user chose (absolute, outranks `COMMONGROUND_HOME`);
 *   2. else the recorded directory name under the current data home;
 *   3. else `<dataHome>/<teamId>`, the pre-SER-221 location, if a clone is sitting there;
 *   4. else that same UUID path as the last word.
 *
 * Step 4 differs from the CLI's on purpose: the CLI's fourth step INVENTS a name for a clone it is
 * about to create, and this file never creates one. A hook that guessed a not-yet-existing default
 * would report "out of sync" about a directory nobody has cloned yet. Every consumer here treats a
 * missing directory as "say nothing", so returning the historical path is the quiet answer.
 *
 * Drift here is silent, not loud: resolve a different directory than the CLI and the SessionStart
 * sync nudge simply stops firing. `credential-drift.test.ts` is what stops that happening.
 */
function clonePath(teamId) {
  const profile = readTeamProfile(teamId);
  if (profile.clonePath) return profile.clonePath;
  if (profile.cloneDir) return path.join(dataHome(), profile.cloneDir);
  return path.join(dataHome(), teamId);
}

/**
 * Does the folder at this wiki's clone path LOOK like a finished clone (SER-320)? Filesystem first:
 * it runs at every session start, and a slow git must never turn into a false "your wiki folder is
 * missing". A finished clone has a `HEAD` and at least one ref; a `git clone` killed mid-flight has
 * the first and not the second, and the stub an old `init` manufactured in a non-repository
 * (`.git/info/` and nothing else) has neither.
 *
 * Since SER-327 a finished clone also finished its CHECKOUT ({@link checkoutUnfinished}). That asks
 * git only when the index is missing or empty, and a git that cannot answer leaves the folder
 * counted as usable, for the reason above.
 */
function cloneLooksUsable(teamId) {
  try {
    const dir = clonePath(teamId);
    const gitDir = gitDirOf(dir);
    // `undefined` is "git could not say where a `.git` FILE points", never grounds for "missing".
    if (gitDir === undefined) return true;
    if (!gitDir || !fs.existsSync(path.join(gitDir, 'HEAD'))) return false;
    // `null` is "git could not say", and that is never grounds for calling a folder missing.
    return holdsRef(dir, gitDir) && checkoutUnfinished(dir, gitDir) !== true;
  } catch {
    return false;
  }
}

/** What git said a `.git` FILE points to, per folder, for this process ({@link gitDirOf}). */
const askedGitDirs = new Map();

/**
 * This clone's git directory: `<dir>/.git`, or where a `.git` FILE points (SER-327). `null` when
 * there is none, and `undefined` when git could not answer.
 *
 * Filesystem first, because every clone the CLI makes has a `.git` directory. A clone made with
 * `--separate-git-dir`, or a linked worktree, has a `.git` FILE naming a directory elsewhere, and a
 * path joined onto it called that finished clone missing while the CLI, which asks git for the same
 * directory (`checkoutUnfinished` in clone-state.ts), called it usable. Only that shape asks git,
 * bounded like every git call here, and only a git that ANSWERED "not a repository" says there is
 * none.
 *
 * Git's answer is kept per folder ({@link askedGitDirs}): a session start asks this of one folder up
 * to four times, and each hook run is a process of its own, so a kept answer cannot go stale.
 */
function gitDirOf(dir) {
  const dotGit = path.join(dir, '.git');
  let info;
  try {
    info = fs.statSync(dotGit);
  } catch {
    return null;
  }
  if (info.isDirectory()) return dotGit;
  if (!askedGitDirs.has(dir)) askedGitDirs.set(dir, askGitDir(dir));
  return askedGitDirs.get(dir);
}

/** {@link gitDirOf}'s question to git, for a folder whose `.git` is a FILE. */
function askGitDir(dir) {
  try {
    return gitRead(dir, ['rev-parse', '--absolute-git-dir']).trim() || null;
  } catch (e) {
    return e && typeof e.status === 'number' && e.status !== 0 ? null : undefined;
  }
}

/** One bounded git read in the clone at `dir`: its stdout, or a throw. A slow git never stalls startup. */
function gitRead(dir, args, timeout = 1000) {
  return cp.execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf8',
    timeout,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

/**
 * Does this clone hold at least one ref? Filesystem first: `packed-refs`, or a loose ref under
 * `refs/heads/`.
 *
 * A REFTABLE repository cannot be read that way (SER-327): its `refs/heads` is a stub FILE and the
 * refs live in `.git/reftable/`, so the directory read threw and a finished clone was called
 * missing, which also silenced its push nudge and its offline line. Anyone whose git config sets
 * `init.defaultRefFormat=reftable` gets such a clone from the CLI, and reftable is Git 3.0's
 * default. A linked worktree keeps no refs of its own either (they live in the main repository's
 * git directory). For both shapes git answers, bounded like every git call here, which is what the
 * CLI's `isUsableClone` asks too. Only a git that ANSWERED "no commit here" says no; one that could
 * not answer (a timeout, no git at all) claims nothing, for the reason {@link cloneLooksUsable}
 * gives.
 */
function holdsRef(dir, gitDir) {
  if (fs.existsSync(path.join(gitDir, 'packed-refs'))) return true;
  const heads = path.join(gitDir, 'refs', 'heads');
  let listable = false;
  try {
    listable = fs.statSync(heads).isDirectory();
  } catch {
    // No `refs/heads` at all: git decides below.
  }
  if (listable) return fs.readdirSync(heads).length > 0;
  try {
    cp.execFileSync('git', ['-C', dir, 'rev-parse', '--verify', '--quiet', 'HEAD'], {
      timeout: 1000,
      stdio: 'ignore',
    });
    return true;
  } catch (e) {
    return !(e && typeof e.status === 'number' && e.status !== 0);
  }
}

/**
 * How many entries the clone's index holds, read from its header, or null when there is no index
 * (SER-327). `-1` is an index this cannot read, which the caller treats as "finished": an unknown
 * is never grounds for a claim.
 */
function indexEntryCount(gitDir) {
  let fd;
  try {
    fd = fs.openSync(path.join(gitDir, 'index'), 'r');
  } catch (e) {
    return e && e.code === 'ENOENT' ? null : -1;
  }
  try {
    // `DIRC`, a 4-byte version, then the 4-byte big-endian entry count — every index version.
    const head = Buffer.alloc(12);
    if (fs.readSync(fd, head, 0, 12, 0) < 12 || head.toString('latin1', 0, 4) !== 'DIRC') return -1;
    return head.readUInt32BE(8);
  } catch {
    return -1;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Did this clone's CHECKOUT die after its fetch landed (SER-327)? `true`, `false`, or `null` when git
 * could not say.
 *
 * `git clone` writes HEAD and the refs before it checks out, so a checkout that fails on a path
 * this machine cannot write (a name Windows refuses, a path over its length limit) leaves a folder
 * that has every mark of a finished clone except an index. Read as one, it is worse than empty: git
 * sees every published file as a staged deletion, and a push nudge built on that count steers the
 * user into publishing the removal of the wiki. The CLI's `cloneState` (clone-state.ts) calls the
 * same folder wreckage and re-clones it; `clone-usable-drift.test.ts` pins the two readings together.
 *
 * The rule is the CLI's: no index, or an EMPTY one, while HEAD's tree has files. Filesystem first
 * (the index header), and git only in that rare shape, bounded like every git call here. An empty
 * tree is a finished clone of an empty wiki, not an unfinished one. `gitDir` is {@link gitDirOf}'s
 * answer when the caller already has it; a git directory nobody can locate is a question git could
 * not answer.
 */
function checkoutUnfinished(dir, gitDir = gitDirOf(dir)) {
  if (!gitDir) return null;
  const entries = indexEntryCount(gitDir);
  if (entries !== null && entries !== 0) return false;
  try {
    return gitRead(dir, ['ls-tree', '--name-only', 'HEAD']).trim().length > 0;
  } catch {
    return null;
  }
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

/** The hosted history this clone last fetched: what every CLI fetch and publish moves. */
const UPSTREAM = '@{upstream}';

/** A commit id as the server sends one, and so never something git could read as an option. */
function isCommitId(oid) {
  return /^[0-9a-f]{7,64}$/i.test(String(oid || ''));
}

/**
 * Where the clone's HEAD and `rev` meet (`git merge-base`), or null: `rev` is not here, the two
 * share no history, or git could not say. `rev` is the hosted tip's commit id, or {@link UPSTREAM}.
 *
 * This is how the SessionStart nudge tells DIRECTION without any network (SER-327). The merge-base
 * IS the hosted tip when the clone's history contains it, so anything past it is this folder's own
 * (push); it is HEAD when the clone is only behind (pull); anything else is both. A test of whether
 * the tip's OBJECT is here said "ahead" for a clone a blocked pull had fetched and never merged, and
 * then described the pages that tip deleted as pages this folder holds.
 */
function cloneMergeBase(teamId, rev) {
  try {
    if (rev !== UPSTREAM && !isCommitId(rev)) return null;
    const dir = clonePath(teamId);
    if (!fs.existsSync(path.join(dir, '.git'))) return null;
    return gitRead(dir, ['merge-base', rev, 'HEAD']).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Files the OS drops into any folder a person opens by hand (SER-325, `desktop.ini` since SER-327).
 * Mirrors `isFolderNoiseName` in the agent's `transport.ts`, case-insensitively like it: Windows and
 * a default macOS volume do not care about case, so `Desktop.ini` is the same litter as `desktop.ini`.
 */
const FOLDER_NOISE = new Set(['.ds_store', 'thumbs.db', 'desktop.ini']);
function isFolderNoiseName(name) {
  return FOLDER_NOISE.has(String(name).toLowerCase());
}

/**
 * The charter's two paths: the root since SER-191, `company/` in every wiki chartered before it.
 * Mirrors `CHARTER_PAGE_ID` and `LEGACY_CHARTER_PAGE_IDS` in `@commonground/shared`, which this
 * dependency-free file cannot import.
 */
const CHARTER_PATHS = new Set(['wiki-charter.md', 'company/wiki-charter.md']);

/**
 * `{ files, pages, charter, holds }` for a list of changes, each `{ path, gone }` with a
 * repo-relative path (SER-325, SER-327).
 *
 * Mirrors `unpublishedWork` in apps/sync-agent/src/transport.ts: the same folder-noise rule, the
 * same idea of a page (markdown outside `sources/`, and never `index.md`, which is regenerated on
 * publish). `commonground status` and the push nudge must report the same N for the same folder,
 * and `unpublished-drift.test.ts` runs both on the same folders to hold them to it.
 *
 * `charter` says the charter is AMONG those pages. It is still counted as a page, as the CLI counts
 * it, and flagged so an emit can call it the charter rather than one more page: one session was
 * told "a charter" and "1 page(s)" about the same file (SER-327).
 *
 * `holds` is `{ pages, charter }` over the changes still ON DISK. A deletion is a change the next
 * publish carries, so the counts keep it as the CLI does; it is not something the folder holds, and
 * "the folder already holds a charter" was said about a charter the user had deleted from it.
 */
function describeChanges(changes) {
  const kept = changes.filter((c) => !isFolderNoiseName(c.path.slice(c.path.lastIndexOf('/') + 1)));
  const tally = (list) => {
    let pages = 0;
    let charter = false;
    for (const { path: p } of list) {
      if (!p.toLowerCase().endsWith('.md')) continue;
      if (p === 'index.md' || p.startsWith('sources/')) continue;
      pages += 1;
      if (CHARTER_PATHS.has(p)) charter = true;
    }
    return { pages, charter };
  };
  return { files: kept.length, ...tally(kept), holds: tally(kept.filter((c) => !c.gone)) };
}

/**
 * Every member of a case-twin group the INDEX holds, on a clone whose filesystem folds case, or an
 * empty set (SER-327). Mirrors the CLI's rule in `unpublishedWork` (transport.ts): `caseTwins` over
 * `git ls-files` when `core.ignorecase` is true, grouped by `pathFoldKey` (NFC, then lower case),
 * both from `@commonground/shared`, which this dependency-free file cannot import.
 *
 * Such a clone holds ONE file for the whole group, so git reads the others as edited the moment it
 * is checked out. That phantom is not work anyone can publish from here: push refuses the folder,
 * and a nudge that counted it asked the user to publish, every session, a page they never touched.
 * `unpublished-drift.test.ts` runs both sides on the same twin clone.
 */
function foldedTwinMembers(dir) {
  const groups = new Map();
  for (const p of gitRead(dir, ['ls-files', '-z'], 1500).split('\0')) {
    if (!p) continue;
    const key = p.normalize('NFC').toLowerCase();
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key).add(p); // the raw spelling, as `caseTwins` keeps it
  }
  const members = new Set();
  for (const group of groups.values()) if (group.size > 1) group.forEach((p) => members.add(p));
  if (members.size === 0) return members;
  try {
    return gitRead(dir, ['config', '--bool', 'core.ignorecase']).trim() === 'true' ? members : new Set();
  } catch {
    return new Set(); // unset: git's own default, a filesystem that keeps case apart
  }
}

/**
 * `changes` without {@link foldedTwinMembers}. Only a TRACKED path can be a member, so a folder of
 * new pages (the common shape) costs no git call here.
 */
function withoutFoldedTwins(dir, changes) {
  if (!changes.some((c) => c.tracked)) return changes;
  const members = foldedTwinMembers(dir);
  return members.size === 0 ? changes : changes.filter((c) => !members.has(c.path));
}

/**
 * What is sitting in the clone that `commonground push` would publish, `{ files, pages, charter,
 * holds }` by {@link describeChanges}, or null when there is no clone to look at (SER-325).
 *
 * The sync nudge used to compare HEADs and nothing else, so a session that wrote five pages and
 * never committed them saw two identical HEADs and said nothing at all. That is the most common
 * shape unpublished work takes: Claude writes a page, the user closes the terminal, and the next
 * session is told the wiki is in step with the team when the pages are still only on this machine.
 *
 * `--untracked-files=all` rather than git's default, which collapses a new folder to one entry and
 * would report "1 file" for a directory of pages. The injected tooling (`CLAUDE.md`, the maintainer
 * skill) is excluded through `.git/info/exclude`, so it is invisible here exactly as it is to the
 * publish itself. Bounded and fail-open like every git call here: a slow or angry git says nothing
 * rather than delaying the session's start.
 *
 * NUL-separated, as `statusEntries` in clone-state.ts reads it (SER-327): the paths are compared
 * with the index's own spellings for the twin rule, so they must arrive raw, never C-quoted. The
 * count is the CLI's either way.
 *
 * One `git status` per wiki per session start is the budget (SER-327): SessionStart reads this
 * through `folderReading`, which asks once and only when an emit needs the answer.
 */
function cloneWorkingTreeWork(teamId) {
  try {
    const dir = clonePath(teamId);
    if (!fs.existsSync(path.join(dir, '.git'))) return null;
    // A checkout that never finished has no index, so git reads every published file as a staged
    // deletion (SER-327). That is not work: counting it is how a nudge would steer the user into
    // publishing the removal of the whole wiki. An unknown answer claims nothing either.
    if (checkoutUnfinished(dir) !== false) return null;
    const fields = gitRead(dir, ['status', '--porcelain', '-z', '--untracked-files=all'], 1500).split('\0');
    const changes = [];
    for (let i = 0; i < fields.length; i += 1) {
      const field = fields[i];
      if (field.length < 4) continue; // the empty tail after the last NUL
      const xy = field.slice(0, 2);
      // `-z` puts a rename's NEW path first and its source in the next field; the new one publishes.
      // Either column can hold the rename: an intent-to-add file (`git add -N`) that git pairs with
      // a deleted one reads ` R`, and its source read as a second page.
      if (/[RC]/.test(xy)) i += 1;
      changes.push({ path: field.slice(3), tracked: xy !== '??', gone: xy.includes('D') });
    }
    return describeChanges(withoutFoldedTwins(dir, changes));
  } catch {
    return null;
  }
}

/**
 * What the folder holds past `base`, where this clone's own history leaves the hosted one (SER-327):
 * `{ files, pages, charter, holds }` by {@link describeChanges}, or null when that cannot be read.
 *
 * Unpublished work is not only uncommitted. `push` commits before it fetches and publishes, and
 * `import` commits before it syncs, so a sign-in, network or fetch failure after the commit leaves
 * the pages committed here and nowhere else. `git status` is clean over them, and the session was
 * told its wiki was empty and should be seeded. The caller passes the MERGE-BASE of HEAD with the
 * hosted history ({@link cloneMergeBase}), and only for a clone with commits past it: the hosted tip
 * itself was the wrong base for a clone that was also behind, where what that tip deleted read as
 * pages this folder added.
 *
 * Compared with the WORKING TREE, not HEAD, and deletions left out: a page committed here and then
 * deleted from the folder is not something the folder holds. `base` is used only when it is a
 * commit id, never as something git could read as an option.
 */
function cloneCommittedWork(teamId, base) {
  try {
    if (!isCommitId(base)) return null;
    const dir = clonePath(teamId);
    if (!fs.existsSync(path.join(dir, '.git'))) return null;
    if (checkoutUnfinished(dir) !== false) return null;
    const out = gitRead(dir, ['diff', '--name-only', '-z', '--no-ext-diff', '--diff-filter=ACMR', base, '--'], 1500);
    const changes = out
      .split('\0')
      .filter(Boolean)
      .map((p) => ({ path: p, tracked: true, gone: false }));
    return describeChanges(withoutFoldedTwins(dir, changes));
  } catch {
    return null;
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

/**
 * The developer opt-in (SER-288/289): `COMMONGROUND_AUDIENCE=terminal` in the user's own settings
 * `env` flips the bundled CLI back to command-line phrasing, and this one sentence tells Claude to
 * match it. Chat-first stays the default — the note renders ONLY when the user asked for the
 * terminal, so everyone else pays zero tokens for it.
 */
function audiencePreferenceNote(env = process.env) {
  const pref = String(env.COMMONGROUND_AUDIENCE || '')
    .trim()
    .toLowerCase();
  if (pref !== 'terminal') return '';
  return 'This user prefers the terminal: name the `commonground` verb beside each step you take or offer.';
}

module.exports = {
  ROUTER_MARKER,
  audiencePreferenceNote,
  CONFIG_DIR,
  foldForMatching,
  CREDENTIALS_FILE,
  configHome,
  dataHome,
  credentialsPath,
  legacyStorePath,
  apiBase,
  readStdinInput,
  projectCwd,
  projectTeamId, // the wrong-wiki guard reads it directly (SER-234), not only via activeBinding
  projectTeamIds, // the whole set, primary first (SER-278)
  isInitialized,
  routerMode,
  isCloneSession,
  CLONE_BLOCK_HEADING,
  readPrefs,
  pushNudgeEnabled,
  legacyClonePath,
  pathExists,
  readStore,
  bindings,
  isSignedIn,
  activeBinding,
  statePath,
  readActiveWiki,
  relocateLegacyCredential,
  legacyCredentialClause,
  keywordsCachePath,
  readKeywordsCache,
  writeKeywordsCache,
  hasWelcomed,
  lastAnnouncedRelease,
  markReleaseAnnounced,
  shouldAnnounceRelease,
  noteReleaseSilence,
  RELEASE_REANNOUNCE_EVERY,
  releaseVerdict,
  rememberReleaseCheck,
  fetchPublicJson,
  updateNoticePath,
  markWelcomed,
  verbatimBlock,
  pluginVersion,
  cliPath,
  cliCommand,
  parseRecordWiki, // exported for the CLI-contract test, not for the hooks
  recordProjectWiki,
  sessionIdOf,
  versionMarkerPath,
  readVersionMarker,
  writeVersionMarker,
  fetchJson,
  fetchJsonResult,
  clientHeader,
  clonePath,
  localCloneHead,
  cloneLooksUsable,
  cloneMergeBase,
  UPSTREAM,
  cloneWorkingTreeWork,
  cloneCommittedWork,
  isFolderNoiseName,
  matchKeywords,
  emitContext,
  governingClaudeMd,
};
