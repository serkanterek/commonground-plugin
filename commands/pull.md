---
description: Get the latest into your local wiki clone — shows what's coming, and never overwrites your own work without asking
---

Bring this project's local CommonGround clone up to date with the hosted wiki. **Everyone can
pull**, including read-only members. Pulling never overwrites your own work on its own: if there's
a clash it stops and asks.

> **Normally local-clone mode only** — in MCP mode the wiki is live through the connector, so
> there's nothing to pull. **One exception:** if the CommonGround tools are gone or failing (a
> plugin update can drop the connector mid-session), `commonground pull` still works — it
> authenticates as the signed-in **device**, not through the connector — and gives the user a
> readable copy of the wiki on disk to keep working from. Ask for an explicit OK first: it writes
> files into a project that chose not to have any. If `commonground status` says the project isn't
> connected or there's no clone, point the user at `/commonground:initialize`.

> **Which team, on a machine signed in to several.** A bare `commonground pull` resolves the team
> from this project's own router block, so an initialized project needs no argument even when the
> user has several wikis. Failing that it uses their **active wiki** (`/commonground:switch`). It
> only asks when neither applies — an uninitialized directory with no active wiki chosen — and then
> it fails with `more than one wiki available — say which: …`, which lists the ids. Pass one as
> `commonground pull <wiki>`, and offer `/commonground:switch` (choose one for this machine) or
> `/commonground:initialize` (bind this project) so it stops asking.

Run `commonground pull` and report the outcome in plain language:

- **Cloned** — first time. The CLI prints `Creating your wiki folder at <path>` *before* it makes
  anything, so the user is never surprised by a new directory. **Relay that path** — it is where
  their team's context now lives, and it's the folder they'd open in an editor. Then offer to answer
  a question from it. If they'd rather it lived somewhere else, that's `commonground relocate
  <folder>`, which moves the files and updates this project's `./CLAUDE.md`.
- **Up to date** — nothing incoming. If it also mentions **unpublished changes**, tell the user
  they have local work that hasn't been published and offer `/commonground:push`.
- **Updated** — it fast-forwarded. Report the pages that came in, by name (the CLI prints the
  receipt), so the user knows what changed.
- **Blocked** — the hosted wiki moved *and* the user has local work that would be overwritten.
  **Nothing was changed.** Show both sides: what's incoming, and that their own work is at stake.
  Then offer the choice — with the `AskUserQuestion` tool (multiple-choice UI) if it's available in
  this session, as a plain question otherwise. **Word it in the wiki's frame** — shared or personal,
  from the same source `/commonground:push` §0 uses (the SessionStart hook, the `CLAUDE.md` router
  block, or `commonground status`): on a shared wiki the incoming side is a teammate's publish; on a
  personal one it's the user's own other machine or Chat session.
  1. **Publish mine first** — run `/commonground:push` (admins/curators). Best when their local work
     is good and should go out — to the team on a shared wiki, or to every other Claude the user uses
     on a personal one.
  2. **Take the published version instead** — run `commonground pull --take-remote`. Their local work
     is snapshotted to a recoverable `draft/…` branch first, so nothing is lost — say that plainly,
     it's what makes this safe to choose.
  3. **Decide later** — do nothing; the clone stays exactly as it is.

Never run `--take-remote` without an explicit yes: it replaces the working copy. When it does run,
report the draft branch it saved their work on, so they know how to get it back.
