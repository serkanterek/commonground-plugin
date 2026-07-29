---
description: Bootstrap (or top up) your CommonGround wiki — a guided seeding arc that charters the wiki (who it's for, what it holds), then builds from scratch or imports an existing folder/vault
argument-hint: "[folder to import]"
---

Take the user from *just connected* to *a populated, useful wiki*. This is the onboarding arc: it
detects where the wiki is, **charters** it (who it's for, what it should hold, when an AI should
consult it), forks into **build from scratch** or **import what you have**, then converges on a
shared gap-fill loop driven by the charter's checklist. All drafting happens **in this session, on
the user's tokens** (Model A) — you produce the markdown; CommonGround persists it. Re-runnable and
**resumable**: it always resumes from the current charter + coverage, so running it again just
continues filling gaps.

**Asking questions:** whenever a question in this arc has enumerable answers, present it with the
**`AskUserQuestion` tool** (the multiple-choice UI) if it's available in this session — at most 4
options per question (an "Other" is built in). Fall back to a plain conversational question when
the tool isn't available or the answer is open-ended. Either way, ask one thing at a time.

**Establish the project's mode before any write** — the SessionStart hook states it, else this
project's `./CLAUDE.md` router block (`<!-- commonground:mode:… -->`) or `commonground status`.
**Local-clone mode:** every page below is a FILE in the clone, and the charter too — do not use
`save_page` / `save_charter`; nothing reaches the team until `/commonground:push`. **MCP mode:** the
write tools go straight to the shared wiki, live for everyone the moment they land.

**Roles.** In **local-clone mode** seeding needs no particular role — it builds the user's own
working copy — but a member can't publish it, so say that when the arc completes and offer
`suggest_change`. In **MCP mode** seeding writes the shared wiki directly, so it is **admin/curator
only**: for a member, don't attempt writes — explain the limit and offer to answer questions from
whatever wiki exists (`search` / `get_page`) instead.

**Audience governs tone.** The charter (step 2) declares who the wiki is for. **just-me** → say
"your wiki" and "your Claude", never "your teammates"; personal and subjective content is in-scope
by definition. **my-team / whole-company** → the shared framing applies. Never suggest removing
content for "shareability" — see the golden rules in the `maintainer` skill.

Work through this conversationally — adapt to what's already true, don't robotically run every step.

## 1. Read the current state (and the lenses)

Call `get_coverage` (or `GET /wiki/coverage`). It returns, for the team's org shape: overall
`progress` (`done`/`total`/`pct`), one row per section (`status` done/partial/empty, its `prompt`,
`scope`, `havePageIds`), and **`callerDiscipline`** — the user's own discipline (pm/dev/design/qa/
exec/other), the seeding lens. Also glance at `get_awareness` (`pageCount`) to tell **empty** (0)
from **already-populated**. And check `get_index` for **`company/wiki-charter`** — the wiki's
charter page. If it exists, read it (`get_page`): its Audience / Structure / Retrieval brief govern
everything below, so skip step 2.

`get_coverage` is **charter-aware**: once a charter exists it reports `chartered: true` plus the
charter's `audience`, and its rows ARE the charter's Structure list — the wiki's own definition
of complete. With no charter, the rows are the org-shape template (the pre-charter fallback).
The charter page itself is meta: the server excludes it from section counts and `pageCount`.

- If `callerDiscipline` is present, use it — **don't re-ask** their discipline.
- If it's `null` (unknown), briefly ask which of pm / dev / design / qa / exec / other fits them.
- **Empty wiki** → frame this as first-run seeding. **Populated** → frame it as "let's fill what's
  still thin," resuming from the charter/coverage above (skip the from-scratch interview unless
  they want it).

### 1a. Re-entry — open on the RIGHT beat

`get_coverage` also returns **`seeding`**, which says what the last session left behind. Charter and
coverage only show what was *written*, so without this an interview three questions deep that hadn't
yet produced a page looks identical to a first run — and the person most likely to need help, the one
who stopped partway, gets the beginner's greeting. Open on the matching beat:

