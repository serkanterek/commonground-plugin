---
description: Change the active CommonGround wiki — lists the wikis you can reach and makes one of them active
---

Change which wiki this machine works with when a project hasn't named one itself. Use when the user
has more than one wiki, or asks which one they're on.

A user's wikis can be of different **scopes** — one personal, one their team's, one the whole
organization's. This command switches between *wikis*; it never changes anyone's team membership.

## 1. Show them what they have

Run `commonground use` with no argument. It lists every wiki this machine is signed in to, marks the
**active** one with `*`, and marks the one **this project** is bound to.

Relay it in plain language — wiki names, never bare UUIDs. If the CLI reports `no team logged in`,
stop and point at **`/commonground:initialize`**; there is nothing to switch between.

If there's only one wiki, say so and stop. There is no choice to make, and running the switch would
imply there was.

## 2. Ask which one

Ask the user which wiki they want, by name. Don't guess, don't default to the first, and don't pick
"the one they used last" — an ambiguous switch that resolves itself is the exact failure this
command exists to remove.

## 3. Switch

Run `commonground use <wiki>` with the name they gave (an id, or a unique prefix of either, also
works). Then relay what the CLI reports:

- **It confirms the new active wiki.** Say which one, and their role in it.
- **It may add that THIS project stays where it is.** That happens when the current project was
  bound to a different wiki by `/commonground:initialize`. This is correct, not a failure: a project
  that named its wiki always keeps it, so a machine-wide switch can never silently retarget work in
  a repo the user isn't even looking at. Say it plainly, and offer the one command that does move
  this project: `commonground init <wiki>`.
- **If the name matched more than one wiki**, the CLI refuses and lists the candidates. Take that
  back to the user rather than choosing for them.

## 4. Say what actually changed

Be concrete, because "active" has a narrow meaning:

- Commands in projects **not** bound to a wiki now resolve to the new one — `status`, `pull`,
  `push`, `lint`, `coverage`.
- Projects **bound** by `initialize` are unaffected. That's every project the user set up
  deliberately.
- **The MCP connector follows the PROJECT, not this switch.** In a project bound by
  `/commonground:initialize`, the connector answers for that project's wiki — `initialize` records
  it, and the connector reads it on every session. A machine-wide switch doesn't move that, and
  isn't meant to.

A project only tells the connector anything if `init` **recorded** its wiki, which plugin 0.7.4 was
the first to do. So there are two cases where the connector still falls back to whichever wiki it was
authorised for — and in both the user can be reading the wrong wiki without any sign of it:

- **The project was never bound** — nothing names a wiki here at all.
- **The project was bound by 0.7.3 or earlier.** It has a router block and looks fully set up, and
  that is the trap: nothing about it announces that the connector part is missing. Re-running
  `commonground init <wiki>` in that project is what records it.

Both are fixed the same way — bind (or re-bind) the project. Re-authorising the connector is not the
fix; it only changes the fallback.

Two things to know if it comes up:

- The wiki is read when the session **starts**, so a project bound or re-bound during this session
  needs a restart before the connector follows it.
- `/commonground:status` compares the wiki `get_started` reports against the one the CLI resolved.
  Send them there rather than asserting agreement you have not checked.

## Related

- **`/commonground:status`** — which wiki is active, which rule chose it, and this project's state.
- **`/commonground:initialize`** — bind THIS project to a wiki (outranks the active one, always).
