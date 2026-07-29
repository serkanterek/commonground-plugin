---
description: Get the team's latest into your local wiki clone — shows what's coming, and never overwrites your own work without asking
---

Bring this project's local CommonGround clone up to date with the hosted wiki. **Everyone can
pull**, including read-only members. Pulling never overwrites your own work on its own: if there's
a clash it stops and asks.

> **Normally local-clone mode only** — in MCP mode the wiki is live through the connector, so
> there's nothing to pull. **One exception:** if the CommonGround tools are gone or failing (a
> plugin update can drop the connector mid-session), `commonground pull` still works — it
> authenticates as the signed-in **device**, not through the connector — and gives the user a
> readable copy of the wiki on disk to keep working from. Ask for an explicit OK first: it writes
> files into a project that chose not to have any. Write it as `commonground pull <team>` (the team
> name from `commonground status`) — a bare `commonground pull` fails when more than one team is
> logged in. If `commonground status` says the project isn't connected or there's no clone, point
> the user at `/commonground:initialize`.

Run `commonground pull` and report the outcome in plain language:

- **Cloned** — first time: the wiki now lives at the printed path. Say so and offer to answer a
  question from it.
- **Up to date** — nothing incoming. If it also mentions **unpublished changes**, tell the user
  they have local work that hasn't been published and offer `/commonground:push`.
- **Updated** — it fast-forwarded. Report the pages that came in, by name (the CLI prints the
  receipt), so the user knows what changed.
- **Blocked** — the hosted wiki moved *and* the user has local work that would be overwritten.
  **Nothing was changed.** Show both sides: what's incoming, and that their own work is at stake.
  Then offer the choice — with the `AskUserQuestion` tool (multiple-choice UI) if it's available in
  this session, as a plain question otherwise:
  1. **Publish mine first** — run `/commonground:push` (admins/curators). Best when their local work
     is good and should reach the team.
  2. **Take the team's version** — run `commonground pull --take-remote`. Their local work is
     snapshotted to a recoverable `draft/…` branch first, so nothing is lost — say that plainly,
     it's what makes this safe to choose.
  3. **Decide later** — do nothing; the clone stays exactly as it is.

Never run `--take-remote` without an explicit yes: it replaces the working copy. When it does run,
report the draft branch it saved their work on, so they know how to get it back.
