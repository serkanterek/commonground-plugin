---
description: "Publish the changes in your local wiki folder. Shows exactly what will go out and asks before anything lands."
argument-hint: "a line on what changed and why; I'll ask if you skip it"
---

Publish this project's local CommonGround clone to the published wiki. This is **the** outward-facing
step in local-clone mode: everything before it — ingest, edits, lint fixes, seeding — happened only
in the user's own copy.

**Running the CLI.** Every `commonground …` line in this file runs as
`node "${CLAUDE_PLUGIN_ROOT}/bin/commonground" …`. That form works from both the Bash and the
PowerShell tool; the bare word works only in Bash.

## 0. Establish the FRAME before you say anything

Who this wiki is for changes what publishing *means*, and getting it wrong is the single most jarring
thing this command can do. A person with a personal wiki asked "shall I publish this to the team?"
learns the product does not know who they are.

The frame is already in this session — take the first one available, and don't ask the user:

- the SessionStart hook's context line (it names the wiki in its own voice);
- this project's `./CLAUDE.md` router block, written by `/commonground:point`;
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

**"Stop reminding me about publishing" is a setting you can change for them.** A session whose wiki
folder holds unpublished pages opens with a reminder to publish. When the user would rather not see
it, run `commonground prefs set push-nudge off` and say what it does: the start-of-session reminder
stops, the pages stay exactly where they are, and `/commonground:status` still reports them whenever
they ask. `commonground prefs set push-nudge on` brings it back. Don't apologise for a reminder you
can turn off, and don't turn it off on your own initiative.

## 1. Preview first — always

Run `commonground push --dry-run`. This changes nothing, locally or on the server, and reports the
pages that *would* be published (including brand-new pages that were never staged in git).

- **Any file the preview says doesn't parse** — deal with that first, before asking to publish.
  `push` refuses the whole change set over it (§3b), so confirming now only to be stopped
  afterwards asks the user the same question twice and answers it differently. The preview reports
  these even when there is nothing to publish, and `push` still refuses then — so relay them rather
  than stopping at "nothing to publish".
- **Any file name the preview says some machines cannot hold**: the same reasoning. `push`
  refuses the whole change set over it, so settle the rename first (§3c), then ask to publish. If
  the preview says instead that two names `differ only in letter case, and this machine can hold
  only one of them, so nothing can be published from here`, there is no rename to settle and no
  publish to ask about: relay it and go to §3c.
- **"no page changes in <folder>, but the catalog needs a refresh"** — a plugin update corrected the catalog
  format, and `index.md` is machine-owned, so this is the one publish with no page content in it.
  Relay it as maintenance ("your wiki's catalog gets a correction — no page changes"), and let the
  same confirmation flow apply; declining just leaves the catalog stale until the next real publish.
- **A `Heads up: you are inside the folder of …` line first** — the preview examined a different
  wiki's folder than the one the user is standing in (the pointer, or a name they typed, sent it
  elsewhere). Relay both halves verbatim and confirm which wiki they mean before anything else; the
  line names the command that addresses the one they are standing in. Never pick for them.
- **A `Heads up: <wiki> moved` line** — the published wiki changed since this clone last pulled,
  so this publish would stop (§4). Offer `/commonground:pull` first, then preview again: a pull
  brings the change in around their work and stops only over what is in the change's way, while a
  publish made now commits their work and then stops, and the pull after it can no longer bring the
  change in on its own. **Unless a pull has just stopped and its receipt offered publishing
  first** (a stop over a file git ignores, or on a clone holding a twin pair, never does): a second
  pull stops the same way, so publishing is the way through. Carry on to §2; when the publish comes
  back blocked, §4 takes over. After a stop over a file git ignores, the way through is moving or
  renaming that file first (`/commonground:pull`, **Blocked by a file git ignores**): offer that,
  then the pull. Never offer the pull alone, and never offer publishing first.
- **Nothing to publish, nothing broken** — say so and stop. The line names the folder it read
  (`nothing to publish in <folder>`); relay that folder — it answers "where did you look?" before
  the user has to ask.
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

