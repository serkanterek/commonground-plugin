---
description: Publish your local wiki changes — previews exactly what will be published and asks before anything lands
---

Publish this project's local CommonGround clone to the published wiki. This is **the** outward-facing
step in local-clone mode: everything before it — ingest, edits, lint fixes, seeding — happened only
in the user's own copy.

## 0. Establish the FRAME before you say anything

Who this wiki is for changes what publishing *means*, and getting it wrong is the single most jarring
thing this command can do. A person with a personal wiki asked "shall I publish this to the team?"
learns the product does not know who they are.

The frame is already in this session — take the first one available, and don't ask the user:

- the SessionStart hook's context line (it names the wiki in its own voice);
- this project's `./CLAUDE.md` router block, written by `/commonground:initialize`;
- `commonground status`, or `get_coverage`'s `audience` field.

| Frame | Publishing means | Never say |
|---|---|---|
| **Personal** (`just-me`) | their other machines and Chat sessions start from it | "the team", "your teammates", "everyone" |
| **Shared** (`my-team` / `whole-company`) | the rest of the team's Claude starts from it | — |

If you genuinely cannot tell, say "publish" and "the published wiki" and name no audience at all.
Neutral is always safe; a wrong guess is not.

**Publishing is admins and curators only.** The CLI reports this rather than failing, and the server
independently rejects a member's push. Note the asymmetry that makes local-clone mode work: *editing*
the clone is open to every role, because it's the user's own working copy. Only this step is gated.
On a personal wiki the roles question never arises — don't raise it.

> **Local-clone mode only.** In MCP mode there is no separate publish step — `save_page` already
> wrote straight to the hosted wiki, which is why that mode asks before each write instead.

You never need to commit anything by hand — `push` commits the user's changes for them. Lead with
pages and publishing rather than git. The CLI does print `commit(s)` and `N ahead, N behind` in a few
places; when the user is reading that output, use its words rather than pretending it said something
else — an explanation that contradicts the screen is worse than the jargon.

## 1. Preview first — always

Run `commonground push --dry-run`. This changes nothing, locally or on the server, and reports the
pages that *would* be published (including brand-new pages that were never staged in git).

- **Any file the preview says doesn't parse** — deal with that first, before asking to publish.
  `push` refuses the whole change set over it (§3b), so confirming now only to be stopped
  afterwards asks the user the same question twice and answers it differently. The preview reports
  these even when there is nothing to publish, and `push` still refuses then — so relay them rather
  than stopping at "nothing to publish".
- **Nothing to publish, nothing broken** — say so and stop.
- Otherwise, show the user the page list in plain language: what's being added, what's being
  updated.

## 2. Confirm

Ask for an explicit go-ahead before anything is published — with the `AskUserQuestion` tool
(multiple-choice UI) if it's available in this session, as a plain question otherwise.

**This confirmation is not optional, and it is not satisfied by an earlier one.** Consent is per
publish: a yes from ten minutes ago authorized *that* publish, not this one. Never infer a standing
go-ahead from "they asked me to push earlier", from "publishing is how this task finishes", or from
the wiki being personal rather than shared. If you did not ask for THIS publish, you do not have it.

**Never route around this step.** Running the bundled `bin/commonground push` binary directly, or
any other path that reaches the same write without asking, is the one thing that recreates the bug
this section exists to prevent — it is how the guard was defeated on 2026-08-04 (SER-217). A
`PreToolUse` guard now also refuses the publish, and **that refusal is never to be worked around**:
do not edit, disable or bypass the hook, and do not look for a command shape that slips past it.
If it fires, the answer is to ask the user.

**Word the question in the frame from §0.** Shared: *"Publish these 3 pages to the team wiki?"* —
their teammates' Claude will start answering from it. Personal: *"Publish these 3 pages to your
wiki?"* — it becomes what every Claude they use starts from, on any machine. Never offer a personal
wiki a choice phrased around teammates.

On confirmation, run `commonground push --message "<what this session did>"` — one session-scale
sentence saying what changed and why, which becomes the commit message and is the only record of
your reasoning that outlives the session. Never restate what the diff shows ("updated pages"). It
publishes and reports the receipt (the pages published) — unless it comes back
**needs-delete-confirm** (§3) or **needs-unparseable-fix** (§3b), in which case nothing was
published and that section takes over. If this publishes a change someone asked
for, close their request with `resolve_suggestion` (`applied`) and pass the `commitId` push reports
— that's the commit their suggestion produced.

