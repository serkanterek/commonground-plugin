---
description: Connect this project to your CommonGround wiki (sign in, then MCP or local-clone mode)
argument-hint: "[mcp|local]"
---

Connect the current project to CommonGround so this session can consult the wiki. Work through
these steps conversationally, adapting to what's already true — don't blindly run everything.

The bundled `commonground` CLI talks to the hosted API by default (no env setup needed).

## 1. Check sign-in state

Run `commonground status`.
- If it reports a team with a sync state, the user is already signed in — note the team and go to step 3.
- If it reports "not logged in" / "no team logged in", continue to step 2.

## 2. Sign in (device-code login)

The user needs a CommonGround account on a team first.
- **No account/team yet?** Point them to https://app.commongroundapp.io/sign-up to create an account
  and a team. (Admins invite teammates there; a member can instead accept an invite link.)
- Then sign the device in. Use the **split** form, not the one-shot `commonground login`: the
  one-shot blocks until the grant expires (~10 minutes), which is far longer than a tool call gets,
  so it is killed and looks like a failure when it was only waiting.

  1. `commonground login --start` — prints the URL and the code, then exits.
  2. Relay both to the user: *"Open app.commongroundapp.io/activate and enter ABCD-2345. Tell me
     when you've approved it."*
  3. `commonground login --wait` — polls for about 90 seconds. If it reports **still waiting**, that
     is not an error: the user hasn't clicked Approve yet. Just run it again.

  On success it prints the team and role.

## 3. (Optional) Load existing markdown from the computer

If the user already has a folder of markdown notes or docs and wants to seed a *fresh* team from it,
you can import it — but the guided **`/commonground:seed`**
flow (offered in step 6 below) does this better: it triages what to import, normalizes
frontmatter, and reports coverage. So prefer to just
mention it here and let step 6 drive. (For a direct import now, `commonground import <folder>` overlays
and normalizes the folder onto the hosted wiki — admins/curators, confirm the path first.) After an
import the wiki lives in the wiki folder, and **that clone — not the folder you imported —
is the copy CommonGround keeps in sync**: the imported folder is left untouched, so anything edited
there afterwards needs another import to reach the wiki. Skip a manual import for an
already-populated team or a from-scratch start.

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

## 5. Initialize

**First, if the user has more than one wiki**, pick one before running anything. A first-time `init`
is the one moment the project cannot answer for itself — it has no router block yet, so there is no
marker to read. If they have chosen an **active wiki**, `init` uses it; otherwise it **fails** with
`more than one wiki available — say which: …`, which lists the ids. Either way, ask which wiki this
project belongs to — with the `AskUserQuestion` tool if it's available, otherwise as a plain
question — and pass it explicitly. Don't guess, and don't let the error reach the user as a crash:
which wiki a project reads from is their decision, not a default. `commonground use` lists their
wikis by name if you need to show the options.

Only a *first* init needs this. `init --refresh`, and every other verb in an already-initialized
project, reads the wiki out of the block that's already there — and that block always outranks the
active wiki, so binding a project is what makes it stop moving.

Run `commonground init --mode <mcp|local> [--path <folder>] [wiki]`. This writes an idempotent
CommonGround router block
into this project's `./CLAUDE.md` (it merges — it never clobbers the user's existing content) so Claude
consults the wiki before answering team questions. Local mode also clones the wiki, printing the
folder it is creating before it creates it — relay that path to the user, it's where their notes now live.

The block records the team it's bound to, which is also what lets a multi-team machine resolve *this*
project's wiki in later sessions — so a project initialized this way keeps working without re-asking.

## 6. Confirm, then seed (don't dead-end at an empty wiki)

Tell the user: the mode chosen, that `./CLAUDE.md` now routes to CommonGround, and the team. For MCP
mode, mention that if the connector needs authentication — or if its tools stop appearing later,
which a plugin update can cause — they can run `/mcp` to (re)connect or restart the session; missing
tools are a connection problem, not a permissions one, and `commonground pull [wiki]` still reads
the wiki without the connector.

Then check the wiki's state so you hand off to the right next step — call `get_awareness` (its
`pageCount`) or `get_coverage`:

- **Empty wiki (`pageCount === 0`) + the user can curate (admin/curator):** the wiki has no content
  yet — connecting isn't the finish line. Flow straight into seeding: explain that
  **`/commonground:seed`** starts by chartering the wiki (who it's for — a team or just them — what
  it should hold, and when their AI should consult it), then interviews them or imports an existing
  folder/vault, and offer to start it **now**. This is the point of the whole setup — don't stop at
  "try asking a question" when there's nothing to consult yet.
- **Populated wiki:** suggest they try asking a question the wiki covers — their team or product,
  or themselves for a personal wiki — to see retrieval work, and (admins/curators) point them at
  `/commonground:seed` to fill gaps, plus `/commonground:ingest` (capture anything) and
  `/commonground:lint` (health + gaps).

## 7. (Optional) Bridge claude.ai Chat too

This command owns Claude **Code**'s `./CLAUDE.md` router. If the user also uses **claude.ai Chat**
(or mobile), offer to print a copy-paste instruction that makes plain Chat reflexively consult the
same wiki — they paste it into **Settings → Profile preferences** (every chat) or a **Project's
custom instructions**. It's a different surface, so it's genuinely additive.

Follow the `maintainer` skill's **bridge-to-Chat** procedure: if a charter exists, read it
(`get_page` `company/wiki-charter`, or `get_coverage` for just the audience) and print the variant
matching its audience, filled from the retrieval brief + pinned keywords; if there's no charter yet,
don't guess — ask whether this wiki is just for them or for a team, print the matching variant, and
mention `/commonground:seed` will let you charter (and tailor) it properly later.
Print it in a fenced `text` block and tell them it's their instruction to edit freely. Pure-Chat
teammates who can't run this command have the whole setup at
**https://app.commongroundapp.io/connect** — a public page, so it works before they have an account.
(It used to point at `docs/connector-setup.md`, which lives in a private repo they cannot open.)

**Roles (v1):** admins and curators ingest/curate; members are read-only (search + read). For a
member on an empty wiki, note that an admin or curator needs to run `/commonground:seed` first.