- **`fresh`** — no session on record. Proceed as first-run.
- **`resume`** — the same person, recently. Pick up mid-thought: *"Picking up where we left off — we
  were on **Key decisions**."* Don't recap the whole arc, and **don't re-ask any `askedQuestionIds`**.
- **`abandoned`** — the same person, but a while ago. They will not remember where they were, so
  re-orient in one line before continuing: *"Last time we got as far as **Key decisions** — N of M
  sections are filled. Want to carry on there, or pick somewhere else?"*
- **`other`** — somebody ELSE was seeding this wiki. Say so and let them choose rather than silently
  interleaving two interviews: *"Alex was seeding this about ten minutes ago, on **Key decisions**.
  Want to continue where they stopped, or take a different section?"*

**Record progress as you go.** After each section, call **`save_seeding_progress`** with the
`sectionId` and every question id you have put. Call it once more with `done: true` when seeding
finishes, which clears the cursor. It stores POSITION ONLY — never answers, which belong in pages.

Be honest about the limit if it comes up: an answer given but not yet written to a page is still
lost. What resuming guarantees is that you won't be asked the same question twice.

## 2. Charter the wiki (first run — skip when a charter page exists)

Three quick questions, then one small page. Keep it to ~2 minutes — it's a conversation opener,
not a ceremony.

1. **Audience.** Ask (AskUserQuestion): *Who is this wiki for?* — **Just me** (a personal context
   wiki) / **My team** / **The whole company**. This sets the tone rules above, what curation may
   flag, and (later) the retrieval instructions.
2. **Structure.** Take the shape template's sections from `get_coverage` and present them as a
   **proposal, never a schema** — each with a one-line "what goes here" — then ask: **Use this
   structure** / **Edit it with me** / **Start blank** (just `index.md`; structure emerges as
   content lands). Editing is conversational free text: add / rename / drop sections; for a
   just-me wiki explicitly invite replacing sections wholesale (swap "Clients & projects" for
   whatever their work and life actually hold). The final list is **this wiki's own definition of
   complete**.
