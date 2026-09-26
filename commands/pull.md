---
description: "Bring the latest published pages into your local wiki folder. Shows what's coming first and never overwrites your work without asking."
argument-hint: "nothing needed; name a wiki if this project reads several"
---

Bring this project's local CommonGround clone up to date with the hosted wiki. **Everyone can
pull**, including read-only members. Pulling never overwrites your own work on its own: if there's
a clash it stops and asks.

**Running the CLI.** Every `commonground …` line in this file runs as
`node "${CLAUDE_PLUGIN_ROOT}/bin/commonground" …`. That form works from both the Bash and the
PowerShell tool; the bare word works only in Bash.

> **Normally local-clone mode only** — in MCP mode the wiki is live through the connector, so
> there's nothing to pull. **One exception:** if the CommonGround tools are gone or failing (a
> plugin update can drop the connector mid-session), `commonground pull` still works — it
> authenticates as the signed-in **device**, not through the connector — and gives the user a
> readable copy of the wiki on disk to keep working from. Ask for an explicit OK first: it writes
> files into a project that chose not to have any. If `commonground status` says the project isn't
> connected or there's no clone, point the user at `/commonground:point`.

> **Which team, on a machine signed in to several.** A bare `commonground pull` resolves the team
> from this project's own router block, so a project that has been pointed at a wiki needs no
> argument even when the user has several. Failing that it uses the wiki they most recently pointed
> at. It only asks when neither applies — a folder nobody has pointed anywhere — and then it fails
> with `more than one wiki available — say which: …`, which lists your wikis by name and id. Pass one as
> `commonground pull <wiki>`, and offer **`/commonground:point`** so it stops asking.

> **A project that reads several wikis pulls each of them.** A bare `commonground pull` brings in
> the **primary** only — the SessionStart hook and `commonground status` name the others the
> project also reads. Run `commonground pull <wiki>` for each further wiki in turn, and report each
> outcome under the wiki's name rather than folding them into one line: "updated" for the personal
> wiki and "blocked" for the team wiki are two different situations, and only one of them needs a
> decision. The same per-wiki rule holds for `/commonground:push`.

Run `commonground pull` — passing `$ARGUMENTS` as the wiki when it names one, bare otherwise
(the project's own binding resolves it) — and report the outcome in plain language:

- **A `Heads up: you are inside the folder of …` line first** — the user is standing inside one
  wiki's clone while the pull addressed another. Nothing wrong happened, but relay both halves
  verbatim and confirm which wiki they mean before reporting the rest; the line names the command that
  addresses the one they are standing in.

- **Cloned** — first time. The CLI prints `Fetching your wiki into <path>` *before* it makes
  anything, so the user is never surprised by a new directory. (If it says an earlier attempt left
  an unfinished folder there and it is clearing it: that is a retry repairing itself — relay it,
  nothing of theirs was removed.) **Relay that path** — it is where
  their team's context now lives, and it's the folder they'd open in an editor. Then offer to answer
  a question from it. If they'd rather it lived somewhere else, offer to move it for them — you
  run `commonground relocate "<folder>"`, which moves the files and records the new spot.
- **Up to date** — nothing incoming. If it also mentions **unpublished changes**, tell the user
  they have local work that hasn't been published and offer `/commonground:push`. For a member the
  line says the work is safe on this machine and offers a suggestion for a curator instead; relay
  that rather than offering a publish they cannot make, and offer `suggest_change` only when this
  session has it (otherwise the routes in `/commonground:push` §2b).
- **Updated** — it fast-forwarded. Report the pages that came in, by name (the CLI prints the
  receipt), so the user knows what changed. A pull brings the change in around any local work it
  does not touch, so the receipt may add that the user **still has unpublished pages**: relay that
  line too and offer `/commonground:push`. For a member the line says the work is safe on this
  machine and offers a suggestion instead; relay that rather than offering a publish they cannot
  make (the same routes as **Up to date**).
- **Blocked** — the hosted wiki moved *and* a page the user changed here (edited, added or deleted)
  is one the incoming change also changes, or they hold local commits. **Nothing was changed.** Show
  both sides: what's incoming, and the pages the receipt names as ones the incoming change also
  changes (`they change <pages>, which you changed here too`): those are what stopped it. Never
  say all their work is at stake: when the receipt adds that they have more pages not published yet
  which the incoming change does not touch, say those are in nothing's way. Two stops name no page.
  When the receipt says they have unpublished commits (*a pull cannot bring the change in around
  them*), those commits are what stopped it. When it says the incoming change *would write over a
  file here*, git itself refused the move over a file the check before it did not catch: relay that
  line as written and never guess which page it means. The choice below is the same for both.
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

  On a Mac or Windows clone whose publishes `push` refuses over a pair of pages that differ only in
  letter case (push.md §3c), option 1 is not available until this pull lands: offer 2, and say their
  work waits on the draft branch for them to bring back and publish. The receipt leaves the publish
  line out there, and prints the pair's own sentence instead. When it says instead that *the
  incoming change renames or removes* one of the pair, *which ends the pair*, relay that line: the
  rename they were waiting for is in this very pull, so never tell them to wait for a curator, and
  once it is in (option 2 brings it), this folder can publish again.
- **Blocked by a file git ignores** — the receipt says *a file this machine's git ignores sits
  where one of them goes* (for several, *files this machine's git ignores sit where they go*) and
  names it. **Nothing was changed.** This machine's git settings hide that file, so no publish
  carries it: never offer publishing first here. Offer, worded and asked as for **Blocked**: move
  or rename that file, then pull again (`/commonground:pull`); or take the published version
  (`commonground pull --take-remote`), whose `draft/…` branch holds that file by name, so it is
  saved too; or decide later. Relay a line about other work not published yet as **Blocked** does.
- **Cannot bring in as an update** — the receipt says the incoming change is one *this machine
  cannot bring in as an update*, and that nothing of theirs is at stake. It happens on a Mac or
  Windows clone when the change updates both names of a pair of pages that differ only in letter
  case (or in how their accents are encoded): this disk holds the pair as one file, which can hold
  one of the two new texts, never both. **Nothing was changed.** Relay the pair's line as written,
  say nothing of theirs is at stake, and offer only 2 (take the published version) and 3 (decide
  later), never publishing first: the folder holds no work to publish, and `push` refuses on this
  clone while the pair is there. With nothing at stake there is nothing to save, so never describe
  option 2 as saving their work. The receipt's last line names who can rename one of the pair. When
  the folder does hold other work, the receipt says *none of your work is in its way* instead and
  counts that work: say it is safe where it is, that 3 keeps it in place until the rename arrives,
  and that 2 saves it to a draft first; still offer only 2 and 3.

Never run `--take-remote` without an explicit yes: it replaces the working copy. When it does run,
report the draft branch it saved their work on, so they know how to get it back; when it says
nothing of theirs was in the folder, say there was nothing to save, and name no draft.

**If the pull itself fails, relay what the CLI said and stop.** It says why in a sentence: the
sign-in is no longer accepted (offer to sign them in again, then pull again), git could not present
the sign-in (relay the cause the CLI names rather than diagnosing a git version yourself), git is
not installed, the server could not be reached, or a folder that is not a wiki is sitting where the wiki folder goes (it names the
folder; nothing in it was touched). Never work around a failed fetch by putting the sign-in in a
file, a `.netrc`, a keychain, a git credential helper or the wiki's address: the CLI carries the
sign-in to git by itself, and a copy written anywhere else is a credential leak, not a fix.
`/commonground:status` is the diagnostic.
