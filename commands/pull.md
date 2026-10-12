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

**If `commonground` or `node` is not found:** check the spelling first (run it the way the
paragraph above says). If `node` itself is missing, nothing in CommonGround runs on this computer
yet: say so plainly, never install anything unasked, and send them to `/commonground:point`,
whose first step walks the fix.

> **Normally local-clone mode only** — in MCP mode the wiki is live through the connector, so
> there's nothing to pull. **One exception:** if the CommonGround tools are gone or failing (a
> plugin update can drop the connector mid-session), `commonground pull` still works — it
> authenticates as the signed-in **device**, not through the connector — and gives the user a
> readable copy of the wiki on disk to keep working from. Ask for an explicit OK first: it writes
> files into a project that chose not to have any. If `commonground status` says the project isn't
> connected or there's no clone, point the user at `/commonground:point`.
> **A wiki named in `$ARGUMENTS` that has a folder of its own on this computer** (one
> `/commonground:seed` filled) **is neither of those cases:** it is pulled into that folder
> whatever this project's mode, and from a folder that reads no wiki, with no OK to ask for and no
> pointing to offer. Run `commonground pull <wiki>`.

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
  they have local work that hasn't been published and offer `/commonground:push` (`commonground
  diff --stat` lists it if they ask what it is). For a member the
  line says the work is safe on this machine and offers a suggestion for a curator instead; relay
  that rather than offering a publish they cannot make, and offer `suggest_change` only when this
  session has it (otherwise the routes in `/commonground:push` §2b).
- **Updated** — it fast-forwarded. Report the pages that came in, by name (the CLI prints the
  receipt), so the user knows what changed. A pull brings the change in around any local work it
  does not touch, so the receipt may add that the user **still has unpublished pages**: relay that
  line too and offer `/commonground:push`. For a member the line says the work is safe on this
  machine and offers a suggestion instead; relay that rather than offering a publish they cannot
  make (the same routes as **Up to date**). When the receipt adds that a page *was only re-saved
  here, with different line endings and the same text*, relay that line as written. It ends one of
  two ways: *so it was brought up to date* (the pull replaced their copy with the published page),
  or *the published wiki no longer holds it under that name, so the pull removed it here* (the page
  was removed or renamed there). Either way no text of theirs was in it.
- **Blocked** — the hosted wiki moved *and* a page the user changed here (edited, added or deleted)
  is one the incoming change also changes, or they hold local commits. **Nothing was changed.** Show
  both sides: what's incoming (`commonground diff --incoming`), what they changed here
  (`commonground diff`), and the pages the receipt names as ones the incoming change also
  changes (`they change <pages>, which you changed here too`): those are what stopped it. A page
  whose only change here is its line endings does not stop a pull: the pull brings it up to date by
  itself and says so (**Updated**, above). When `commonground diff` shows nothing for a page the
  receipt does name there, that page was only re-saved, in one of the ways a pull does not go over
  by itself: it gained a byte-order mark, it is one of a pair of pages that differ only in letter
  case, it is a page this folder's git settings rewrite on the way in or out, or git on this
  machine does not read it as plain text. Nothing of theirs is at stake in it, and taking the
  published version loses nothing there. Never
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
     it's what makes this safe to choose. `commonground drafts` lists it afterwards, and a page
     comes back from it one at a time (**Reading both sides, and saved drafts**, below).
  3. **Decide later** — do nothing; the clone stays exactly as it is.

  On a Mac or Windows clone whose publishes `push` refuses over a pair of pages that differ only in
  letter case (push.md §3c), option 1 is not available until this pull lands: offer 2, and say their
  work waits on the draft branch for them to bring back, a page at a time (`commonground drafts
  restore`, below), and publish. The receipt leaves the publish
  line out there, and prints the pair's own sentence instead. When it says instead that *the
  incoming change renames or removes* one of the pair, *which ends the pair*, relay that line: the
  rename they were waiting for is in this very pull, so never tell them to wait for a curator, and
  once it is in (option 2 brings it), this folder can publish again.
- **Blocked by a file git ignores** — the receipt says *a file this machine's git ignores sits
  where one of them goes* (for several, *files this machine's git ignores sit where they go*) and
  names it. **Nothing was changed.** This machine's git settings hide that file, so no publish
  carries it: never offer publishing first here. Offer, worded and asked as for **Blocked**: move
  or rename that file, then pull again (`/commonground:pull`); or take the published version
  (`commonground pull --take-remote`), whose `draft/…` branch keeps that file by name; or decide
  later. **Say what that keeping is worth before they choose:** the take writes the published file
  over theirs, and the draft keeps theirs. `commonground drafts show` names the file and prints
  none of its text, and `commonground drafts restore <name> <path>` refuses to put it back under
  its own name, where the published file then sits. It comes back under another name:
  `commonground drafts restore <name> <path> --as <new name>` writes it into the folder under a
  name they choose (**A file the ignore rules hide**, below). The receipt says the same in a line
  of its own (*keeps it, and afterwards it comes back under another name*; for several, *keeps
  them, and afterwards each comes back under another name*): relay it. Never say
  that file comes back under its own name, and never fetch it with `git`.
  Relay a line about other work not published yet as **Blocked** does.
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
  and that 2 saves it to a draft first, to bring back a page at a time; still offer only 2 and 3.

Never run `--take-remote` without an explicit yes: it replaces the working copy. When it does run,
report the draft branch it saved their work on, by its whole `draft/…` name, and say how it comes
back (`commonground drafts show <name>` shows what it holds; one page at a time returns on their
yes, below); when it says nothing of theirs was in the folder, say there was nothing to save, and
name no draft. When it names a file that *was written over* and that the draft *keeps*, relay
that line as written, and say how that file comes back: under another name they choose, on their
yes (`commonground drafts restore <name> <path> --as <new name>`, below), never under its own.

**Reading both sides, and saved drafts.** Four helper commands answer every "show me" and "get it
back" in this file. For another wiki this project reads, each takes that wiki's id after it (the
id, not the name: a name works and prompts). For the incoming side that is `commonground diff
--incoming <its id>`, the id after `--incoming`: before it, the command works and prompts.

- **`commonground diff --incoming`** prints what the published wiki changed, the pages they also
  changed first and marked. It only reads, and nothing is downloaded: it shows what the folder last
  saw, which after a stopped pull is the change that stopped it. `commonground diff` is their own
  side.
- **`commonground drafts`** lists the drafts saved in the folder, newest first, and
  **`commonground drafts show <name>`** prints what one holds, each page marked with how the folder
  stands on it now. `<name>` is the whole `draft/…` name as listed. Both only read.
- **`commonground drafts restore <name> <page>`** brings ONE file back from a draft, and it is the
  one of these that writes. **Run it only on the user's explicit yes, one file at a time, never on
  your own initiative and never to tidy up.** Say first what it does: it puts that file's saved
  text into the folder in place of the folder's copy, it refuses when that copy has changes saved
  nowhere else, and nothing is published; `commonground diff` then shows what it changed. **When it
  refuses, relay its sentence and stop: never work around a refusal.** The ways through are the
  ones it names: publishing that work, or `commonground resolve save-as-draft` (it saves the
  folder's work as a new draft and changes nothing in the folder), each only on their yes.
- **A file the ignore rules hide comes back under another name.** A draft made by taking the
  published version over a file this machine's git ignores keeps that file, and the restore above
  refuses it: under its own name it would sit over the published file and go out with the next
  publish. **`commonground drafts restore <name> <path> --as <new name>`** writes it into the
  folder under a new name and leaves the file at its own name as it is. `<new name>` may sit in a
  folder (`kept/notes.md`) and must be a name nothing in the folder or the wiki holds: the command
  refuses any other, and any name git or a Claude session reads as its own (one that starts with
  `.git`, a `CLAUDE.md`, anything under `.claude/`), so a session's settings file a draft kept
  comes back beside the pages, never into `.claude/`. **The rule above covers this form too: only on the user's explicit yes, one
  file at a time, under a name they chose or agreed to, never on your own initiative.** Say first
  what it does, then relay its receipt, above all the line on whether their ignore rules hide the
  new name. **When they do not hide it, the file is ordinary unpublished work from then on and the
  next publish would carry it: say so in those words.** When it refuses, relay its sentence and
  stop, as above: never write the file by hand. A hidden file that was a link is the one kind
  neither form writes: the command answers with the path the link pointed to (the receipts say
  *or, if it is a link, as the path it pointed to*), and making the link again is theirs to do.
- **Never run `git` in the wiki folder for any of this** (not `git diff`, not `git show`, not a
  checkout of a draft): these commands are the read and the way back, and raw git aimed at that
  folder raises a Claude Code security dialog every time.

**If the pull itself fails, relay what the CLI said and stop.** It says why in a sentence: the
sign-in is no longer accepted (offer to sign them in again, then pull again), git could not present
the sign-in (relay the cause the CLI names rather than diagnosing a git version yourself), git is
not installed, the server could not be reached, or a folder that is not a wiki is sitting where the wiki folder goes (it names the
folder; nothing in it was touched). Never work around a failed fetch by putting the sign-in in a
file, a `.netrc`, a keychain, a git credential helper or the wiki's address: the CLI carries the
sign-in to git by itself, and a copy written anywhere else is a credential leak, not a fix.
`/commonground:status` is the diagnostic.
