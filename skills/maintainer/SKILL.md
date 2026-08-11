---
name: maintainer
description: Read from and curate a CommonGround wiki — a curated, version-controlled knowledge base for a team or a single user. Use when the user wants to answer from their CommonGround context (team, product, or personal), seed a new wiki, ingest anything into it (notes, docs, transcripts, URLs, decisions), check its health, or bridge it into claude.ai Chat. Produces schema-correct markdown pages; runs entirely in the user's own Claude session on their own tokens (CommonGround spends none).
user-invocable: false
---

# CommonGround Maintainer (Model A)

CommonGround is a curated, version-controlled **context wiki** — a team's shared base, or a
single user's personal one — so every LLM connected to it starts from the same compounding
context. Who it's for is declared in its **charter** (the `wiki-charter` page, written
during `/commonground:seed`): audience (`just-me` / `my-team` / `whole-company`), the wiki's own
structure checklist, and a retrieval brief. When a charter exists, honor it.

The hosted repo is **what gets shared** — with the team on a shared wiki, or with every other Claude
session the user has on a personal one. A project with a local clone has a **working copy**, and
`/commonground:push` is how work in it becomes that shared copy — the same relationship a checkout
has to a shared branch. The hosted copy is not "the real one" that a clone lags behind: where there
IS a clone, the clone is where the user's current thinking lives, and it is the one that is ahead.

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
`save_page`, `stage_sources` or `save_charter`: they commit straight to the hosted wiki, skipping the
user's review and the publish step. Read from the clone too — it reflects unpushed work the hosted
wiki does not have. Nothing is published until `/commonground:push` — that's when a shared wiki
reaches the team, or a personal one reaches the user's other machines and Chat sessions.

**MCP mode — straight to the hosted wiki.** There is no local copy: `save_page` / `stage_sources` go
live the moment they land — for the whole team on a shared wiki, for every Claude the user has
connected on a personal one. Say so and get an explicit yes before each write.

**Neither mode makes writing off-limits.** Both rules above answer *where a write lands*, not
*whether it may happen*. Read cold in a project you were working in for some other reason, they
compose into "this project shouldn't write to the wiki" — and the failure that produces is a model
arguing with someone who just asked it to capture something. The default is that you don't volunteer
wiki edits; the moment the user asks to ingest, record, correct or seed, that is an ordinary request.
Say what you're about to write, get a yes, then write it — as files in local-clone mode, through the
write tools in MCP mode. Never tell the user this project shouldn't write to the wiki.

**Roles.** In **local-clone mode, curating needs no particular role** — it is the user's own working
copy, and members edit it as freely as admins. Only **publishing** is admin/curator; `push` reports
that rather than failing, and a member's local work then travels via `suggest_change`. In **MCP
mode** the gate is on the write itself: a member's `tools/list` simply carries no write tools, so
help them read, answer, and file `suggest_change`.

## The two surfaces

- **Read/answer** — search the wiki and answer with citations. In MCP mode use the CommonGround
  MCP tools (`search`, `get_page`, `get_index`). In local-clone mode start at `index.md` and open
  only the pages you need. Never assert a fact a page doesn't back.
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
- `log.md` — **retired; never write it.** The wiki's history is its git history, where every change
  is joined to the diff that made it. Say what you did in the commit message instead (see *Recording
  what you did* below). A wiki created before the change still has this file: leave it exactly as it
  is — it is the only copy of that history, and nothing appends to it any more.
- `sources/` — raw inputs, **immutable**. Once a source file exists, never edit or delete it.
- **everything else is just where the files sit.** Folders exist because pages were written into
  them (`people/`, `decisions/`, `products/acme/dev/`); they carry no meaning and group nothing.
  The wiki's structure is its **categories** — a page's `tags:`, drawn from the charter's
  `## Structure` list (see below). There is no prescribed tree and no required top-level folder, and
  reorganising a wiki means **retagging**, never moving files (a move breaks every link into them).

A **pageId** is the repo-relative path without `.md` (e.g. `products/acme/dev/retrieval-decision`).

The wiki's one meta page is the **charter**, `wiki-charter` at the repo root (older wikis have it
at `company/wiki-charter`; both are read).

