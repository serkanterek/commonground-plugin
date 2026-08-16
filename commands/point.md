---
description: Point this project at your CommonGround wiki — sign in, pick a wiki, done. Works the first time and every time after.
argument-hint: "[wiki] [mcp|local]"
---

Aim the current project at a CommonGround wiki so this session can consult it. Work through these
steps conversationally, adapting to what's already true — don't blindly run everything.

**One verb, first time and every time after.** Setting a project up and re-aiming it later are the
same command, so there is never a moment where the user has to work out which one they are in.
Re-running this on an already-pointed project is expected, not a mistake.

The bundled `commonground` CLI talks to the hosted API by default (no env setup needed).

## 1. Check sign-in state

Run `commonground status`.
- If it reports a team with a sync state, the user is already signed in — note the team and go to step 3.
- If it reports "not logged in" / "no team logged in", continue to step 2.

## 2. Sign in (device-code login)

The user needs a CommonGround account **with at least one wiki** first — the authorize screen has
nothing to approve without one, and its button is hidden rather than left dead.
- **No account/wiki yet?** Point them to https://app.commongroundapp.io/sign-up to create an account
  and a wiki. (Admins invite teammates there; a member can instead accept an invite link.)
- Then sign the device in. Use the **split** form, not the one-shot `commonground login`: the
  one-shot blocks until the grant expires (~10 minutes), which is far longer than a tool call gets,
  so it is killed and looks like a failure when it was only waiting.

  1. `commonground login --start` — prints the URL and the code, then exits.
  2. Relay both to the user: *"Open app.commongroundapp.io/activate and enter ABCD-2345. Tell me
     when you've approved it."*
  3. `commonground login --wait` — polls for about 90 seconds. If it reports **still waiting**, that
     is not an error: the user hasn't clicked Approve yet. Run it again.

  **Stop after the second "still waiting" and say why, instead of polling a third time.** A poll
  that never lands almost always means the user cannot press the button, not that they are slow —
  and the loop hides that completely. The two causes, in order of likelihood: they have **no wiki
  yet** (the authorize screen offers no button at all in that state, and tells them to create one),
  or the code expired and needs a fresh `commonground login --start`. Ask which they are seeing on
  the screen rather than guessing, and never keep polling while telling them nothing is wrong.

  On success it prints the wiki and role. **One sign-in is all they need** — it reaches every wiki
  they are a member of, now and later, so a wiki created or joined afterwards needs no second login.

## 3. Resolve which wiki this project should read

If `$ARGUMENTS` names a wiki, that wins — use it and skip the listing.

Otherwise run `commonground use` with no argument. It lists every wiki the user is a **member** of —
asked of the server, not of this machine's sign-ins — marks the currently-active one with `*`, marks
the one **this project** is bound to, and marks any reached `via your other sign-in`.

Relay it in plain language — wiki names, never bare UUIDs.

- **Exactly one wiki** → don't stage a decision that isn't one. Confirm it in a sentence and move on:
  *"Pointing this project at your Acme Handbook wiki."*
- **Several** → ask which one, by name — with the `AskUserQuestion` tool if it's available in this
  session, otherwise as a plain question. **Don't guess, don't default to the first, and don't pick
  "the one they used last."** Which wiki a project reads from is the user's decision, not a default,
  and an ambiguous choice that resolves itself is the exact failure this step exists to remove.

**One caveat about the listing.** If the output ends with a parenthetical note that it was *"listed
from this machine's sign-ins"*, the list may be **incomplete** — a wiki joined recently will be
missing from it. Say so rather than concluding a wiki does not exist. That conclusion was the bug:
the CLI used to list its own login cache and present it as the universe, so a user who created a
second wiki in the web app came back here and was told, as a fact, that it wasn't there.

The note says **why** it fell back, and the three reasons have three different fixes — relay the one
the note names, never a generic "try later":

- **"no longer valid"** — the sign-ins themselves are dead (they left those wikis, or the device was
  revoked). `commonground login` is the fix, and waiting is not.
