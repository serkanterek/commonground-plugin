---
description: Publish your local wiki changes to the team — previews exactly what will be published and asks before anything lands
---

Publish this project's local CommonGround clone to the hosted wiki so the rest of the team's Claude
starts from it. This is **the** outward-facing step in local-clone mode: everything before it —
ingest, edits, lint fixes, seeding — happened only in the user's own copy.

**Publishing is admins and curators only.** The CLI reports this rather than failing, and the server
independently rejects a member's push. Note the asymmetry that makes local-clone mode work: *editing*
the clone is open to every role, because it's the user's own working copy. Only this step is gated.

> **Local-clone mode only.** In MCP mode there is no separate publish step — `save_page` already
> wrote straight to the hosted wiki, which is why that mode asks before each write instead.

You never need to commit anything by hand — `push` commits the user's changes for them. Don't
mention git or commits; talk about pages and publishing.

## 1. Preview first — always

Run `commonground push --dry-run`. This changes nothing, locally or on the server, and reports the
pages that *would* be published (including brand-new pages that were never staged in git).

- **Nothing to publish** — say so and stop.
- Otherwise, show the user the page list in plain language: what's being added, what's being
  updated.

## 2. Confirm

Ask for an explicit go-ahead before anything reaches the team — with the `AskUserQuestion` tool
(multiple-choice UI) if it's available in this session, as a plain question otherwise. Publishing is
outward-facing: their teammates' Claude will start answering from it.

On confirmation, run `commonground push` and report the receipt (the pages published). If this
publishes a change someone asked for, close their request with `resolve_suggestion` (`applied`) and
pass the `commitId` push reports — that's the commit their suggestion produced.

## 2b. If the user is a member (`read-only`)

Nothing was published, and **nothing was lost** — their work is still in the clone. Say that first;
"your role is read-only" on its own reads like the work was rejected.

The CLI names the pages they have unpublished. Offer to file them as **`suggest_change`** — one per
page, carrying what they wrote and why it matters — so a curator can fold it in. That is a member's
real publish path, and it is the difference between their knowledge reaching the team and sitting on
their disk. Don't offer to make them a curator; that's the admin's call, not a step in this flow.

## 3. If it would REMOVE pages (the deletion guardrail)

Deleting a page takes it away from everyone, so it never rides along inside a bigger change set.
If the preview lists removals — or `push` comes back **needs-delete-confirm** — **nothing was
published**. Stop and make the removal impossible to miss:

- Name every page being removed, explicitly and separately from the adds and updates.
- Say plainly that the whole team loses access to them (past versions remain in the wiki's history,
  but the page itself goes away).
- Ask for a **separate** yes for the deletion, even if they already approved the push. If they only
  meant to publish the other changes, the fix is to restore the deleted file(s) in the clone and
  push again — don't talk them into it either way.

Only on that explicit yes, run `commonground push --allow-deletes` (add `--mine` too if you're in
the conflict case below). Report exactly what was removed.

## 4. If the hosted wiki moved (the conflict case)

If `push` comes back **blocked**, the team's wiki changed since this clone last pulled. **Nothing
was published.** Show both sides — "theirs" and "yours", as the CLI prints them — then offer the
choice (`AskUserQuestion` when available):

1. **Keep my version of the pages we both changed** — run `commonground push --mine`. This replays
   only the pages the user actually changed on top of the team's latest: their version wins where
   both sides touched the same page, their removals still apply, and everything else the team did —
   new pages *and* their edits to pages the user didn't touch — is kept. It never force-pushes, and
   the pre-merge state is saved on a recoverable `draft/…` branch.
2. **Take the team's version instead** — run `commonground pull --take-remote`. Their work is
   snapshotted to a `draft/…` branch first, so it's recoverable.
3. **Decide later** — do nothing; both sides stay as they are.

Never pick one of these for the user. When the choice runs, report what landed and — for options 1
and 2 — the draft branch holding the previous state.
