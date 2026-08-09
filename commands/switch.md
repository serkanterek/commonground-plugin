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
- **In MCP mode, the connector does not follow this switch.** Its access was granted to one wiki at
  the moment the user authorised it, and it keeps serving that wiki until it is authorised again. So
  a switch can leave the connector reading wiki A while the CLI answers for wiki B.

That last point is a real limitation, not a bug to work around — say so if it applies. Today the
honest answer is: **local-clone mode is the multi-wiki path**; in MCP mode a machine effectively
reads one wiki, and changing it means re-authorising the connector from
https://app.commongroundapp.io. If the user needs both wikis live at once, local-clone mode is what
does that.

It is at least **detectable**: `/commonground:status` compares the wiki `get_started` reports
against the one the CLI resolved, and says so when they differ. Point them there if they want to
know which wiki the connector is actually on.

## Related

- **`/commonground:status`** — which wiki is active, which rule chose it, and this project's state.
- **`/commonground:initialize`** — bind THIS project to a wiki (outranks the active one, always).