**Never route around this step.** Publish only in the form the top of this file defines; the guard
asks about it from the Bash tool and the PowerShell tool alike. Reaching the same write any other way
to dodge the dialog is the one thing that recreates the bug this section exists to prevent: another
spelling of the bundled `bin/commonground push` path, a copy or a link of the binary, a variable or a
script that holds the command, or the preview and the publish chained into a single shell command to
make it look read-only. That is how the guard was defeated on 2026-08-04 (SER-217). **The
guard is never to be worked around**: do not edit, disable or bypass the hook, and do not look for a
command shape that slips past it. If it fires, the answer is to let the dialog reach the user and
take whatever they say. You will not see their answer, so a publish that simply succeeds means they
said yes — not that the guard failed to fire.

The one question you DO ask yourself is the deletion one, and §3 says when: ask it **before** you run
the push, not after, so the user gets one question and one dialog rather than four prompts.

Run `commonground push --message "<what this session did>"` — one session-scale
sentence saying what changed and why, which becomes the commit message and is the only record of
your reasoning that outlives the session. If `$ARGUMENTS` carries the user's own line about what
changed, that IS the message (don't ask again); if it names a wiki, pass that wiki to the verb. Never restate what the diff shows ("updated pages"). It
publishes and reports the receipt (the pages published) — unless it comes back
**needs-delete-confirm** (§3), **needs-unparseable-fix** (§3b) or **needs-rename** (§3c), in which
case nothing was published and that section takes over. If this publishes a change someone asked
for, close their request with `resolve_suggestion` (`applied`) and pass the `commitId` push reports
— that's the commit their suggestion produced.

## 2b. If the user is a member (`read-only`) — shared wikis only

*(Unreachable on a personal wiki: its only user is its admin. Skip this section entirely there.)*


Nothing was published, and **nothing was lost** — their work is still in the clone. Say that first;
"your role is read-only" on its own reads like the work was rejected.

The CLI names the pages they have unpublished. **When this session has the `suggest_change` tool**,
offer to file them with it — one per page, carrying what they wrote and why it matters — so a
curator can fold it in. That is a member's real publish path, and it is the difference between their
knowledge reaching the team and sitting on their disk.

The suggestions queue lives on the server, so **a local-mode project with no connector in this
session cannot file one at all.** Don't offer a tool that isn't here: say the work is safe in the
clone, and name the two real routes — `/commonground:point` in MCP mode, or sending a curator the
pages directly. Either way, don't offer to make them a curator; that's the admin's call, not a step
in this flow.

## 2b′. If the publish fails before anything is sent

A `push` that dies on the way to the server says why in a sentence: the sign-in is no longer
accepted (offer to sign them in again, then publish again), git could not present the sign-in (the
CLI names the cause it can prove, so relay that sentence rather than diagnosing a git version
yourself), or the server could not be reached. **Nothing was published**, so say that, relay the
sentence as written, and stop. **Don't add "nothing was changed" on your own**: `push` commits the
user's work into the wiki folder before it tries the server, so after a failure at that point the
work IS committed, and the CLI says so where it can (`Your commit is safe in the folder; the publish
did not reach the server`). That half is the reassurance they need before they retype anything, so
relay whatever the CLI said about it and add nothing of your own. If its sentence is silent on the
folder, say the work is still there rather than claiming it was untouched. Never work
around it by putting the sign-in in a file, a `.netrc`, a keychain, a git credential helper or the
wiki's address, and never "publish" the same pages through the MCP write tools instead: in a
local-clone project that is the wrong path even when it would work.

## 2c. If the publish is refused over the wiki's subscription

If `push` fails with a message about the wiki's **subscription**, or about **payments** that did
not go through, that is a **billing** state. It is not a broken connection, not a dropped connector
and not a role gate, so none of the fixes for those apply. **Nothing was published and nothing was
lost:** every file is still in the clone, and the wiki's whole history is untouched. Say that first.

- **Relay the server's own sentence.** The refusal carries prose written for this reader and it names
  the state precisely. Don't compress it into "the push failed".
- **Never retry the push, and never route the work somewhere else.** Not into another wiki, not
  through the hosted write tools, not by editing around it. Every publishing path is refused the
  same way while the subscription is blocking, so a second attempt only spends the user's patience.
- **Say what still works**, because almost everything does: reading and searching the wiki,
  `/commonground:pull`, the local folder and its git history, and revoking credentials or
  invitations. A billing state deletes nothing.
- **Name the one fix: Billing.** A wiki admin restores the subscription under Billing in the
  CommonGround web app. If the user is that admin, that is their next step; if they are not, the step
  is to tell a wiki admin. Their work waits in the clone until then, so offer to leave it there
  rather than proposing a workaround.

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

**A renamed page is a rename in the preview and a removal to `push`.** Renaming a file (say, to fix
a name lint flagged) shows in the §1 preview as a rename (`~ <new name>`) with no removal line, and
`push` then asks about the old name as a removal (needs-delete-confirm). Nothing is lost there, so
skip the "loses access" line: when the preview shows a rename, ask the removal question off it all
the same, say it is the same page under a new name, and ask for the yes on the removal in those
words.

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

## 3c. If a file name cannot travel (the portability guardrail)

If `push` comes back **needs-rename** (the §1 preview lists the same files), **nothing was published
and nothing was lost**: every file is still in the clone. The people who use this wiki clone it on
Windows, Macs and Linux alike, and a NEW file is named in a way one of those machines cannot hold:
a character Windows refuses (`: * ? " < > | \`), a name ending in a dot or a space, a Windows device
name (`con`, `nul`, `com1`), a name that reads as git's own `.git` folder (`.GIT`, `git~1`), a path
too long for Windows, or a name that differs from a page or folder
already in the wiki only in capitals (a Mac or Windows keeps those as ONE file, so one page would
silently replace the other). Relay each file with the reason the CLI gave, offer to rename it in the
clone and fix any link to it, then push again. Rename only the files the CLI names, never a page that
is already published, and never reach for a way to publish the name as it is.

**The server refuses the same names itself.** A `push` (or `import`) that fails with a message
starting `CommonGround did not publish this push` was refused by the server, and the CLI relays the
server's words as written and ends them with `Your commit is safe in the wiki folder.` Read the line
after the first before you answer:

- **A list of file names** (`It adds a file name that some machines cannot hold:`, or `It adds <n>
  file names …`) was refused by the server's own copy of this check, after the upload. The server
  shows each name JSON-quoted: a backslash in it appears doubled, a quote as `\"`, an invisible
  character as `\uXXXX` and a byte that is not text as `\xNN` (`"notes/back\\slash.md"` is the file
  `notes/back\slash.md`), and a very long path is cut to its start and end around `…`. Treat it
  exactly as `needs-rename`: relay the list, offer to rename those files in the clone (the file on
  disk, not the quoted text) and fix any link to them, then push again. It is not a connection or
  sign-in failure (§2b′), so never retry it unchanged, and don't say nothing was changed: the work is
  committed in the folder.
- **`Publishing is paused on the server right now, so nothing was published. Try again shortly.`**
  means the server could not run that check, so nothing was sent and no name is wrong (`The server
  could not check the names of the files in it …` is the same answer, given after the upload). It is
  not a rename and not a sign-in problem. Relay it, say the work is committed in the folder, and
  offer to publish again in a little while; don't rename anything and don't offer to sign in again.

**`needs-rename` can also name a pair ALREADY in the wiki, and that one is not fixable from this
machine.** Its line reads: `"<a>" and "<b>" differ only in letter case, and this machine can hold
only one of them, so nothing can be published from here. A curator on a Linux machine, or
CommonGround support, can rename one; after that, pull and publish again.` (For two names that
differ only in how their accents are encoded, it says that instead of letter case.) This Mac or
Windows disk holds the two pages as one file, so any publish from here could put one page's text
over the other or drop one from the catalog. While the wiki holds such a pair, `push` publishes
nothing from this folder, whatever else changed, and `import` refuses the same way. Relay the line
as written. Don't offer a rename: on this disk no rename separates the two. Don't retry, and don't
reach for `--mine`, `--allow-deletes` or `import`: each is refused the same way. Say that every
change the user made is still in the folder, and that once a curator on a Linux machine, or
CommonGround support, has renamed one, `/commonground:pull` and then a publish carry it out. Edits
to other pages do not stop that pull: a pull brings the repair in around them, and they publish
after it. If that pull comes back **Blocked** because a page edited here is one the incoming change
also changes, or says it cannot bring the change in as an update or would write over a file here,
publishing first is not the way through while this clone still holds the pair: offer taking the
published version (`pull --take-remote`, which saves their work to a `draft/…` branch first), then
bringing their edits back from that draft and publishing. When it names a file this machine's git
ignores in the way instead, offer what `/commonground:pull` offers there: moving that file and
pulling again, or taking the published version.

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
