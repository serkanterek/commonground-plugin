---
description: Change the active CommonGround wiki — lists the wikis you can reach and makes one of them active
---

Change which wiki this machine works with when a project hasn't named one itself. Use when the user
has more than one wiki, or asks which one they're on.

A user's wikis can be of different **scopes** — one personal, one their team's, one the whole
organization's. This command switches between *wikis*; it never changes anyone's team membership.

## 1. Show them what they have

Run `commonground use` with no argument. It lists every wiki the user is a **member** of — asked of
the server, not of this machine's sign-ins — marks the **active** one with `*`, marks the one **this
project** is bound to, and marks any reached `via your other sign-in` (see below).

Relay it in plain language — wiki names, never bare UUIDs. If the CLI reports `no team logged in`,
stop and point at **`/commonground:initialize`**; there is nothing to switch between.

If there's only one wiki, say so and stop. There is no choice to make, and running the switch would
imply there was.

**One caveat, and it is the reason this step changed.** If the output ends with a parenthetical note
that it was *"listed from this machine's sign-ins"*, the list may be **incomplete** — a wiki joined
recently will be missing from it. Say so rather than concluding a wiki does not exist. That
conclusion was the bug: the CLI used to list its own login cache and present it as the universe, so a
user who created a second wiki in the web app came back here and was told, as a fact, that it wasn't
there.

The note says **why** it fell back, and the three reasons have three different fixes — relay the one
the note names, never a generic "try later":

- **"no longer valid"** — the sign-ins themselves are dead (they left those wikis, or the device was
  revoked). `commonground login` is the fix, and waiting is not.
- **"could not be reached"** — offline or an outage. Waiting is the fix, and logging in again is not.
- **"cannot list your memberships"** — the server is older than this plugin. Neither waiting nor
  logging in changes it; the list works again when the server updates.

## 1b. If a wiki they expect is missing

Two different situations, and only one is a problem:

- **They just created it, or were just invited.** Being a member is all it takes now — one sign-in
  reaches every wiki you belong to, so it should appear as soon as the server can be reached. There
  is nothing to log into. If it still isn't listed, they aren't a member yet (an invite not accepted,
  or a wiki created under a different account).
- **They want a NEW wiki.** Wikis are created in the web app — **app.commongroundapp.io**, "+ New
  wiki". You cannot create one from here; say that plainly and point them there rather than looking
  for a command. Once it exists and they're a member, it is usable here immediately.

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
  `push`, `lint`, `coverage`. This works for a wiki marked `via your other sign-in` too: the
  credential authenticates the person and membership authorizes the wiki, so there is no separate
  login step. The mark matters in one case only — offline, that wiki is the one that can't be
  reached, because the credential being presented was minted for a different one.
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
