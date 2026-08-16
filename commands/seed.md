---
description: Bootstrap (or top up) your CommonGround wiki — a guided seeding arc that charters the wiki (who it's for, what it holds), then builds from scratch or imports an existing markdown folder
argument-hint: "[wiki] [folder to import]"
---

Take the user from *an empty wiki* to *a populated, useful one*. This is the onboarding arc: it
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

**The mode — where pages land — is settled by ASKING, in step 0.3; never by detection alone.**
The SessionStart hook, this project's `./CLAUDE.md` router block (`<!-- commonground:mode:… -->`)
and `commonground status` tell you the CURRENT setup — use them to mark the default option in the
question, not to skip it (SER-256).
**Local-clone mode:** every page below is a FILE in the clone, and the charter too — do not use
`save_page` / `save_charter`; nothing is published until `/commonground:push`. **MCP mode:** the
write tools go straight to the hosted wiki, live the moment they land — for the whole team on a
shared wiki, and for every other Claude they use on a personal one. Both halves answer *where* a
write lands, never *whether* seeding may happen: the user invoked this arc, so confirm what you're
writing and write it — never tell them this project shouldn't write to the wiki.

**Roles.** In **local-clone mode** seeding needs no particular role — it builds the user's own
working copy — but a member can't publish it, so say that when the arc completes and offer
`suggest_change`. In **MCP mode** seeding writes the hosted wiki directly, so it is **admin/curator
only**: for a member, don't attempt writes — explain the limit and offer to answer questions from
whatever wiki exists (`search` / `get_page`) instead.

Your role is a property of **the wiki being seeded**, not of the one this project reads. Someone can
curate their own wiki and be read-only in their company's, so when step 0 targets another wiki the
server decides — relay what it says rather than reasoning from the role you have here.

**Audience governs tone.** The charter (step 2) declares who the wiki is for. **just-me** → say
"your wiki" and "your Claude", never "your teammates"; personal and subjective content is in-scope
by definition. **my-team / whole-company** → the shared framing applies. Never suggest removing
content for "shareability" — see the golden rules in the `maintainer` skill.

Work through this conversationally — adapt to what's already true, don't robotically run every step.

## 0. Which wiki, and is this session signed in?

Seeding is the FIRST thing a new user does, so this command cannot assume a signed-in machine or a
project that has already been pointed anywhere. It settles both itself and never bounces the user to
another command to come back afterwards.

**Parse `$ARGUMENTS`.** A token that names a wiki (a name, an id, or a unique prefix of either —
check it against the `commonground use` listing) is the **target**. A token that is an existing path
is the **import folder**. Both may appear, in either order; neither is required.

**1. Signed in?** Run `commonground status`. If it reports a team, you're signed in — go to 2. If it
reports "not logged in" / "no team logged in", sign in **here**, inline:

- The user needs a CommonGround account **with at least one wiki** first — the authorize screen has
  nothing to approve without one, and its button is hidden rather than left dead. No account yet →
  https://app.commongroundapp.io/sign-up.
- Use the **split** form, never the one-shot `commonground login`: the one-shot blocks until the
  grant expires (~10 minutes), far longer than a tool call gets, so it is killed and looks like a
  failure when it was only waiting.
  1. `commonground login --start` — prints the URL and code, then exits. Relay both.
  2. `commonground login --wait` — polls ~90 seconds. **still waiting** is not an error; run it again.
- **Stop after the second "still waiting" and say why, instead of polling a third time.** A poll that
  never lands almost always means the user cannot press the button, not that they are slow — and the
  loop hides that completely. The two causes: they have **no wiki yet** (the screen offers no button
  at all and says to create one), or the code expired and needs a fresh `--start`. Ask which they see.

**2. Resolve the target.**

- **An argument was given** → that's it. Don't second-guess it.
- **Exactly one wiki** → don't stage a decision that isn't one. Say which and carry on.
- **This project is pointed at a wiki** (or, failing that, this machine has one marked `*` active in
  `commonground use`) → confirm in ONE sentence and move: *"Seeding **Acme Handbook** — that the
  one?"* A confirmation is not the same as a guess: it is one sentence they can say no to.
- **Several wikis and nothing pointed or active** → list them by name (`commonground use`) and ask.

**Never guess, and never silently seed the fallback wiki when the user has several.** A wrong-wiki
write is the defect class this whole area exists to close, and seeding is the one arc that writes
dozens of pages before anyone would notice.

**3. Mode — ask WHERE PAGES LAND, before anything is read or written (SER-256).**

Where a page lands is never a silent default. The first live run presumed MCP because the
connector happened to work, and every drafted page would have gone live on a shared hosted wiki
with no review step — so the mode is a QUESTION now, and it comes before the recon in step 1
because the answer decides which sign-in must work (local → the CLI's membership of the target;
MCP → the connector's).

**In Claude Code, always ask** (AskUserQuestion). When the project already has an established
mode for this target, list that option first, marked "current setup", so the question has an
obvious default instead of a fork:

- **Local clone** — pages are files on this machine first; you review everything, and nothing
  reaches the hosted wiki until `/commonground:push`. Needs the CLI signed in as a member of the
  target wiki.
- **Hosted directly (MCP)** — every saved page is immediately live on the hosted wiki — for the
  whole team, on a shared one. No staging step.

**In claude.ai Chat, state rather than ask** — there is no filesystem, so don't stage a fake
choice: say plainly that pages go live on the hosted wiki as they are saved, and that running
`/commonground:seed` in Claude Code instead is the way to stage and review first.

Then wire the answer up:

- **Local, target is this project's wiki** → the local-clone rules above, unchanged.
- **Local, target not pointed or not cloned here** → run the point flow for it now —
  `commonground init --mode local [--path <folder>] <wiki>`, with point.md's confirm-or-override
  on the folder — then seed into the files.
- **MCP, target is the session's wiki** → the write tools as-is.
- **MCP, target is a DIFFERENT wiki** → pass **`wiki: <teamId>`** on every seed-path tool call:
  `get_coverage`, `get_awareness`, `get_index`, `get_page`, `stage_sources`, `save_page`,
  `save_charter`, `save_seeding_progress`. The connector resolves its own wiki once per session, so
  this argument is the only thing that moves a write — there is no re-binding and no restart. The
  server authorizes it against the TARGET (membership and your role *there*); **relay its refusals
  as it words them** rather than pre-judging. A refusal is never a reason to retry without the
  argument — that writes into the wrong wiki.

**4. Verify the argument took effect — before writing anything.** Every tool response ends with
`[commonground] answered from wiki <id>`. After your FIRST `wiki:`-carrying call, read it:

- It names the **target** → the argument landed. Proceed, and don't check again.
- It names the **session's** wiki → this server predates the argument and **silently ignored it**
  (an undeclared argument is dropped, not rejected — there is no error to catch, which is exactly
  why this check exists). **Write nothing.** Say plainly that the server is older than this plugin,
  and hand off: `/commonground:point <wiki>` in a project, then restart the session and seed there.
  Never retry the argument in a loop, and never fall through to seeding whatever answered.

**5. State the target once, then stay on it.** Name the wiki you are seeding at the top of the arc.
For the rest of this session **every seed-path call carries the same `wiki:`** — the reads in step 1
just as much as the writes in step 7. A `get_coverage` that forgets it reads the wrong wiki's
checklist and then interviews the user against sections that aren't theirs, which is a wrong-wiki
failure that produces no error and looks like a working session. Do not re-ask the target later —
not at a branch, not at a gap, and not on re-entry: the beats in 1a resume a *wiki*, and the target
was settled here.

## 1. Read the current state — one call, then talk

Call `get_coverage` (or `GET /wiki/coverage`), with the `wiki:` argument whenever step 0 targeted
another wiki. It answers everything the arc needs to open: overall `progress`
(`done`/`total`/`pct`), one row per section (`status` done/partial/empty, its `prompt`, `scope`,
`havePageIds`, and per-section counts), **`callerDiscipline`** — the user's own discipline
(pm/dev/design/qa/exec/other), the seeding lens — plus `chartered`, `audience`, and the `seeding`
re-entry cursor (step 1a). Empty-vs-populated falls out of the counts: every section at zero is a
first run; anything else is a top-up.

**That one call is the whole opening scan (SER-257).** Don't front-load `get_awareness`,
`get_index`, or a charter `get_page` here — read the charter page (`wiki-charter`, or
`company/wiki-charter` on an older wiki) at the step that actually needs its prose (the retrieval
brief and excludes), and the index when import triage calls for it (step 5). The person who
invoked seeding is holding the answers; the first minute of the arc belongs to their words, not
to a tool feed.

**Read ONLY the wiki being seeded.** The connector's own instructions push toward consulting the
session's wiki whenever its keywords come up — that reflex belongs to ANSWERING questions, not to
seeding a different wiki, and it is how a seeding session quietly reads a personal wiki to ground
a shared one. Grounding from any other wiki — especially personal → shared, the
privacy-sensitive direction — is offer-and-consent, never silent: *"Your personal wiki has three
Hipo pages — want me to draw on them here?"* No consent, no read; and never quote another wiki's
content into this one without it.

`get_coverage` is **charter-aware**: once a charter exists it reports `chartered: true` plus the
charter's `audience`, and its rows ARE the charter's Structure list — the wiki's own definition
of complete. With no charter, the rows are the org-shape template (the pre-charter fallback).
The charter page itself is meta: the server excludes it from section counts and `pageCount`.

- If `callerDiscipline` is present, use it — **don't re-ask** their discipline.
- If it's `null` (unknown), briefly ask which of pm / dev / design / qa / exec / other fits them.
- **Empty** (all counts zero) → frame this as first-run seeding. **Populated** → frame it as
  "let's fill what's still thin," resuming from the coverage above (skip the from-scratch
  interview unless they want it).

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

## 2. Charter the wiki (first run — skip when coverage reports `chartered: true`)

A few quick questions, then one small page. Keep it to ~3 minutes — it's a conversation opener,
not a ceremony.

**Content first, structure second.** Ask what they actually do, then name the sections from their
answers. Never the other way round: a section list presented before a single question about their
work is a template, and "accept, edit, or reject this template" is a far worse prompt than
describing your own work and hearing it named back. The order below is the point of this step.

1. **Audience.** *They have probably already answered this* — it is the first question the web asks
   when a wiki is created, and the answer is recorded as the team's **shape** (`get_coverage`
   returns it). **Don't ask it cold.** Read the shape and CONFIRM in one line instead:

   | shape | say |
   |---|---|
   | `solo` | *"You set this up as a personal wiki — just you. Still right?"* |
   | `team` | *"This one's for your team. Still right?"* |
   | `company` | *"This one's company-wide. Still right?"* |

   Only ask the open question — *Who is this wiki for?* — with **Just me** (a personal context wiki)
   / **My team** / **The whole company**, when the shape is genuinely unknown, or when they say the
   recorded answer is wrong. Asking someone the same question twice in two minutes, in the same
   words, is how a product tells them nothing it collected was remembered.

   The answer sets the tone rules above, what curation may flag, and (later) the retrieval
   instructions. The **charter page stays canonical** — shape only supplies the starting point.
2. **What is this for? Ask TWO OR THREE OPEN QUESTIONS — before naming any section.** Plain
   questions, one at a time, conversational (not AskUserQuestion — these are open-ended). Pick by
   audience:

   | audience | ask |
   |---|---|
   | `just-me` | *"What do you actually spend your time on — work, projects, the things you keep coming back to?"* · *"What should your Claude always know about you, that you'd otherwise re-explain in every new chat?"* · *"What are you deciding or wrestling with at the moment?"* |
   | `my-team` | *"What does this team actually make or do — in your words, not the org chart's?"* · *"How does work happen here: who decides what, and how does something get from idea to shipped?"* · *"What's already been decided that someone joining next week would need to know?"* |
   | `whole-company` | *"What does the company make, and for whom?"* · *"How is it organized — what are the parts, and who owns what?"* · *"What decisions or policies does everyone need to be working from?"* |

   **Skip** anything they can't answer, and stop at two if the first two were rich — this is not an
   interrogation. If they answer in one word, don't push: fall through to the template fallback in
   step 3 and let structure emerge from content later.

   **These answers are CONTENT, not just charter input.** Hold on to them verbatim. Record the
   question ids with `save_seeding_progress` so re-entry doesn't re-ask them, and — critically —
   **Branch A must not ask the same things again** (step 4): draft its first page(s) straight from
   these answers, and open there rather than at question one.
3. **Structure — named from what they just said.** Derive **4–8 sections from their own answers**,
   using their nouns: "I coach three clients and write a newsletter" gives you *Clients* and
   *Writing*, not *Mission* and *Personas*. Show each with a one-line "what goes here", and where
   it's not obvious, say which answer it came from — a section they can trace to their own sentence
   is one they'll correct rather than shrug at. Then ask: **Use this structure** / **Edit it with
   me** / **Start blank** (just `index.md`; structure emerges as content lands).

   Editing is conversational free text: add / rename / drop.

   **Fallback, not opener:** only if they said almost nothing, fall back to the shape template's
   sections from `get_coverage` — and say that's what you're doing, so a generic list is never
   passed off as a reading of their work. Never present the template first.

   The final list is **this wiki's own definition of complete** — and it is also the wiki's
   **category vocabulary**: every page written afterwards carries one or more of these sections in
   its `tags:`, and that is what groups it in the catalog. So keep the list small and keep the names
   ones a person would actually reach for. It names sections — not folders: folders come into
   existence when pages are written into them, they group nothing, and nothing here reserves a path.
4. **Retrieval brief.** If `./CLAUDE.md` has the fenced CommonGround router block (written by
   `/commonground:point`) **and it names the wiki being seeded**, show the user its trigger sentence
   verbatim; if this project was never pointed anywhere, or is pointed at a different wiki than the
   one you are seeding, skip the show-and-tell and just capture the brief below — a trigger sentence
   from another wiki's router block is not this wiki's to approve.

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
5. **What does NOT belong.** Ask it plainly — "is there anything that should stay OUT of this wiki,
   and where does it live instead?" Capture their answer in their own words (e.g. "client work
   stays in Notion; interview prep lives in Careerhelp"). This is the contract's other
   half: without it every surface only ever says *consult this wiki*, so material drifts in and the
   wiki stops being trustworthy. Skip it gracefully if they have nothing to exclude — an absent
   Excludes section renders exactly as before. Also mention what it does: coverage stops chasing an
   excluded section as a gap (it reports it as excluded, never hides it), and both the CLAUDE.md
   router block and the connector's instructions start saying where that material belongs instead.

Draft the charter page, show it, and on confirm **persist it right away** (don't defer to
step 7 — it's the contract everything below reads). It goes at the reserved pageId `wiki-charter`
(repo root) — that id is the only thing that makes a page the charter:

```markdown
---
title: Wiki Charter
updated: <today>
---

## Audience
<one of: just-me | my-team | whole-company> — plus one line on who reads/writes here.

## Structure
- <Section> — <what belongs there>   (one bullet per section — the coverage checklist AND the
  page-category vocabulary: pages carry these names in `tags:`)

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
(AskUserQuestion): **Build from scratch** (I interview you and draft pages) / **Import an existing
markdown folder** (a notes folder, a `docs/` tree, a Notion/Confluence export — normalized in) / **Import, then
top up** (import first, then interview the thin spots). All paths write real pages and end at the
same gap-fill loop (step 6).

## 4. Branch A — build from scratch (the checklist-walk interview)

Walk the **charter's Structure list** (fallback: the coverage rows) as the checklist — it is both
the interview *and* the progress bar.

**Start by banking what step 2 already told you.** They described their work two minutes ago; those
answers are page material, not just charter input. Draft the first page(s) from them, show them, and
open the interview at the FIRST STILL-EMPTY section. Re-asking "what does your team do" here, right
after they answered it, is how an arc tells someone their words went nowhere — and it is the exact
failure the reordering in step 2 exists to prevent. Anything already recorded in
`askedQuestionIds` is off the table too.

1. Deepen the durable "starting context" sections with the discipline question bank (all
   audiences): read `seeding.md` in the `maintainer` skill folder and use the section
   for the user's discipline (from `callerDiscipline`). Its questions map each answer to a
   concrete page (pageId, title, scope). For a **just-me** wiki, adapt at ask time — reword
   the team-phrased questions to the person ("what should your AI always know about how you
   work?") **and re-target answers to the charter's own sections** (the bank's pageIds and team
   framing are a starting point, not a layout — pick pageIds that fit the charter's structure, and
   create folders by saving pages into them). Never edit `seeding.md` itself; it's generated.
2. **Ask one question at a time**, conversationally — these are open-ended, so plain questions,
   not AskUserQuestion. **Skip** anything the user can't answer yet — never block, never invent an
   answer.
3. For each answer, **draft one schema-correct page** (frontmatter `scope` from the
   `seeding.md` mapping or the checklist section; `updated` = today; the user's answer as the
   body). Set **`tags:` to the charter Structure section(s) this page fills** — the checklist row's
   own `category` — and coverage then matches it exactly, with no pageId wordplay needed. Give it a
   real body too: a hollow stub ("TBD") never ticks a section however it is tagged. See the
   `maintainer` skill for the frontmatter contract and golden rules.
4. **Show the drafted page and persist only on the user's confirm** — never auto-write. Then
   persist (step 7). Each saved page visibly ticks a section of the checklist.

## 5. Branch B — import an existing markdown folder (triage, then normalize — don't dump)

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

**A folder tree with its own subfolders keeps them, verbatim.** Import preserves paths exactly — a page's
path IS its pageId. Never restructure a tree the user already built. But a folder no longer groups
anything: **give each page a `tags:` naming the cluster its folder represents**, or the whole import
lands under `(uncategorised)`. Prefer the charter's own `## Structure` wording where a folder matches
one — `psychology/` under a charter section "Psychology notes" is `tags: [psychology-notes]`.

**A flat folder with no subfolders: offer sections, don't impose them.** A flat pile imports flat, which is
honest and perfectly fine for twenty notes — but one unlabelled alphabetical list of two hundred is
unusable, and that is exactly when help is worth most. You have already clustered these files by
topic to run the triage above, so the work is done; the only question is whether the user wants it
applied. Ask once (AskUserQuestion), with flat as a first-class answer:

> *"These 47 notes have no folders. I'd group them as **Psychology · Clients · Book notes ·
> Recipes** — file them that way, keep everything flat, or would you rather name the groups?"*

**File them** → put the cluster name in each page's **`tags:`**, not in its path — that is what
groups it, and it means nothing has to move. **Keep flat** → no tags yet, and say the pages will sit
in the catalog's `(uncategorised)` bucket until they're categorised. **Let me name them** → take
their names and use those. Prefer the charter's existing `## Structure` sections when a cluster
clearly matches one — don't invent a second vocabulary for the same thing. This is a proposal about
*how pages are grouped*, never a reason to change what a page says.

**Before importing:** if the folder's root `index.md` is a real home/MOC note (prose, not a
generated list), save it as a proper page first (e.g. `overview`) — import will **not** take
a root `index.md`, because the wiki regenerates its own catalog there. Same for a root `log.md`.

**Execute.**
- **Local-clone mode** (admins/curators): know the CLI's limits — `commonground import` is
  **frontmatter-only** normalize (backfill/validate; it never merges or restructures bodies). So:
  stage the kept clusters into a temp folder **preserving relative paths** (or use the folder
  directly when everything is kept as-is); staging never moves a file — when the user chose to
  **file them**, the cluster name goes into each staged file's `tags:`, which is what groups it, so
  a flat folder stays flat on disk. For clusters marked **Normalize**, do the
  restructuring/merging yourself in-session first, editing the staged files; then run
  `commonground import <staged folder>`. It overlays the folder onto the clone, **backfills
  missing/invalid frontmatter** (carrying `tags`/`aliases`/`created` onto the schema and preserving
  any other frontmatter key verbatim — an imported `tags:` is the source folder's own **legacy label**, not
  a category, so assign the charter category the cluster belongs to as well), **regenerates
  `index.md`** from the whole wiki — it never imports the source folder's own `index.md`, `log.md`
  or `CLAUDE.md`, and never overwrites anything already under `sources/`. Then it commits and
  pushes. **Relay the CLI's receipt to the user verbatim** — it names what wasn't imported and
  what frontmatter it couldn't carry; that's the answer to "can I retire the original?", so don't
  summarise it away. One thing to say out loud: each page keeps its **real** date (its own
  frontmatter date, else the file's modification time), so genuinely old notes will read as old and
  `/commonground:lint` may flag them **stale** — that's the honest signal, not a bug.
- **MCP mode (no local clone):** do the normalize in-session, honoring each cluster's triage
  choice (as-is = body untouched + frontmatter backfill; normalize = restructure/merge). Read the
  folder yourself (your Read / Glob tools — a remote MCP can't reach local files). For each doc:
  derive a `pageId` that mirrors the source folder's own structure — a flat folder stays flat, since
  the cluster the user agreed to rides in `tags:`, not in the path — and write **valid frontmatter**
  (title from the H1/filename, and `updated` = the doc's own date if it has one,
  else today — don't restamp real modification dates). Don't add a `scope`: an imported folder never
  declared one, and inventing `company` puts an org word on somebody's own notes. **Carry the source's frontmatter across**: `tags`/`aliases`/`created` are
  first-class fields, and any other key rides along untouched; only a near-miss of a contract key
  (`Tags`) has to go, and say so when it does. An imported `tags:` is the source folder's own **legacy
  label**, not a category — add the charter category for the cluster this page came from alongside
  it, or the import re-creates a free-form vocabulary on the hero onboarding path.
  Prefer **updating** an existing page over a near-duplicate (`get_index` first). Persist each
  with `save_page` (CAS-guarded: on a conflict, `get_page` for the fresh `baseSha`, merge, retry).
  Stage genuinely-raw material under `sources/` with `stage_sources` where it helps, but land
  curated pages via `save_page`.

**Post-import — say where the wiki lives now (there are two copies, and only one is the wiki).**
Import **copies**; it never adopts the folder. So, in this order:
1. Re-read `get_coverage` / the index and report how the import mapped onto the **charter's
   structure** — which sections it filled, which are still thin.
2. Name the canonical copy: **the wiki folder is the wiki** — the copy CommonGround syncs,
   publishes and serves. The folder you imported was left untouched and is now a separate copy that
   will drift.
3. **Delete the temp staging folder** if this flow created one (it's a scratch copy, not the wiki —
   the CLI receipt names it as the source). Never delete the user's own source folder.
4. Offer the convergence choice when they imported a folder they actually work in: **repoint their
   editor** at the wiki folder (plain markdown — it opens in Obsidian or any editor; the path is in
   this project's `./CLAUDE.md`) so there is one copy again, or **keep working in the original** and
   accept that every change needs another `commonground import` to reach the wiki. Their call; just don't leave it unsaid.

That leads into step 6.

## 6. Shared tail — fill the remaining gaps

Whichever branch ran, finish on the gap-loop (the same gap-fill `/commonground:lint` offers,
inline): re-check
the **charter's Structure list** against what exists, take the still-empty/thin sections
most-impactful-first — offer the pick as an AskUserQuestion (the top **3** gaps + "somewhere
else") — and
for each, interview + draft + confirm + persist one page at a time, skipping what the user can't
answer yet. Every page you draft here gets a `summary:` that **partitions** with its title instead
of echoing it — the title is the page's name, the summary is what is *inside* it, so `Lightbug` +
`Fantasy novel, 3 POV chapters drafted, magic system unresolved, paused Nov 2025` beats `Lightbug —
fantasy novel (on hold)` + `Fantasy novel, on hold`. Seeding is where a wiki's first twenty titles
get written, and a title that swallows the summary is written once and read forever. Stop when the user is done or the important sections are covered; they can always run
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
- **Local-clone mode:** write the files (each with its own `summary:`), then **offer**
  `/commonground:push --message "seeded the wiki from the <discipline> interview — N pages"` (or
  `"imported <folder>"`) — the wiki is seeded either way; publishing is a separate, asked-for step.
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

**Then hand off to pointing — that is the next beat, not the previous one.** A wiki with content in
it is only useful where the user actually works, so close by offering
**`/commonground:point <wiki>`** in the repos they spend their time in: *"Run
`/commonground:point acme-handbook` in any project and I'll answer from this there too."* Say it even
when THIS project is already pointed at the wiki — one project is rarely all of them. In MCP mode,
a project pointed during a live session needs a restart before its connector follows.

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
