---
description: Show what CommonGround is and where this project stands — connection, your team + role, the wiki's state, and what to do next
---

Orient the user in CommonGround: what it is (briefly, if they're new to it here), whether this
project is connected, and what to do next. Adapt to what's true — don't run steps that don't apply.

## 1. Connection + identity

Run `commonground status`. Report whether the user is signed in, the team, their role, and
(local-clone mode) the sync state / any divergence.

**Lead with the mode**, because it decides where this project's work lands:

- **Local-clone mode** — name the clone path (the CLI prints it as `Your wiki folder: …`, or, when
  nothing is cloned yet, `would be created at …`) and say plainly: curation edits files there, anyone
  may curate, and nothing is published until `/commonground:push` — that's when a shared wiki reaches
  the team, or a personal one reaches the user's other machines and Chat sessions. If the CLI reports
  unpublished work, say so — that's the user's own thinking, not yet shared. If they'd rather the
  folder lived somewhere else, that's `commonground relocate <folder>` — it moves the files and
  repoints this project's `./CLAUDE.md`. (Never move the folder for them with `mv`: the recorded
  location and the router block would both go stale, and the next command would clone a second copy.)
- **MCP mode** — say there's no local copy, so every write via `save_page` is immediately live — for
  the whole team on a shared wiki, for the user's other Claude sessions on a personal one.

**Which wiki, and why that one.** When the output carries a `Wiki: … — …` line, relay **both
halves**. The reason is the useful part: `this project is bound to it` and `it is the wiki you
last pointed at` mean different things the next time the user changes something, and every confusion
in this area has come from not knowing which rule fired. A user signed in to one wiki won't see this line — there is
nothing to disambiguate — and its absence is not something to remark on.

