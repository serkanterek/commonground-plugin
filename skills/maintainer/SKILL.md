---
name: maintainer
description: Read from and curate a CommonGround wiki — a curated, version-controlled knowledge base for a team or a single user. Use when the user wants to answer from their CommonGround context (team, product, or personal), seed a new wiki, ingest anything into it (notes, docs, transcripts, URLs, decisions), check its health, or bridge it into claude.ai Chat. Produces schema-correct markdown pages; runs entirely in the user's own Claude session on their own tokens (CommonGround spends none).
user-invocable: false
---

# CommonGround Maintainer (Model A)

CommonGround is a curated, version-controlled **context wiki** — a team's shared base, or a
single user's personal one — so every LLM connected to it starts from the same compounding
context. Who it's for is declared in its **charter** (the `company/wiki-charter` page, written
during `/commonground:seed`): audience (`just-me` / `my-team` / `whole-company`), the wiki's own
structure checklist, and a retrieval brief. When a charter exists, honor it.

The hosted repo is **what the team shares**. A project with a local clone has a **working copy**,
and `/commonground:push` is how work in it becomes the team's — the same relationship a checkout has
to a shared branch. The hosted copy is not "the real one" that a clone lags behind: where there IS a
clone, the clone is where the user's current thinking lives, and it is the one that is ahead.

Everything below runs **in this session, on the user's tokens** — CommonGround runs no LLM for
curation (Model A). You produce plain markdown; the wiki is persisted either by editing the clone
(local-clone mode) or by CommonGround's MCP write tools (MCP mode).

## Step 0 — which mode is this project in? (do this before any write)

The two modes persist work in completely different places, so **never guess, and never infer it from
which tools happen to be available.** The CommonGround MCP tools are registered per *user*, so in a
local-clone project the write tools are sitting right there and are the wrong path. Determine it:

1. The **SessionStart hook states it** at the top of the session ("this project is in CommonGround
   LOCAL-CLONE mode / MCP mode"). That is authoritative — use it.
2. Otherwise read this project's `./CLAUDE.md` router block: it carries an explicit
   `<!-- commonground:mode:local -->` or `<!-- commonground:mode:mcp -->` marker.
3. Otherwise run `commonground status`, which reports the project's mode.

**Local-clone mode — your copy first.** Every write is a FILE in the clone. Do **not** call
`save_page`, `stage_sources` or `save_charter`: they commit straight to the team's hosted wiki,
skipping the user's review and the publish step. Read from the clone too — it reflects unpushed work
the hosted wiki does not have. Nothing reaches the team until `/commonground:push`.

**MCP mode — straight to the team.** There is no local copy: `save_page` / `stage_sources` are live
for everyone the moment they land. Say so and get an explicit yes before each write.

**Roles.** In **local-clone mode, curating needs no particular role** — it is the user's own working
copy, and members edit it as freely as admins. Only **publishing** is admin/curator; `push` reports
that rather than failing, and a member's local work then travels via `suggest_change`. In **MCP
mode** the gate is on the write itself: a member's `tools/list` simply carries no write tools, so
help them read, answer, and file `suggest_change`.

## The two surfaces

- **Read/answer** — search the wiki and answer with citations. In MCP mode use the CommonGround
  MCP tools (`search`, `get_page`, `get_index`). In local-clone mode start at `index.md` and open
  only the pages you need. Never assert a team fact a page doesn't back.
- **Curate** — run the procedures below. Persist by editing the clone (local) or via the MCP write
  tools (MCP). The server re-validates frontmatter on write — that's the backstop, not a substitute
  for getting it right here.
- **What genuinely stays server-side, even in local-clone mode:** the **suggestions queue**
  (`list_suggestions` / `suggest_change` / `resolve_suggestion`). It can't live in git — it carries
  messages from people who have no write access to the repo. Everything else a local project needs
  is on disk: `commonground lint` and `commonground coverage` run against the working copy, so they
  see unpublished work that the server's `lint` / `get_coverage` cannot.
- **If the connector goes quiet** (MCP mode) — missing or failing CommonGround tools are a
  **connection** problem, never a role one: a member still sees `search` / `get_page` / `get_index`,
  so if *those* are gone too the connector was dropped (a plugin update does this mid-session).
  Never tell the user they lack permissions. Say what happened, suggest `/mcp` to reconnect or a
  session restart, and offer `commonground pull [team]` as a read-only fallback — it authenticates
  as the signed-in device rather than through the connector. Ask before running it: it writes the
  wiki to disk in a project that chose not to have local files.

The curation procedures are also exposed as slash commands — **`/commonground:seed`**,
**`/commonground:ingest`**, and **`/commonground:lint`** — for direct invocation.

## The wiki in one screen

**Layout** (repo root of the clone):
- `index.md` — generated catalog (one line per active page). **Machine-owned — never write it by
  hand.** It is rebuilt from the pages themselves; you shape it by writing each page's `summary:`.
- `log.md` — append-only history. Never rewrite prior lines.
- `sources/` — raw inputs, **immutable**. Once a source file exists, never edit or delete it.
- `company/`, `departments/<dept>/`, `teams/<team>/`, `products/<product>/` — pages by scope
  (products may have `dev/` and `pm/` subsections).

A **pageId** is the repo-relative path without `.md` (e.g. `products/acme/dev/retrieval-decision`).

**Page types:** `entity` · `concept` · `decision` (ADR-style) · `summary` · `template` ·
`charter` (the wiki's one meta page, `company/wiki-charter`).

**Frontmatter** (YAML at the top of every page). Required: `title`, `type`, `scope`, `updated`.
Optional: **`summary`** (the page's catalog line — see below; write one on every page you touch),
`section` (`dev`|`pm`), `owner`, `status` (`active`|`hypothetical`|`deprecated`, default
`active`), `created` (`YYYY-MM-DD`), `aliases` (other names this page answers to), `tags`,
`sources` (paths under `sources/`), `related` (pageIds).

Any **other** key a page already carries (an imported vault's own `cssclass:`, `publish:`, …) is
preserved verbatim — don't strip it, and don't invent new ones either. What is NOT allowed is a
near-miss of a contract key (`Tags`, `up-dated`): the server rejects those rather than guess.

```markdown
---
title: Retrieval Architecture
summary: Hosted git repo per team as the source of truth; local clone + optional hosted MCP as the two read surfaces.
type: decision
scope: product:acme
section: dev
status: active
updated: 2026-07-01
sources:
  - sources/architecture-notes.md
related:
  - products/acme/dev/tech-stack
---

The decision, its context, and the rationale go here.
```

`scope` is one of `company` · `department:<x>` · `team:<x>` · `product:<x>`. `updated` is
`YYYY-MM-DD` (today). For a **just-me** wiki, `company` is simply the wiki root — present it as
"personal" when talking to the user; the stored value stays `company`.

## Golden rules

1. **Schema-correct or not at all.** Every page has valid frontmatter (above). If unsure of a
   value, ask — don't guess.
2. **Cite your sources.** A page built from a raw input lists that input under `sources:`; the
   file lives immutably in `sources/`.
3. **Write the page's `summary:`; append to `log.md`.** Every page you create or edit carries a
   `summary:` (format below) — that is how the catalog gets its line. The catalog file itself is
   regenerated for you; append the `log.md` line (format below) in the SAME change.
4. **`sources/` is append-only.** Never modify or remove a file under `sources/`.
5. **Never invent facts.** Only write what the source, the interview, or the user actually says.
6. **Finish by persisting.** In local-clone mode that means writing the files — then publishing with
   `/commonground:push`, which commits for the user, so never ask them to run git or say the word
   "commit". Publishing needs an admin/curator role; a member's edits stay in their clone as real
   work, and `suggest_change` is how they reach the team. In MCP mode, persist via the write tools.
7. **The wiki belongs to its audience.** Read the charter (`company/wiki-charter`) when present.
   **just-me** → nothing is off-topic or "too personal"; personal and subjective material is
   in-scope by definition — never suggest removing content for shareability. **my-team /
   whole-company** → a sensitivity concern is **flag-and-ask**, never an auto-remove and never a
   repeated nag. What belongs in the wiki is the audience's call, not yours.

### `company/conventions` — the user's own working rules

If the wiki has a `company/conventions` page, **read it before curating** and treat what it says as
load-bearing: it holds process preferences the user has stated explicitly ("one source per ingest,
with discussion — not batch-ingest"), which the procedures below otherwise assume. Where it and a
default here disagree, the page wins; change it only with the user's sign-off. If it doesn't exist,
nothing changes — and when the user states a durable working preference, offer to write it there.

### `summary:` — the page's catalog line

The one line that represents this page everywhere: it is what `get_index` returns and what
`index.md` shows, and it is the text a search query is matched against. Write one on every page
you touch.

- **One plain-text line, ≤140 characters.** No markdown emphasis, no `[[wikilinks]]` — it is
  rendered as data, not prose.
- **Name the concrete things.** The nouns someone would actually search for: products, people,
  systems, decisions, dates. `LoL, WoW, Path of Exile, Diablo-likes` beats `A hobby with several
  distinct strands`.
- **Say when to read the page** if the title doesn't already make it obvious ("Load before drafting
  anything in the user's voice").
- **Never provenance.** "Stated by X on 2026-05-23", "Canonical page for…", "An ADR for…" describe
  the page instead of its content, and match nothing.

Omit it and the catalog falls back to the page's first body line — a working default, not a good
one. `index.md` itself is **generated**: rebuilt from the pages on every write, grouped and sorted
for you, with deprecated and hypothetical pages omitted. Never hand-write or hand-edit that file.

### `log.md` format

Append-only. One line per change, newest at the bottom, never rewriting earlier lines:

```
## [YYYY-MM-DD] <op> | <title>
```

`<op>` is `ingest`, `edit`, or `lint` (use the one that fits the change).

---

## Seed — first-run guided interview

Bootstrap an empty (or thin) wiki with the durable context its LLMs should always start from.
Exposed as **`/commonground:seed`** — the guided arc that first **charters** the wiki (audience,
structure, retrieval brief → the `company/wiki-charter` page), forks to **importing** an existing
folder/vault (triaged per cluster), and finishes on the gap-loop over the charter's checklist;
this section is the **from-scratch interview** at its core. The questions are **discipline-aware**
and come from `seeding.md` **in this skill's folder** — the same set the in-app seeding uses (one
source of truth, kept in lockstep by a drift guard). Never edit `seeding.md` itself.

1. Read `seeding.md` beside this file, and pick the right bank:
   - **Charter audience `just-me`** → use the **`## Audience: just-me`** section, not a discipline
     one. A personal wiki is not a team of one; opening by asking a solo user for their team's
     mission and a shared glossary is the fastest way to feel misunderstood.
   - **Otherwise** → use the caller's **discipline**, read from `get_coverage`'s `callerDiscipline`
     (don't re-ask if it's set); only ask (pm / dev / design / qa / exec / other) when it's unknown.
2. Ask its questions, one at a time, conversationally. Skip any the user can't answer yet.
   `get_coverage` is charter-aware — its rows are the charter's Structure list when one exists
   (the shape template otherwise), and the charter page itself never counts; each saved page
   ticks a section from empty → done.
3. For each answered question, draft the page it names (pageId, title, type, scope from the guide)
   with the user's answer as the body and valid frontmatter (`updated` = today). **Show it and
   persist only on confirm** — never auto-write or invent facts.
4. Append one `log.md` line (`ingest | Guided seeding (<discipline>)`). The catalog rebuilds itself
   from the pages' `summary:` lines.
5. Persist (`/commonground:push` in local-clone mode — it commits for them — or the MCP write tools).

## Ingest — turn anything into pages (`/commonground:ingest`)

The single capture verb: notes, a pasted transcript, a doc or URL, a decision, or a thought the
user just says out loud. Work like an assistant taking notes — conversational, one thing at a time,
looping "anything else?" until they're done — then organize and persist.

1. **Get each source's content.** Spoken/pasted text → use directly. A file path → read it. A URL →
   fetch it yourself (your web-fetch tool) and use the readable main content — never stage a bare
   link. A **login-walled doc** (Google Drive/Docs, Figma, Notion, Confluence…) → first try a
   **connector available in this session** (e.g. a connected Google Drive MCP) to pull it directly;
   only if none can reach it, ask the user to export it (PDF / Markdown) and drop that in.
2. **Store the raw source (immutable)** — local-clone: write it under `sources/<slug>.md` in the
   clone. MCP: `stage_sources`. Never overwrite an existing source; pick a new name. A pure
   spoken/typed thought with no artifact needs no source file — the page is the record.
3. **Detect the shape and draft.** Identify the durable takeaways. Prefer **updating** an existing
   catalog page over creating a near-duplicate (check the clone's `index.md`, or `get_index` in MCP
   mode — in local-clone mode read the file, since it includes pages not yet published). Write/update
   schema-correct pages, each citing any stored source under `sources:` and capturing durable
   cross-references in `related:` (inline `[[wikilinks]]` / `[text](pageId)` in the body count too,
   but are never required).
   - **A decision** ("we decided…", an ADR) → a `type: decision` page in the ADR shape:
     context/problem → the decision → options considered → rationale → consequences, with `related:`
     to the pages it affects. Ask only for the missing parts; never invent an outcome.
4. **Show each page and persist only on confirm.** Append a `log.md` line
   (`ingest | <source title>`, or `edit | <decision title>` for a decision).
5. Persist and report a short change summary (pages added/updated). For a new decision, offer to
   link it from the pages it affects.

## Lint — health + gaps (`/commonground:lint`)

Detection only — report findings and let the user decide; never rewrite pages silently. Two halves:
what's **wrong** with existing pages, and what's **missing** vs the charter's structure.

**Which tool to run.** In **local-clone mode** use `commonground lint` and `commonground coverage`:
they read the working copy, so they see the pages the user has drafted and not yet published — the
server's `lint` / `get_coverage` describe the *published* wiki and would report gaps the user has
already filled. In **MCP mode** use the `lint` and `get_coverage` tools. Either way the findings are
the same kinds:

**Hygiene** (deterministic):
- **Stale** — an `active` page whose `updated` is old (say > 6 months).
- **Orphan** — an `active` page no other page links to — by a `related:` entry **or** an inline
  body link (`[[wikilink]]` / `[text](pageId)`). (Never report `company/wiki-charter` as an orphan
  — the charter is meta and rarely linked.)
- **Broken citation** — a `sources:` **path** with no matching file under `sources/` (a `sources:`
  URL is always valid), or a `related:` entry pointing to a pageId that doesn't exist. A dangling
  inline `[[wikilink]]` is a demand signal, not a broken citation.
- **Thin summary** — active pages with no authored `summary:` (or one that is just a copy of the
  first body line, or pure provenance). Arrives as ONE batched finding for the whole wiki, naming a
  sample and a count — report it as one line, and offer a backfill pass rather than a page-by-page
  to-do list.
- **`missingLinks`** — "red links": body links to a page that doesn't exist yet (with the pages
  referencing each). Surface as "referenced but not written yet" — ready candidates to ingest next.

**Coverage gaps** (the `get_coverage` tool, charter-aware): the empty/partial sections of the
charter's Structure list (or the org-shape template if the wiki isn't chartered yet), each with its
intent (`prompt`) and the pages it already has.

**Optional judgement checks** (your reasoning, over pages you've read): **contradiction** (two pages
conflicting) and **missing cross-reference** (two clearly related pages that don't link).

Produce a short report — hygiene, then gaps, then red links. Apply fixes / fill gaps only with the
user's go-ahead: in local-clone mode anyone may, since it's their own copy (publishing is the gated
step); in MCP mode it takes an admin/curator. Filling a gap is the ingest flow, gap-driven. Then
append `log.md`, and persist.

## Summarize a topic or scope (when asked)

Reading and summarizing is available to everyone; there's no separate command — a plain question
already makes Claude consult the wiki and cite. When the user wants a written synthesis:

1. Scope it (a `company` / `department:<x>` / `team:<x>` / `product:<x>` scope, or a free-text
   topic). Gather grounded material: `get_index` (optionally scoped), then `search` / `get_page`.
   **Never assert a fact no page backs**; flag what the wiki is silent on rather than filling it in.
2. Write the summary in-session, **citing the pageIds** each point draws on.
3. **(Optional) Save it** — only if the user wants it persisted: a `type: summary` page
   (schema-correct, `related:` to the pages it draws on), written as a file in the clone (local) or
   via `save_page` (MCP, admins/curators). Otherwise just present it in chat.

## Bridge to claude.ai Chat (when asked)

Offered at the end of `/commonground:initialize` and `/commonground:seed`: print a copy-paste
instruction that makes plain **claude.ai Chat** reflexively consult the wiki (a different surface
from Claude Code's `CLAUDE.md` router). The user pastes it into **Settings → Profile preferences**
(every chat) or a **Project's custom instructions**.

1. **Read the charter to tailor it.** `get_page` `company/wiki-charter` (or `get_coverage` for just
   the `audience`); local-clone → read `company/wiki-charter.md`. No charter yet → print the **Team**
   variant and suggest `/commonground:seed` to tailor later.
2. **Pick the variant** by audience: `just-me` → Personal, `my-team` → Team, `whole-company` →
   Company.
3. **Fill and print.** Whitespace-flatten the retrieval brief (trim to ~400 chars) and take ≤12
   pinned keywords; interpolate and print in a fenced `text` block. Tell the user where to paste it
   and that they can edit the wording freely.

**Personal (`just-me`):**

> I have CommonGround connected to this chat as an MCP connector — it's my curated personal knowledge
> base: who I am, how I work and write, my projects, tools, decisions, preferences, and my own writing
> voice. When a question is about me, my work, my writing or voice, or anything I've documented,
> consult CommonGround first (its `search` / `get_page` tools) and cite the pages you used, rather than
> guessing. Don't reach for Google Drive or the web to answer questions about me or my work —
> CommonGround is the source for that; fall back to general knowledge only when it returns nothing
> relevant.

**Team (`my-team`):**

> My team uses CommonGround as our shared source of truth, connected to this chat as an MCP connector
> — it holds our curated context: team decisions, product and domain specifics, entities, and
> conventions. When a question touches our team, our product, or anything we've decided or documented,
> consult CommonGround first (its `search` / `get_page` tools) and cite the pages you used, rather than
> guessing. Don't fall back to Google Drive or the web for our internal context — CommonGround is where
> our curated answers live; use those only when it returns nothing relevant.

**Company (`whole-company`):**

> My company uses CommonGround as our organization-wide source of truth, connected to this chat as an
> MCP connector — it holds our curated company context across teams: decisions, policies, org
> structure, and cross-team products and entities. When a question touches anything company-wide or
> internal, consult CommonGround first (its `search` / `get_page` tools) and cite the pages you used,
> rather than guessing. Don't reach for Google Drive or the open web for our internal, company-specific
> context — CommonGround is the canonical source for it; use those only when it returns nothing
> relevant.

After the base snippet, when the charter has them, append: one line
`The charter says when to consult it: "<retrieval brief>".` (if a brief exists), and one line
`Consult it first for topics like: <pinned keywords>.` (if any are pinned).