- **"could not be reached"** — offline or an outage. Waiting is the fix, and logging in again is not.
- **"cannot list your memberships"** — the server is older than this plugin. Neither waiting nor
  logging in changes it; the list works again when the server updates.

**If a wiki they expect is missing**, two different situations, and only one is a problem:

- **They just created it, or were just invited.** Being a member is all it takes now — one sign-in
  reaches every wiki you belong to, so it should appear as soon as the server can be reached. There
  is nothing to log into. If it still isn't listed, they aren't a member yet (an invite not accepted,
  or a wiki created under a different account).
- **They want a NEW wiki.** Wikis are created in the web app — **app.commongroundapp.io**, "+ New
  wiki". You cannot create one from here; say that plainly and point them there rather than looking
  for a command. Once it exists and they're a member, it is usable here immediately.

## 4. Choose a mode — and, for local, where the folder goes

Look at `$ARGUMENTS`:
- `local` → **local-clone mode**: also clone the wiki to a real folder on disk (plain markdown, so it
  opens in Obsidian or any editor; good for offline reading or hands-on curation).
- anything else (including empty) → **MCP mode** (default): reach the wiki live through the
  CommonGround MCP connector, no local files. Best for most coding projects.

If it's ambiguous and the user hasn't expressed a preference, offer the choice — with the
`AskUserQuestion` tool (multiple-choice UI) if it's available in this session, otherwise as a plain
question: **MCP mode (recommended)** / **Local clone** — defaulting to MCP.

**If they chose local, settle the folder in the same breath — one question, with a real default.**
The folder is named after the wiki (`~/CommonGround/<wiki-name>/`), so the default is already
sensible; the point is that the user gets told where their notes will live *before* a directory
appears, and can say otherwise. Ask it as a confirm-or-override, never as an open-ended "where?":

> *"I'll put your wiki at `~/CommonGround/acme-handbook/` — good, or would you rather it lived
> somewhere else (say, in your notes folder)?"*

- Accepting the default → run `init` with no `--path`.
- Naming a folder → pass it: `commonground init --mode local --path "<folder>" [wiki]`. It must be
  **empty or not exist yet**; the CLI refuses a folder with files in it and points at
  `commonground import` instead, which is the right tool for "I already have notes there".
- **Don't ask this in MCP mode** — there is no folder, and `--path` is rejected there.
- If the wiki is **already cloned**, `--path` is refused by design (it would strand the old folder,
  unpublished work and all). Moving an existing folder is `commonground relocate <folder> [wiki]`,
  which moves the files, remembers the new spot, and updates this project's `./CLAUDE.md`.
- An existing folder is **connected, not refreshed** — see step 5. Local mode is safe to pick for a
  user who already has a clone: nothing in it moves.

## 5. Point it

Run `commonground init --mode <mcp|local> [--path <folder>] <wiki>`, then `commonground use <wiki>`.

The first binds THIS project. It writes an idempotent CommonGround router block into this project's
`./CLAUDE.md` (it merges — it never clobbers the user's existing content) so Claude consults the wiki
before answering team questions. Local mode also clones the wiki, printing the folder it is creating
before it creates it — relay that path to the user, it's where their notes now live.

It also records this project's wiki in `./.claude/settings.json` (merged, never clobbered — their
own permissions and hooks are untouched), which is what makes the MCP connector answer **for this
project's wiki** rather than for whichever one it was authorised for. If the CLI reports it could
not write that file, say so: it means the file isn't valid JSON, it was left alone rather than
overwritten, and until they fix it the connector will keep answering for the wrong wiki here.

The second makes this wiki the one **unbound** folders resolve to — so the last place you pointed is
also the sensible default everywhere you haven't pointed anything. It is a side effect, not a second
decision: **mention it only when it's relevant** (they work in folders that aren't set up, or they
just asked what "active" means). Never make the user reason about two pointers to run one command.

**Relay the CLI's line about what gets committed — don't drop it as boilerplate.** Both files it
writes are normally tracked by git, so `CLAUDE.md`'s quoted charter brief and anti-scope, and the
wiki id in both, reach anyone who clones this repo. That is usually fine and occasionally not: a
charter's anti-scope is a statement of what the team does and does not keep, and in a public repo it
is on GitHub. Say it once, plainly, and move on — this is a heads-up, not a confirmation to collect.
Neither file gets a filesystem path and neither holds a secret; the sign-in lives elsewhere.