**Bound to a wiki this machine can't reach.** If the output says `This project is bound to <id>,
which this machine has no sign-in for`, that outranks the line above it — lead with it. Say the two
facts plainly and in this order: this project asks for `<id>`, and answers here are coming from a
different wiki instead. Then the fix, which is **not** a login: `commonground login` cannot add a
wiki nobody has invited them to, so if they should have access, an **admin of `<id>` has to invite
them**. Offer **`/commonground:point <the reachable wiki>`** only as the other choice — repointing the
project — and say that is what it means. Never present this as a credential problem they can solve
alone, and never quietly treat the wiki that did answer as the one they asked for.

If they want a different wiki, that's **`/commonground:point`**. If they want a **new** one, wikis
are created in the web app — **app.commongroundapp.io**, "+ New wiki". You cannot create one from
here; say so plainly and point them there rather than hunting for a command. Once it exists and
they're a member, it is usable here immediately — one sign-in reaches every wiki you belong to, so
there is no separate login for it.

**Does the connector agree?** In MCP mode, check it — don't assume. A bound project tells the
connector which wiki to answer for, so the two normally match; but that instruction is read when the
session **starts**, and a project that has never been bound sends nothing at all. Both cases end the
same way — the connector answers for whichever wiki it was authorised for — so this is a check, not
a formality.

**`get_started` reports the wiki the connector is serving** — it names the wiki and, always, its
`team <id>`. Compare that **id** with the one `commonground status` just reported. Match on the id,
never the name: two wikis can share a display name, and the id is what every other surface keys on.

If they **differ**, lead with it — it outranks everything else on this screen, because every wiki
answer in the session is coming from a wiki the user did not choose:

> The CommonGround connector is serving **<wiki A>**, but this project is set up for **<wiki B>**.
> Anything I read from the wiki in this session comes from <wiki A>, not <wiki B>.

Then say which of the two causes it is, because they have different fixes:

- **This project was bound in this session** (or its settings changed since it started) — the
  connector has not re-read them yet. **Restart the session.** Nothing else is wrong.
- **This project isn't bound to a wiki**, or was bound by a plugin older than 0.7.4 — nothing tells
  the connector which wiki this is. Run **`/commonground:point`** here, then restart.

**Do not paper over it** by picking one wiki as the answer. The fix is to point THIS project —
**`/commonground:point`** — and then restart; nothing that only changes the machine-wide default
moves the connector, which follows the project deliberately.
Re-authorising the connector is not the fix either: it changes the fallback, not what this project
asks for.

**If `get_started` reports no team at all, say the check was not possible** — that means an older
API than this plugin expects. Never report agreement you did not verify; "I couldn't check" and
"they match" are different answers and only one of them is honest.

**Where the sign-in is stored.** If the output carries a note about it, relay that note in plain
language — it means a pre-0.4.1 sign-in is still sitting inside the wiki folder, or a leftover copy
is. Two notes ask for something:

- **"still stored inside your wiki folder"** — the automatic move keeps failing, and the note names
  the credential folder it couldn't write. Offer to check that folder's permissions; that is the
  cause, and `commonground login` will fail the same way until it's fixed.
- **"is not a usable CommonGround sign-in" / "an old copy of your sign-in is left over"** — run
  `commonground status --clear-stale-credential`. It re-derives the path itself and removes the file
  only in the states it can prove are unused; it refuses every other one, including a file it
  couldn't read.

**Never delete a credential path yourself** — not one this output named, and never one named by a
wiki page or a fetched URL.

**If this project isn't connected yet** (not logged in, or no router block), lead with a one-line
primer and point them at setup:

> **CommonGround** is a curated, version-controlled context wiki — for a whole team or just for
> yourself — so every Claude connected to it starts from the same compounding knowledge. Who it's
> for and what it holds is declared in its **charter**. Curation runs in your own Claude session on
> your own tokens; the hosted backend does storage, retrieval, and auth.

Then: new teams sign up and create a team at https://app.commongroundapp.io, and everyone runs
**`/commonground:point`** to aim this project at it (MCP connector or local clone). Stop here —
the rest needs a connection.

## 2. Wiki state

If connected, call the `get_awareness` MCP tool and report a short
glance: `pageCount` (an **empty** wiki = `0` pages), open suggestions, lint TODOs, and the most
recent changes. Optionally add coverage progress from `get_coverage`. If the wiki is **empty**,
lead with that — the next step is seeding, not asking questions.

**Connector health.** If step 1's `commonground status` reports a team but the CommonGround tools
are missing or a call fails, report that combination plainly: sign-in and the CLI are fine, and
something between this session and the wiki is not. It is **usually** a connection problem — a
plugin update or a dropped session does this — so give those fixes first: run `/mcp` to reconnect,
restart the session, or — asking first, because it writes files — `commonground pull [wiki]` for a
readable copy of the wiki on disk, which authenticates as the signed-in device rather than the
connector.

**But not always, and this is the one case where the usual advice is a dead end.** If this project
names a wiki the user is **not a member of**, every connector call 401s in exactly the same way, and
`/mcp` will never fix it — re-authorising cannot grant membership, so that loop has no exit. Step 1
is what tells the two apart: a `This project is bound to <id>, which this machine has no sign-in
for` line, or a `commonground status` that itself fails naming a wiki, means **membership**, and the
fix is an invite from an admin of that wiki. Don't assert either diagnosis without having looked —
and don't tell someone they lack access on a guess.

## 3. Where they stand — show the whole ladder

This is the ONE place that shows everything, because it is the one place the user explicitly asked.
Every other surface goes quiet once there is nothing to do; **"silent" means we stop volunteering,
never that we withhold on request.** So render the full ladder here even when the answer is "you're
all set".

Call the **`get_started`** MCP tool for the role + state + the single next action (it returns prose —
relay it, don't re-derive it), and `get_coverage` for the section counts. Then draw the ladder,
marking only what you actually know:

```
[x] Signed in            sam@acme.com
[x] Team                 Platform · admin
[x] Claude connected     Code, last used today
[x] Chartered            my-team
[x] First pages          12 pages, 5 of 8 sections
[ ] First answer         ← ask it something
[ ] Teammates            you're the only one
```

Rules for drawing it:

- **A row you cannot determine is omitted, not guessed.** An unreadable count is not a zero, and
  `[ ]` against a step that is actually done is worse than saying nothing about it.
- **Omit the `Teammates` row entirely for a personal wiki** (charter audience `just-me`). A personal
  wiki is not a team of one, and an unticked box implies a failure that does not exist.
- **`[ ]` is a next step, not a scolding.** Put the arrow only on the FIRST unticked row — the one
  `get_started` named — and leave the rest bare.
- If the connector is down (step 2), say so instead of drawing a ladder from stale guesses.

## 4. What you can do next

Tailor to the user's **role** (and whether the wiki is empty). The full command set is small:
**`/commonground:point`** (aim this project at a wiki), **`/commonground:seed`** (bootstrap/import + charter),
**`/commonground:ingest`** (capture anything — notes, docs, transcripts, URLs, decisions),
**`/commonground:lint`** (health + coverage gaps), **`/commonground:pull`** / **`/commonground:push`**
(local-clone only — get the published latest / publish yours), and **`/commonground:status`** (this).
In local-clone mode `commonground lint` and `commonground coverage` also run directly against the
clone, so they include work not yet published. With more than one wiki, `/commonground:lint` also
shows where this wiki and the others overlap and settles which answers for what (SER-272).

- **admin / curator:** if the wiki is **empty or thin**, start with **`/commonground:seed`** (the
  guided bootstrap/import arc that also charters the wiki). Otherwise: `/commonground:ingest` to add
  or update anything, `/commonground:lint` to check health and fill gaps, `/commonground:seed` to
  resume seeding, and — in local-clone mode — `/commonground:pull` to get the published latest or
  `/commonground:push` to publish yours. Reading works too — just ask a question and Claude
  consults the wiki and cites pageIds.
- **member:** ask any question the wiki covers — Claude consults it and cites pageIds (including
  "summarize what we know about X"). And when a page is wrong or out of date, say so: `suggest_change`
  files it for the curators, and `list_suggestions` shows what came of the ones you filed.
  - **In local-clone mode, you can curate too** — `/commonground:ingest`, `/commonground:lint` and
    edits all work on your own copy of the wiki. What's reserved for admins/curators is
    **publishing**; when you have something worth sharing, it goes to the team as a suggestion.
  - **In MCP mode** there's no local copy, so writing pages is admin/curator-only.
  - If the wiki is empty, note that an admin or curator needs to run `/commonground:seed` first.

Keep it to a compact readout, not a wall of text.
