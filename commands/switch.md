---
description: (renamed) — use /commonground:point
argument-hint: "[wiki] [mcp|local]"
---

This verb was renamed to **`/commonground:point`**, which now does both jobs: it aims THIS project at
a wiki, and the wiki you last pointed at is also what unbound folders resolve to. There is no longer
a separate machine-wide "switch" for the user to reason about.

Tell the user that, in one sentence, then **carry out this invocation for them** — do not make them
re-type it. Invoke the `commonground:point` command with the same arguments they passed here and
follow its procedure from the top.

A renamed command that merely announces its new name is a dead end: the user asked for something,
and the answer "that's called something else now" leaves them worse off than before they typed it.

> **Maintainers:** this stub exists for exactly one release (0.8.0) because deployed servers, cached
> docs and the user's own muscle memory still say `switch`. **Delete it at 0.9.0** along with
> `initialize.md`, and drop both from the pinned command set in `scripts/command-safety.test.ts`.