**If a wiki folder already exists, `init` leaves it exactly as it is.** It clones only when there is
nothing on disk yet; it will not fast-forward an existing folder onto the hosted version, and it will
not publish local commits — even for an admin. Instead it reports where the folder stands (ahead,
behind, diverged, or matching) and names the verb that would act. **Relay that standing to the user
and stop there.** Do not follow it with `commonground pull`, `push`, `sync` or `resolve` to "finish
the setup": someone pointing a project has not asked you to reconcile their work, and a folder that
is ahead of the server holds the only copy of whatever is in it. Reconciling is its own decision, made
later, by them — offer `/commonground:pull` or `/commonground:push` as a next step if it's relevant
and let them choose.

**Re-pointing an already-pointed project is the same command.** The block records the wiki it's bound
to, and a project that named its wiki always keeps it until this command says otherwise — which is
what stops an unrelated folder from silently retargeting work in a repo the user isn't looking at.
When the project was already pointed somewhere else, say what changed, from which wiki to which.

## 6. Confirm, then hand off (don't dead-end at an empty wiki)

Tell the user: the mode chosen, that `./CLAUDE.md` now routes to CommonGround, and the wiki. **For
MCP mode, tell them to restart the session** — the wiki this project is bound to is read at session
start, so until they do, the connector is still answering for whichever wiki it was authorised for.
Do not skip this because everything looks connected: that is exactly the state in which a wrong-wiki
answer is indistinguishable from a right one. For MCP
mode, mention that if the connector needs authentication — or if its tools stop appearing later,
which a plugin update can cause — they can run `/mcp` to (re)connect or restart the session; missing
tools are **usually** a connection problem, and `commonground pull [wiki]` still reads the wiki
without the connector. The exception worth knowing: if this project names a wiki they are not a
member of, every call fails identically and `/mcp` cannot fix it — that one needs an invite from
that wiki's admin, and `/commonground:status` is what tells the two apart.

Then check the wiki's state so you hand off to the right next step — call `get_awareness` (its
`pageCount`) or `get_coverage`:

- **Empty wiki (`pageCount === 0`) + the user can curate (admin/curator):** the wiki has no content
  yet — pointing at it isn't the finish line. Flow straight into seeding: explain that
  **`/commonground:seed`** starts by chartering the wiki (who it's for — a team or just them — what
  it should hold, and when their AI should consult it), then interviews them or imports an existing
  folder/vault, and offer to start it **now**. This is the point of the whole setup — don't stop at
  "try asking a question" when there's nothing to consult yet.
- **Populated wiki:** suggest they try asking a question the wiki covers — their team or product,
  or themselves for a personal wiki — to see retrieval work, and (admins/curators) point them at
  `/commonground:seed` to fill gaps, plus `/commonground:ingest` (capture anything) and
  `/commonground:lint` (health + gaps).

**This command never imports.** Loading an existing folder of markdown belongs to
`/commonground:seed`, which triages what to import, normalizes frontmatter, and reports coverage —
so point at it rather than reaching for `commonground import` here.

## 7. (Optional) Bridge claude.ai Chat too

This command owns Claude **Code**'s `./CLAUDE.md` router. If the user also uses **claude.ai Chat**
(or mobile), offer to print a copy-paste instruction that makes plain Chat reflexively consult the
same wiki — follow the `maintainer` skill's **bridge-to-Chat** procedure, which owns the variants and
how to fill them. Pure-Chat teammates who can't run this command have the whole setup at
**https://app.commongroundapp.io/connect** — a public page, so it works before they have an account.

**Roles (v1):** admins and curators ingest/curate; members are read-only (search + read). For a
member on an empty wiki, note that an admin or curator needs to run `/commonground:seed` first.

## Related

- **`/commonground:status`** — which wiki this project reads, which rule chose it, and its state.
- **`/commonground:seed`** — charter and fill the wiki (or import an existing folder).