3. **Retrieval brief.** If `./CLAUDE.md` has the fenced CommonGround router block (written by
   `/commonground:initialize`), show the user its trigger sentence verbatim; if this project was
   never initialized (e.g. the connector was configured globally), skip the show-and-tell and just
   capture the brief below.

   **Say whose words they are.** That sentence was written by `init` moments ago in the DEFAULT
   voice — it is not theirs, and presenting it for approval as though it were invites a shrug and a
   "sure, fine". Name it: *"That's the generic version `init` wrote. Once you've chartered the wiki
   I'll rewrite it in your words."* Then explain that this text (plus a keyword nudge derived from
   page titles) is what sends an AI to the wiki, and that it re-renders from the charter — audience
   framing plus their brief as a trigger line. Ask: **Keep the default** / **Tailor it**. Tailoring:
   capture 1–3 sentences in the user's own words — which topics or questions should route here
   (for a just-me wiki this is the crucial fix: e.g. "anything about me — how I work, my projects,
   my preferences, my history"). Optionally collect a few **pinned keywords** (names, codenames)
   a derived list would miss.
4. **What does NOT belong.** Ask it plainly — "is there anything that should stay OUT of this wiki,
   and where does it live instead?" Capture their answer in their own words (e.g. "client work
   stays in the client vault; interview prep lives in Careerhelp"). This is the contract's other
   half: without it every surface only ever says *consult this wiki*, so material drifts in and the
   wiki stops being trustworthy. Skip it gracefully if they have nothing to exclude — an absent
   Excludes section renders exactly as before. Also mention what it does: coverage stops chasing an
   excluded section as a gap (it reports it as excluded, never hides it), and both the CLAUDE.md
   router block and the connector's instructions start saying where that material belongs instead.

Draft the charter page, show it, and on confirm **persist it right away** (don't defer to
step 7 — it's the contract everything below reads):

```markdown
---
title: Wiki Charter
type: charter
scope: company
updated: <today>
---

## Audience
<one of: just-me | my-team | whole-company> — plus one line on who reads/writes here.

## Structure
- <Section> — <what belongs there>   (one bullet per section — this is the coverage checklist)

## Retrieval brief
<When an AI should consult this wiki, in the user's words.>

## Pinned keywords
<comma-separated, optional>

## Excludes
<What does NOT belong here, and where it lives instead — in the user's words. Optional.>
```

Keep the `##` headings exactly as written — the server parses them (coverage builds its checklist
from Structure and marks an excluded section rather than chasing it; the keyword trigger unions
Pinned keywords; both instruction surfaces render Retrieval brief and Excludes).

With the charter persisted, make it live in this project: run **`commonground init --refresh`**.
It re-renders the fenced router block in the wiki's own voice — personal framing for a just-me
wiki, the brief as a trigger line — and absorbs any leftover `retrieval-brief` marker block from
earlier plugin versions. Never hand-edit inside the fence. The MCP connector's instructions pick
the charter up automatically (per session/request) — no extra step there.

## 3. Fork: build fresh, or import what you have?

If `$ARGUMENTS` is a folder path, treat that as "import" and skip the question. Otherwise ask
(AskUserQuestion): **Build from scratch** (I interview you and draft pages) / **Import a folder or
vault** (Obsidian, a `docs/` tree, a Notion/Confluence export — normalized in) / **Import, then
top up** (import first, then interview the thin spots). All paths write real pages and end at the
same gap-fill loop (step 6).

## 4. Branch A — build from scratch (the checklist-walk interview)

Walk the **charter's Structure list** (fallback: the coverage rows) as the checklist — it is both
the interview *and* the progress bar.

1. Deepen the durable "starting context" sections with the discipline question bank (all
   audiences): read `seeding.md` in the `maintainer` skill folder and use the section
   for the user's discipline (from `callerDiscipline`). Its questions map each answer to a
   concrete page (pageId, title, type, scope). For a **just-me** wiki, adapt at ask time — reword
   the team-phrased questions to the person ("what should your AI always know about how you
   work?") **and re-target answers to the charter's own sections** (the bank's `company/*` pageIds
   and team framing are shared-wiki defaults, not mandates — pick pageIds that fit the charter's
   structure). Never edit `seeding.md` itself; it's generated.
2. **Ask one question at a time**, conversationally — these are open-ended, so plain questions,
   not AskUserQuestion. **Skip** anything the user can't answer yet — never block, never invent an
   answer.
3. For each answer, **draft one schema-correct page** (frontmatter `type`/`scope` from the
   `seeding.md` mapping or the checklist section; `updated` = today; the user's answer as the
   body). Name it so coverage can see it — echo the section's key word in the pageId or title
   (matching is keyword-based), and give it a real body: a hollow stub ("TBD") never ticks a
   section. See the `maintainer` skill for the frontmatter contract and golden rules.
4. **Show the drafted page and persist only on the user's confirm** — never auto-write. Then
   persist (step 7). Each saved page visibly ticks a section of the checklist.

## 5. Branch B — import an existing folder/vault (triage, then normalize — don't dump)

The hero path when content already exists. Nothing lands raw — imported content becomes
schema-valid, retrievable pages, not files that look covered but answer badly.

**Survey.** Get the folder path (`$ARGUMENTS` or ask for it). Read the layout: count the markdown
files and **cluster them** by folder/topic (e.g. "14 psychology notes · 8 client docs · 5 book
summaries"), and check `get_index` for overlap so likely **duplicates** are flagged up front.

**Triage.** Keep clusters coarse — top-level folders/topics, aim for **≤8** even on a big tree.
Show the cluster summary, then decide. For a **large import**, start with one **multiSelect**
question ("which clusters should I leave out?"), default the kept clusters to Normalize, and
refine per cluster only where the user cares. For a **handful of clusters**, decide per cluster
(AskUserQuestion, one question per cluster, batched ≤4 at a time): **Import as-is** (body preserved,
apart from trimming blank lines around it; only backfill valid frontmatter) / **Normalize**
(restructure into schema-correct pages, merge near-duplicates) / **Skip**. Base recommendations on retrieval usefulness and
duplication — **never** on content being "too personal" (the charter's audience decides what
belongs; for just-me, everything is in-scope). The user's call is final.

**Before importing:** if the folder's root `index.md` is a real home/MOC note (prose, not a
generated list), save it as a proper page first (e.g. `company/overview`) — import will **not** take
a root `index.md`, because the wiki regenerates its own catalog there. Same for a root `log.md`.

**Execute.**
- **Local-clone mode** (admins/curators): know the CLI's limits — `commonground import` is
  **frontmatter-only** normalize (backfill/validate; it never merges or restructures bodies). So:
  stage the kept clusters into a temp folder preserving relative paths (or use the folder
  directly when everything is kept as-is); for clusters marked **Normalize**, do the
  restructuring/merging yourself in-session first, editing the staged files; then run
  `commonground import <staged folder>`. It overlays the folder onto the clone, **backfills
  missing/invalid frontmatter** (carrying `tags`/`aliases`/`created` onto the schema and preserving
  any other frontmatter key verbatim), **regenerates `index.md`** from the whole wiki, and **appends
  ONE line to the append-only `log.md`** — it never imports the source folder's own `index.md`,
  `log.md` or `CLAUDE.md`, and never overwrites anything already under `sources/`. Then it commits
  and pushes. **Relay the CLI's receipt to the user verbatim** — it names what wasn't imported and
  what frontmatter it couldn't carry; that's the answer to "can I retire the original?", so don't
  summarise it away. One thing to say out loud: each page keeps its **real** date (its own
  frontmatter date, else the file's modification time), so genuinely old notes will read as old and
  `/commonground:lint` may flag them **stale** — that's the honest signal, not a bug.
- **MCP mode (no local clone):** do the normalize in-session, honoring each cluster's triage
  choice (as-is = body untouched + frontmatter backfill; normalize = restructure/merge). Read the
  folder yourself (your Read / Glob tools — a remote MCP can't reach local files). For each doc:
  derive a `pageId`+`scope`, write **valid frontmatter** (title from the H1/filename, a sensible
  `type`, `scope`, and `updated` = the doc's own date if it has one, else today — don't restamp real
  modification dates). **Carry the source's frontmatter across**: `tags`/`aliases`/`created` are
  first-class fields, and any other key rides along untouched; only a near-miss of a contract key
  (`Tags`) has to go, and say so when it does.
  Prefer **updating** an existing page over a near-duplicate (`get_index` first). Persist each
  with `save_page` (CAS-guarded: on a conflict, `get_page` for the fresh `baseSha`, merge, retry).
  Stage genuinely-raw material under `sources/` with `stage_sources` where it helps, but land
  curated pages via `save_page`.

**Post-import — say where the wiki lives now (there are two copies, and only one is the wiki).**
Import **copies**; it never adopts the folder. So, in this order:
1. Re-read `get_coverage` / the index and report how the import mapped onto the **charter's
   structure** — which sections it filled, which are still thin.
2. Name the canonical copy: **`~/CommonGround/<team>/` is the wiki** — the copy CommonGround syncs,
   publishes and serves. The folder you imported was left untouched and is now a separate copy that
   will drift.
3. **Delete the temp staging folder** if this flow created one (it's a scratch copy, not the wiki —
   the CLI receipt names it as the source). Never delete the user's own vault.
4. Offer the convergence choice for a real vault: **repoint their editor** at
   `~/CommonGround/<team>/` (the clone is Obsidian-compatible — see `/commonground:initialize`) so
   there is one copy again, or **keep working in the vault** and accept that every change needs
   another `commonground import` to reach the wiki. Their call; just don't leave it unsaid.

That leads into step 6.

## 6. Shared tail — fill the remaining gaps

Whichever branch ran, finish on the gap-loop (the same gap-fill `/commonground:lint` offers,
inline): re-check
the **charter's Structure list** against what exists, take the still-empty/thin sections
most-impactful-first — offer the pick as an AskUserQuestion (the top **3** gaps + "somewhere
else") — and
for each, interview + draft + confirm + persist one page at a time, skipping what the user can't
answer yet. Stop when the user is done or the important sections are covered; they can always run
`/commonground:seed` again later to pick up where they left off.

**When a gap isn't theirs to fill, offer to hand it over** (shared-audience wikis only — never for
`just-me`). A section carries a `discipline`, and "I don't really know this one" is the most common
way seeding stalls. If the user is an **admin** (`invite_teammate` is in your tool list), name the
person who would know and offer a *delegated* invite:

> "Design decisions is design-owned and you've said it's not your area — I can invite your design
> lead with that section queued up, so they land straight on it."

Call `invite_teammate` with the section's **`id` as** `targetScope` (from `get_coverage` — never
invent one), and only once the user has confirmed the email address and role. Nothing is emailed:
you get back an accept link for them to send on themselves. Then move to the next gap rather than
waiting. If the user isn't an admin, say who to ask instead of offering something you cannot do.

## 7. Persist + close

Persist every confirmed page:
- **Local-clone mode:** write the files (each with its own `summary:`), append a `log.md` line
  (`ingest | Guided seeding (<discipline>)` or `ingest | Imported <folder>`), then **offer**
  `/commonground:push` — the wiki is seeded either way; publishing is a separate, asked-for step.
  If the user is a member, say the work is saved in their copy and offer `suggest_change`.
- **MCP mode:** `save_page` per page (CAS-guarded; re-read + retry on conflict) — each one is
  immediately live for the team.

Close with a short, encouraging, **audience-aware** status:
- **just-me:** "Your wiki is live — N of M sections covered. Your Claude now starts every session
  from your own context."
- **my-team / whole-company:** "Your wiki is live — N of M sections covered. Your teammates' Claude
  now starts from this context."

Then call **`save_seeding_progress` with `done: true`** — that clears the cursor, so the next run
opens as a fresh top-up rather than trying to resume a session that finished.

Note it's resumable (`/commonground:seed` again) and point admins/curators at
`/commonground:ingest` (capture anything new — notes, docs, decisions) and `/commonground:lint`
(health + remaining gaps) to keep it growing.

### If it doesn't finish

Seeding runs in this session on the user's own tokens, so it can be interrupted — the context gets
compacted, an import is larger than it looked, or they simply stop. None of that is a failure, and
none of it should be reported as one.

- **They stop partway.** Say what landed and how to come back, in one line: *"Saved what we have —
  N of M sections. `/commonground:seed` picks up here whenever you want."* Record the cursor first.
- **An import is bigger than expected.** Say so before ploughing on: *"That folder has 200 files —
  I'll work through them in batches and save as I go, so nothing is lost if we stop."* Persist each
  batch rather than holding everything to the end; a run that dies at file 190 must not lose 189.
- **An import fails partway.** Report what DID land and what didn't, by name. Never re-run a whole
  import silently — `stage_sources` is content-addressed, so re-staging is safe, but the user should
  be the one to decide.
- **Nothing landed at all.** Say that plainly too. A seeding session that produced no pages and
  claims success is worse than one that admits it stalled.

Finally, if the user also works in **claude.ai Chat**, offer to bridge it: now that the charter
exists, you can print a Chat instruction **tailored to its audience** (retrieval brief + pinned
keywords) that they paste into Profile preferences or a Project's custom instructions. Follow the
`maintainer` skill's **bridge-to-Chat** procedure. It's a different surface from this project's
`CLAUDE.md`, so it's purely additive.