## 2b. If the user is a member (`read-only`) — shared wikis only

*(Unreachable on a personal wiki: its only user is its admin. Skip this section entirely there.)*


Nothing was published, and **nothing was lost** — their work is still in the clone. Say that first;
"your role is read-only" on its own reads like the work was rejected.

The CLI names the pages they have unpublished. Offer to file them as **`suggest_change`** — one per
page, carrying what they wrote and why it matters — so a curator can fold it in. That is a member's
real publish path, and it is the difference between their knowledge reaching the team and sitting on
their disk. Don't offer to make them a curator; that's the admin's call, not a step in this flow.

## 3. If it would REMOVE pages (the deletion guardrail)

Deleting a page is the one change that takes something away rather than adding it, so it never rides
along inside a bigger change set.
If the preview lists removals — or `push` comes back **needs-delete-confirm** — **nothing was
published**. Stop and make the removal impossible to miss:

- Name every page being removed, explicitly and separately from the adds and updates.
- Say plainly what is lost, in the §0 frame: shared → *the whole team loses access to them*;
  personal → *it's gone from every Claude you use, on every machine*. Either way, past versions
  remain in the wiki's history, but the page itself goes away.
- Ask for a **separate** yes for the deletion, even if they already approved the push. If they only
  meant to publish the other changes, the fix is to restore the deleted file(s) in the clone and
  push again — don't talk them into it either way.

Only on that explicit yes, run `commonground push --allow-deletes` (add `--mine` too if you're in
the conflict case below). Report exactly what was removed.

## 3b. If a page doesn't parse (the catalog guardrail)

If `push` comes back **needs-unparseable-fix**, **nothing was published** — and **nothing was
lost**: every file is still in the clone exactly as written. Say both, in that order.

A page whose frontmatter doesn't parse can be published but not *catalogued*, so it reaches nobody:
it's absent from the index every session starts from, from retrieval, and from every health check.
That's what makes this worth stopping for, and it's what to explain — not the YAML.

- Relay each file **with the reason the CLI gave** (`invalid frontmatter: updated: Required`,
  `missing frontmatter block`). The reason names the missing field, so it *is* the fix.
- **The right first move is to fix the file**, not to override. Open it in the clone, repair the
  frontmatter, and push again. Usually one line.
- **Never reach for `--allow-unparseable` on your own initiative.** Unlike a deletion, this refusal
  is cheap to bulldoze past, and bulldozing is the one thing that recreates the original bug.
- If the user asks to publish as-is anyway — after an import that left a file unsalvageable, say —
  run `commonground push --allow-unparseable` and tell them plainly what lands: the page is
  published *and* listed in the catalog as an `(unparseable)` placeholder, flagged for attention.
  Visible, not readable. "Published and flagged" is not the same promise as "published".

## 4. If the published wiki moved (the conflict case)

If `push` comes back **blocked**, the published wiki changed since this clone last pulled. **Nothing
was published.** Who changed it depends on the §0 frame, and saying it wrong is confusing rather than
merely impersonal — on a personal wiki "someone else edited this" is alarming and false:

- **Shared** — a teammate published something since this clone last pulled.
- **Personal** — *they* changed it somewhere else: another machine, or Chat.

Show both sides using the CLI's own labels, then offer the choice (`AskUserQuestion` when available):

1. **Keep my version of the pages both sides changed** — run `commonground push --mine`. This replays
   only the pages the user actually changed on top of the published tip: their version wins where
   both sides touched the same page, their removals still apply, and everything else there —
   new pages *and* edits to pages the user didn't touch — is kept. It never force-pushes, and
   the pre-merge state is saved on a recoverable `draft/…` branch.
2. **Take the published version instead** — run `commonground pull --take-remote`. Their work is
   snapshotted to a `draft/…` branch first, so it's recoverable.
3. **Decide later** — do nothing; both sides stay as they are.

Never pick one of these for the user. When the choice runs, report what landed and — for options 1
and 2 — the draft branch holding the previous state.