**Frontmatter** (YAML at the top of every page). Required: `title`, `updated`.
Optional: **`summary`** (the page's catalog line — see below; write one on every page you touch),
`scope` (see below — omit it unless this wiki partitions a real org), `section` (`dev`|`pm`), `owner`, `status` (`active`|`hypothetical`|`deprecated`, default
`active`), `created` (`YYYY-MM-DD`), `aliases` (other names this page answers to — a `[[Ece]]` in
any page's body resolves to a page titled "Ece Yagman" that lists it, and a search for the short
name finds it; write them when a page is habitually called something shorter or other than its title),
**`tags`** (the page's categories — see below; write them on every page you touch),
`sources` (paths under `sources/` — only when the page actually cites a stored source).

There is **no `type:` field and no `related:` field to write**. A page's genre is already implied
by the category it declares in `tags:`, so a separate type only ever restated it. And
cross-references belong in the PROSE, as `[[wikilinks]]` or `[text](pageId)` — that is the only
link channel there is, so a page nothing links to from another page's body is an orphan, and a
frontmatter list of pageIds counts for nothing. An older page may still carry either key — they are
just keys CommonGround doesn't own now (next paragraph), so leave them: don't add one, don't strip
one. If you see such a line move to the bottom of a page's frontmatter, that is the server
re-emitting it with the other keys it doesn't own. Expected; don't put it back.

Any **other** key a page already carries (an imported vault's own `cssclass:`, `publish:`, …) is
preserved verbatim — don't strip it, and don't invent new ones either. What is NOT allowed is a
near-miss of a contract key (`Tags`, `up-dated`): the server rejects those rather than guess.

```markdown
---
title: Retrieval Architecture
summary: Hosted git repo per team as the source of truth; local clone + optional hosted MCP as the two read surfaces.
section: dev
status: active
updated: 2026-07-01
tags:
  - decisions
sources:
  - sources/architecture-notes.md
---

The decision, its context, and the rationale go here — linking to
[[products/acme/dev/tech-stack]] and any other page it builds on, in the prose where it belongs.
```

`updated` is `YYYY-MM-DD` (today). **`scope` is optional and usually omitted** — leave it out and
the page belongs to the whole wiki. Set it (`company` · `department:<x>` · `team:<x>` ·
`product:<x>`) only when this wiki already uses scopes to partition a real org. Never put one on a
personal wiki: there is nothing to partition, and `company` on somebody's own notes is a wrong word.

## Golden rules

1. **Schema-correct or not at all.** Every page has valid frontmatter (above). If unsure of a
   value, ask — don't guess.
2. **Cite your sources.** A page built from a raw input lists that input under `sources:`; the
   file lives immutably in `sources/`.
3. **Write the page's `summary:`, and say why you changed it.** Every page you create or edit carries
   a `summary:` (format below) — that is how the catalog gets its line, and the catalog file itself is
   regenerated for you. Then record the change: in **MCP mode** pass `message` to `save_page`; in
   **local-clone mode** pass `--message` to `/commonground:push`. See *Recording what you did* below —
   the two are different altitudes, not the same sentence.
4. **`sources/` is append-only.** Never modify or remove a file under `sources/`.
5. **Never invent facts.** Only write what the source, the interview, or the user actually says.
6. **Finish by persisting.** In local-clone mode that means writing the files — then publishing with
   `/commonground:push`, which commits for the user, so never ask them to run git or say the word
   "commit". Publishing needs an admin/curator role; a member's edits stay in their clone as real
   work, and `suggest_change` is how they reach the team. In MCP mode, persist via the write tools.
7. **The wiki belongs to its audience.** Read the charter (`wiki-charter`, or `company/wiki-charter` on an older wiki) when present.
   **just-me** → nothing is off-topic or "too personal"; personal and subjective material is
   in-scope by definition — never suggest removing content for shareability. **my-team /
   whole-company** → a sensitivity concern is **flag-and-ask**, never an auto-remove and never a
   repeated nag. What belongs in the wiki is the audience's call, not yours.

### `conventions` — the user's own working rules

If the wiki has a `conventions` page, **read it before curating** and treat what it says as
load-bearing: it holds process preferences the user has stated explicitly ("one source per ingest,
with discussion — not batch-ingest"), which the procedures below otherwise assume. Where it and a
default here disagree, the page wins; change it only with the user's sign-off. If it doesn't exist,
nothing changes — and when the user states a durable working preference, offer to write it there.

### `summary:` — the page's catalog line

The one line that represents this page everywhere: it is what `get_index` returns and what
`index.md` shows, and it is the text a search query is matched against. **The title is the page's
name; the summary is what is inside it.** Read together they should partition the information, not
restate each other. Write one on every page you touch.

- **Never restate the title.** A summary that re-says its title gives a reader no new basis to
  choose the page. `Lightbug — fantasy novel (on hold, wants to resume)` with the summary `Fantasy
  novel on hold, wants to resume` is one fact written twice. Title `Lightbug` + summary `Fantasy
  novel, 3 POV chapters drafted, magic system unresolved, paused Nov 2025` routes better *and* is
  shorter. If the title already carries detail, the summary goes past it — it never echoes it.
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

### `tags:` — the page's categories

**`tags` are this wiki's one structural axis.** They are not free-form labels, not keywords, and
not a folksonomy: a page's tags are the sections of the wiki it belongs to, and they are what
groups it in `index.md` / `get_index` and what satisfies a charter section in the coverage
checklist. In MCP mode they ride in `frontmatter.tags` on `save_page`.

- **The vocabulary is the charter's `## Structure` list, and nothing else.** In MCP mode
  `get_coverage` hands it to you directly: every row carries `category`, the exact token to write.
  In local-clone mode, read the charter page and copy the headings out of `index.md`. Don't invent
  a category; if the material genuinely doesn't fit any section, say so and offer to add one.
- **Lowercase token form**, matching the heading exactly — `orgs-projects`, not `Orgs & projects`.
- **Multi-valued, and list syntax.** `tags: [decisions, places]` — a page needn't choose between
  its genre and its subject, and it is listed under each category it names. A bare scalar
  (`tags: rag`) is **rejected** on save; it must be a list.
- **A page with no tags groups nowhere** — it lands in the catalog's `(uncategorised)` bucket at
  the very end. That is a real state, not an error, but it means the page is hard to find.
- **Imported pages carry the vault's own tags.** Those are legacy labels, not categories: when you
  touch such a page, add the charter category it actually belongs to.
- **The vocabulary is CHECKED, not merely requested.** `lint` reports a tag outside the charter's
  Structure list (`off-vocabulary-tag`), a tag that near-misses a real category by plural, separator
  or accent (`near-miss-tag` — `decisions` where the charter says `decision`), and a page with no
  category at all (`uncategorised-page`). The near miss is the one to fear: the page saves, renders,
  and quietly becomes a heading of its own that nobody else uses. Copy the token, don't retype it.

### Recording what you did

Your reasoning is the only part of a change that the diff cannot show, and it dies with the session
unless you write it down. It goes in the **commit message** — never in a file.

**The two modes commit at different rhythms, so they want different sentences:**

| | what one commit covers | what to write |
|---|---|---|
| **MCP mode** | one `save_page` | why **this page** changed |
| **local-clone mode** | one `/commonground:push` — everything since the last one | what **this session** did |

In MCP mode pass `message` to `save_page`: *"rewrote the career section after the Sequence move"*.
In local-clone mode pass `--message` to `/commonground:push`: *"split Concepts by retrieval
contract — 6 pages retagged, ai-web3-interest rebuilt as a runnable routine"*.

Say what changed and **why**. Never restate what the diff already shows: "updated page" and "edited
people/taylan" are worth nothing, because the history already lists the page and the date. Don't
carry a session-scale sentence into a single `save_page`, or a page-scale one into a push.

`get_history` reads this back, per commit and per page. A page's own dates stay in its
`created` / `updated` — the commit is not a per-page changelog.

---

## Seed — first-run guided interview

Bootstrap an empty (or thin) wiki with the durable context its LLMs should always start from.
Exposed as **`/commonground:seed`** — the guided arc that first **charters** the wiki (audience,
structure, retrieval brief → the `wiki-charter` page), forks to **importing** an existing
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
3. For each answered question, draft the page it names (pageId, title, scope from the guide,
   and `tags:` = the coverage row's `category` — the charter section this page is filling) with the
   user's answer as the body and valid frontmatter (`updated` = today). **Show it and persist only
   on confirm** — never auto-write or invent facts.
4. The catalog rebuilds itself from the pages' `summary:` lines. In local-clone mode the whole
   seeding pass is ONE push, so give it one session-scale message (`--message "seeded the wiki from
   the <discipline> interview — 9 pages across 4 sections"`); in MCP mode each `save_page` carries
   its own `message` about that page.
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
   schema-correct pages, each carrying its `tags:` (the charter categories it belongs to — the
   catalog you just read shows the vocabulary), citing any stored source under `sources:`, and
   linking the pages they relate to inline in the body — `[[wikilinks]]` / `[text](pageId)`,
   wherever they read naturally. That is the whole link graph: a page nothing links to is an
   orphan, and a link to a page not written yet is a useful demand signal.
   - **A decision** ("we decided…", an ADR) → a page in the ADR shape, tagged with the charter's
     decisions category:
     context/problem → the decision → options considered → rationale → consequences, linking to
     the pages it affects from the prose. Ask only for the missing parts; never invent an outcome.
4. **Show each page and persist only on confirm.** Record what the ingest did: in local-clone mode
   one `--message` for the whole operation, however many pages it produced; in MCP mode a `message`
   per `save_page` saying why that page changed.
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
- **Orphan** — an `active` page no other page's body links to (`[[wikilink]]` / `[text](pageId)`).
  (Never report the charter page as an orphan — the charter is meta and rarely linked.)
- **Broken citation** — a `sources:` **path** with no matching file under `sources/` (a `sources:`
  URL is always valid). That is the whole check: a dangling `[[wikilink]]` is a demand signal, not
  a broken citation.
- **Thin summary** — active pages with no authored `summary:` (or one that is just a copy of the
  first body line, or pure provenance). Arrives as ONE batched finding for the whole wiki, naming a
  sample and a count — report it as one line, and offer a backfill pass rather than a page-by-page
  to-do list.
- **`missingLinks`** — "red links": body links to a page that doesn't exist yet (with the pages
  referencing each). Surface as "referenced but not written yet" — ready candidates to ingest next.

**Coverage gaps** (the `get_coverage` tool, charter-aware): the empty/partial sections of the
charter's Structure list (or the org-shape template if the wiki isn't chartered yet), each with its
intent (`prompt`) and the pages it already has. **The progress number is deterministic — report it,
never recompute it.**

**Structure** (on the `lint` result): what the wiki's own links say about its categories — how many
of a category's links stay inside it, single-page categories, the uncategorised share, and drift
between the charter's sections and the tags in use. It is **not a finding and never a defect**: it
says the links disagree with a grouping, not that the grouping is wrong, and the repair is a
**retag** — no page moves, no link breaks. A `ratio` of `null` means no honest ratio exists (a
single-page category, or one with no links); never render it as 0%.

**Optional judgement checks** (your reasoning, over pages you've read): **contradiction** (two pages
conflicting), **missing cross-reference** (two clearly related pages whose bodies don't link), and
the **gap reading** — the qualitative read of the coverage gaps, which is the only thing that can
say *what* is missing from a section rather than *that* it is short.

The gap reading is **opt-in**: it costs the user's own tokens, so say so and get a yes before
running it, only on a chartered wiki, and never because a report looked thin. Cite real pageIds and
**never name a page the wiki does not have**; drop an observation you cannot cite. Read the sections'
statuses and counts — never restate or re-derive them, and never produce a second percentage.

Produce a short report — hygiene, then gaps, then red links. Apply fixes / fill gaps only with the
user's go-ahead: in local-clone mode anyone may, since it's their own copy (publishing is the gated
step); in MCP mode it takes an admin/curator. Filling a gap is the ingest flow, gap-driven. Then persist,
recording what the sweep fixed in the message.

## Summarize a topic or scope (when asked)

Reading and summarizing is available to everyone; there's no separate command — a plain question
already makes Claude consult the wiki and cite. When the user wants a written synthesis:

1. Scope it (a `company` / `department:<x>` / `team:<x>` / `product:<x>` scope, or a free-text
   topic). Gather grounded material: `get_index` (optionally scoped), then `search` / `get_page`.
   **Never assert a fact no page backs**; flag what the wiki is silent on rather than filling it in.
2. Write the summary in-session, **citing the pageIds** each point draws on.
3. **(Optional) Save it** — only if the user wants it persisted: a schema-correct page that links
   to the pages it draws on from its prose, written as a file in the clone (local) or via
   `save_page` (MCP, admins/curators). Otherwise just present it in chat.

## Bridge to claude.ai Chat (when asked)

Offered at the end of `/commonground:initialize` and `/commonground:seed`: print a copy-paste
instruction that makes plain **claude.ai Chat** reflexively consult the wiki (a different surface
from Claude Code's `CLAUDE.md` router). The user pastes it into **Settings → Profile preferences**
(every chat) or a **Project's custom instructions**.

1. **Read the charter to tailor it.** `get_page` `wiki-charter` — `company/wiki-charter` on an older
   wiki — (or `get_coverage` for just
   the `audience`); local-clone → read `wiki-charter.md`. No charter yet → don't guess: ask
   whether this wiki is just for them or for a team, print the matching variant, and suggest
   `/commonground:seed` to charter (and tailor) it properly later.
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
