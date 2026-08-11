---
description: Capture anything into the CommonGround wiki — talk it through, paste notes or a transcript, point at a doc/URL, or record a decision — turned into schema-correct pages
argument-hint: "[optional: a path, a URL, pasted text, or just start talking]"
---

Ingest is **the** way to add or update the wiki. Feed it anything — a thought you say out loud,
pasted notes, a meeting transcript, a doc or URL, a decision you just made — and it becomes
schema-correct, retrievable pages. All drafting happens **in this session, on the user's tokens**
(Model A) — you produce the markdown; CommonGround persists it.

## 0. Establish the mode FIRST — it decides where every write lands

**Do this before anything else, and never infer it from which tools are available.** The
CommonGround MCP tools are registered per *user*, so in a local-clone project `save_page` and
`stage_sources` are present and are the **wrong** path — using them writes straight to the hosted
wiki and leaves the user's own copy behind, which is backwards.

- The **SessionStart hook states the mode** at the top of the session — that is authoritative.
- Otherwise read this project's `./CLAUDE.md` router block (`<!-- commonground:mode:local -->` or
  `<!-- commonground:mode:mcp -->`), or run `commonground status`.

**Local-clone mode** → every step below writes **files in the clone**; nothing is published until
`/commonground:push` — that's when a shared wiki reaches the team, or a personal one reaches the
user's other machines and Chat sessions. **MCP mode** → `stage_sources` / `save_page` write the
hosted wiki directly and are live the instant they land — for the whole team on a shared wiki, for
the user's other Claude sessions on a personal one; say that and get an explicit yes before each
write.

**The user asked for this ingest — your job is to do it, not to weigh whether it should happen.**
The mode rules above say *where* the write lands; they never make capturing off-limits, in either
mode. Confirm what you're about to write and where it goes, then write it. Don't open with a caveat
about this project not being the wiki, don't push back on the request, and never tell the user this
project shouldn't write to the wiki. The only things worth raising are a genuine charter-scope
question (below) and, in MCP mode, the per-write yes.

**Roles.** In **local-clone mode ingesting needs no particular role** — it's the user's own working
copy, so a member ingests exactly like an admin. Only **publishing** is admin/curator, and
`/commonground:push` says so rather than failing; a member's work then travels to the team as a
**`suggest_change`**, which is their real path, not a consolation prize.

In **MCP mode** the gate is on the write itself: a member's `tools/list` simply carries no
`stage_sources` / `save_page`, so no read-only error is ever returned. Read the tool list carefully:

- **Write tools absent, read tools (`search`, `get_index`, `get_page`) present** → a real role gate.
  The user is a member; say so, and offer `suggest_change` (present for every role) plus reading.
- **ALL the CommonGround tools missing** → the **connector** was dropped (a plugin update does
  this), not a permissions problem. Don't tell the user they lack access. Say the connection is
  down, suggest `/mcp` to reconnect or a session restart, and point them at `/commonground:status`.

**What's worth keeping is the wiki's call, not yours.** If a charter page exists
(`company/wiki-charter` in `get_index`), its audience governs scope: for a **just-me** wiki,
personal and subjective material is in-scope by definition — never drop or flag content for
"shareability". For a team-audience wiki, a sharing concern is **flag-and-ask**, never a silent
omission.

Follow the `maintainer` skill's **ingest** procedure (decisions included) — read it for the wiki
schema (frontmatter, pageIds, categories, scopes, the golden rules). Work through this like an
assistant taking notes: conversational, one thing at a time, never a rigid form.

## 1. Open the capture session

- If `$ARGUMENTS` is given (a path, URL, or pasted text), treat it as the first thing to capture.
- If it's empty, open the floor: invite the user to **talk it through, paste something, or point you
  at a doc/URL** — and keep the loop going ("anything else?") until they're done. Capture in the
  order it comes; you'll organize at draft time.

## 2. Get each source's content

- **Talking / pasted text** — use it directly; ask a clarifying question only when a durable detail
  is genuinely missing (don't interrogate).
- **File path** — read it.
- **URL** — fetch it **yourself in this session** (your own web-fetch tool) and use the readable
  main content; don't stage a bare link.
- **A doc behind a login** (Google Drive / Docs, Figma, Notion, Confluence…) — **first try a
  connector available in this session**: if a Google Drive (or similar) MCP tool is connected, use
  it to pull the content directly. Only if no connector can reach it, ask the user to export it
  (File → Download → PDF, or Export → Markdown) and drop that in — never save a login-wall page.

## 3. Detect the shape

Look at what you gathered and pick the shape the page wants, then the charter category it belongs
to (`tags:` — see the skill):

- **A decision** ("we decided…", "we're going with…", an ADR) → draft it in the ADR shape:
  context/problem → the decision → options considered → rationale → consequences. Ask only for the
  parts that are missing; never invent an outcome the user didn't state.
- **Everything else** → the durable takeaways as the body.

## 4. Stage the raw source (immutable)

- **Local-clone mode:** write it to `sources/<slug>.md` in the clone (never overwrite an existing
  source — pick a new name).
- **MCP mode:** call `stage_sources` with each source's `title` + `content` (the text you gathered
  in step 2 — `stage_sources` stores text, so a URL's or doc's extracted content goes here, not the
  link).

Pure spoken/typed thoughts with no external artifact don't need a source file — the page itself is
the record.

## 5. Draft the page(s)

Check the current catalog first — the clone's `index.md` in local-clone mode (it lists pages the
user hasn't published yet, which `get_index` cannot), `get_index` in MCP mode — and prefer
**updating** an existing page
over creating a near-duplicate. That same read gives you the wiki's **category vocabulary**: the
catalog's headings are the charter's `## Structure` sections, and every page you write carries the
one or more it belongs to in `tags:` (that is what groups it — folders don't). Write schema-correct
pages, each carrying its `tags:`, citing any stored source under
`sources:` and linking the pages they relate to inline in the body — `[[wikilink]]` /
`[text](pageId)`, wherever they read naturally. That is the whole link graph: a page nothing links
to is an orphan, and a link to a page not written yet is a useful demand signal. Give
each one a `summary:` that **partitions** with its title rather than echoing it — the title is the
page's name, the summary is what is *inside* it (the full contract is in the `maintainer` skill).
**Show each drafted page and persist only on the user's confirm** — never
auto-write, never assert a fact the source doesn't support.

## 6. Persist + report

- **Local-clone mode:** write the files (each with its own `summary:`).
  That is the ingest *done* — the work is saved in the user's copy. Then **offer** to publish with
  `/commonground:push` (it commits for them — never ask them to run git, and never push without
  asking). If they'd rather keep drafting, that's a normal outcome, not an unfinished one.
  - If the user is a **member**, publishing isn't theirs to do: say the work is saved in their clone
    and offer to file it as a `suggest_change` so a curator can fold it in.
- **MCP mode:** write each page with `save_page` (CAS-guarded — if it reports a conflict, re-read
  with `get_page`, merge, and retry with the new `baseSha`). Remember this is immediately live — for
  the whole team on a shared wiki, for the user's other Claude sessions on a personal one.

Close with a short change summary: sources stored + pages added/updated (by pageId), where they
landed (the clone, or the published wiki), and offer to link a new decision from the pages it affects.
