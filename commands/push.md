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

## 2. Confirm — ONE prompt, and it is the guard's

**Do not raise your own yes/no question here.** The `PreToolUse` publish guard intercepts
`commonground push` and asks the user to approve it, in a dialog that names what the publish does and
quotes your `--message`. It ships in this same plugin, so it is always present when this command is.
Asking first and then triggering it gives the user two prompts back to back for one decision — and a
person who has just clicked through one prompt clicks through the next without reading it, which
costs more safety than the extra question buys.

So the shape is: **preview as text → run the push → the guard's dialog is the confirmation.**

Say what is about to be published, in plain prose, **in the frame from §0** — shared: *"I'll publish
these 3 pages to the team wiki"*, their teammates' Claude starts answering from it; personal: *"I'll
publish these 3 pages to your wiki"*, it becomes what every Claude they use starts from, on any
machine. Never describe a personal wiki in language about teammates. Then run it. If they decline the
dialog, nothing is published — take that as a no and stop, don't re-ask or reach for another route.

**Consent is per publish, and an earlier yes never satisfies this one.** A yes from ten minutes ago
authorized *that* publish, not this one. Never infer a standing go-ahead from "they asked me to push
earlier", from "publishing is how this task finishes", or from the wiki being personal rather than
shared. Every publish goes through the dialog, every time.

**Never route around this step.** Running the bundled `bin/commonground push` binary directly, or any
other path that reaches the same write unprompted, is the one thing that recreates the bug this
section exists to prevent — it is how the guard was defeated on 2026-08-04 (SER-217). That includes
chaining the preview and the publish into a single shell command to make it look read-only. **The
guard is never to be worked around**: do not edit, disable or bypass the hook, and do not look for a
command shape that slips past it. If it fires, the answer is to let the dialog reach the user and
take whatever they say. You will not see their answer, so a publish that simply succeeds means they
said yes — not that the guard failed to fire.

The one question you DO ask yourself is the deletion one, and §3 says when: ask it **before** you run
the push, not after, so the user gets one question and one dialog rather than four prompts.

Run `commonground push --message "<what this session did>"` — one session-scale
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
along inside a bigger change set. This is the one question you ask directly (`AskUserQuestion` when
it's available), because the publish dialog cannot ask it — it is a decision about *what to publish*,
not about whether to publish.

**Ask it off the §1 preview, before you run anything.** The dry-run already lists removals, so you
can settle the deletion and then make a single `--allow-deletes` run: one question, one dialog. The
`needs-delete-confirm` return exists for when you didn't — it is a backstop, not the route. Either
way, at that point **nothing was published**. Make the removal impossible to miss:

- Name every page being removed, explicitly and separately from the adds and updates.
- Say plainly what is lost, in the §0 frame: shared → *the whole team loses access to them*;
  personal → *it's gone from every Claude you use, on every machine*. Either way, past versions
  remain in the wiki's history, but the page itself goes away.
- Ask for a yes on the deletion **specifically**, separately from the rest of the change set. If they
  only meant to publish the other changes, the fix is to restore the deleted file(s) in the clone and
  push again — don't talk them into it either way.

Only on that explicit yes, run `commonground push --allow-deletes --message "…"` (add `--mine` too if
you're in the conflict case below). The guard's dialog then names the removal too, because the flag
is on the command line — that is the confirmation of the publish itself, and it is not a sign your
question went unheard. Report exactly what was removed.

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
