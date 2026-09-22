---
description: "Connect this project to one of your wikis, or add a second beside it. Sign in, pick a wiki, done; run it again any time."
argument-hint: "which wiki? blank means I'll list yours; say \"also\" to add it alongside"
---

Aim the current project at a CommonGround wiki so this session can consult it. Work through these
steps conversationally, adapting to what's already true — don't blindly run everything.

**One verb, first time and every time after.** Setting a project up and re-aiming it later are the
same command, so there is never a moment where the user has to work out which one they are in.
Re-running this on an already-pointed project is expected, not a mistake.

**A project can read more than one wiki.** A personal wiki beside the employer's, a product wiki
beside the team's — one set, read over one connection (or from one clone each), with `search` and
`get_index` answering from all of them and each wiki's own charter saying what it covers. The flags
carry it: `--also <wiki>` adds a wiki beside the ones the project already reads, `--drop <wiki>`
stops reading one, and a bare wiki name keeps its old meaning — *this project reads THIS wiki* — so
it replaces the set. Plain words map to the same two flags: "also point this at Hipo", "read my
personal wiki here too", "add Hipo" mean `--also`; "stop reading Hipo here", "drop the personal
wiki from this project" mean `--drop`. The first wiki a project reads is its **primary** — what a
bare `commonground` verb and a tool call that names no `wiki` address; everything else about the
set is additive.

The bundled `commonground` CLI talks to the hosted API by default (no env setup needed).

## 1. Check sign-in state

Run `commonground status`.
- If it reports a team with a sync state, the user is already signed in — note the team and go to step 3.
- If it reports "not logged in" / "no team logged in", continue to step 2.

## 2. Sign in (device-code login)

The user needs a CommonGround account **with at least one wiki** first — the authorize screen has
nothing to approve without one, and its button is hidden rather than left dead.
- **No account/wiki yet?** Point them to https://app.commongroundapp.io/sign-up to create an account
  and a wiki. (Admins invite teammates there; a member can instead accept an invite link.)
- Then sign the device in. Use the **split** form, not the one-shot `commonground login`: the
  one-shot blocks until the grant expires (~10 minutes), which is far longer than a tool call gets,
  so it is killed and looks like a failure when it was only waiting.

  1. `commonground login --start` — prints the URL and the code, then exits.
  2. Relay both to the user: *"Open app.commongroundapp.io/activate and enter ABCD-2345. Tell me
     when you've approved it."*
  3. `commonground login --wait` — polls for about 90 seconds. If it reports **still waiting**, that
     is not an error: the user hasn't clicked Approve yet. Run it again.

  **Stop after the second "still waiting" and say why, instead of polling a third time.** A poll
  that never lands almost always means the user cannot press the button, not that they are slow —
  and the loop hides that completely. The two causes, in order of likelihood: they have **no wiki
  yet** (the authorize screen offers no button at all in that state, and tells them to create one),
  or the code expired and needs a fresh `commonground login --start`. Ask which they are seeing on
  the screen rather than guessing, and never keep polling while telling them nothing is wrong.

  On success it prints the wiki and role. **One sign-in is all they need** — it reaches every wiki
  they are a member of, now and later, so a wiki created or joined afterwards needs no second login.

## 3. Resolve which wiki this project should read

If `$ARGUMENTS` names a wiki, that wins: use it, and **don't stage a choice the user already made**.
But still run the listing below — it is one fast call — and read the named wiki's row out of it,
because step 4 picks the mode from the wiki's **plan** and the listing is the only place the plan
appears. The argument decides WHICH wiki; it never decides to skip learning what plan that wiki is
on. Don't re-ask which wiki, and don't relay the whole list back: take the row and move on.

**Already pointed, and a different wiki named?** `commonground use` (below) marks the wiki *this
project* reads and any it *also reads*. When the project already reads A and the user names B
without saying whether to add or switch, **ask — with the `AskUserQuestion` tool if it's available,
otherwise as a plain question — and never default**: *"This project reads A. Add B alongside it
(the project answers from both), or switch to B (it stops reading A)?"* Adding and switching are
different decisions with different consequences, and an ambiguous choice that resolves itself is the
exact failure this step exists to remove. A flag or a plain word in `$ARGUMENTS` ("also", "add",
"too" / "drop", "stop reading", "remove") answers the question, so don't ask it twice.

**The listing, either way.** Run `commonground use` with no argument. It lists every wiki the user is
a **member** of — asked of the server, not of this machine's sign-ins — marks the currently-active
one with `*`, marks the one **this project** is bound to, marks any it reaches without a sign-in of
its own as `covered by your existing sign-in` (same account, nothing separate to log into), and marks
any wiki the hosted connector will not serve this user `(Free plan)`, which is what step 4 reads.

Relay it in plain language — wiki names, never bare UUIDs.

**When `$ARGUMENTS` named no wiki, the listing is also the choice:**

- **Exactly one wiki** → don't stage a decision that isn't one. Confirm it in a sentence and move on:
  *"Pointing this project at your Acme Handbook wiki."*
- **Several** → ask which one, by name — with the `AskUserQuestion` tool if it's available in this
  session, otherwise as a plain question. **Don't guess, don't default to the first, and don't pick
  "the one they used last."** Which wiki a project reads from is the user's decision, not a default,
  and an ambiguous choice that resolves itself is the exact failure this step exists to remove.

**Offer the other kind, once.** The listing tags a personal wiki `personal`. When the user has just
chosen (or already has) a shared wiki and ALSO owns a personal one — or the other way round — offer
to read both here, in one sentence, after the first point lands: *"You also have a personal wiki.
This project can read both — the personal one answers for you, Acme Handbook for the company. Add it
(`--also`)?"* That pairing can never collide (each account has one personal wiki, and the two kinds
describe different subjects), which is why it is the one pairing worth volunteering. **Two wikis of
the same kind** — two shared wikis, two client wikis — are not offered: they may genuinely overlap.
If the user asks for such a pair, add it (this command never refuses a wiki they belong to), and
say that `/commonground:lint` shows where the two overlap and settles which answers for what. Offer
once; if they decline, don't raise it again in this session.

**One caveat about the listing.** If the output ends with a parenthetical note that it was *"listed
from this machine's sign-ins"*, the list may be **incomplete** — a wiki joined recently will be
missing from it. Say so rather than concluding a wiki does not exist. That conclusion was the bug:
the CLI used to list its own login cache and present it as the universe, so a user who created a
second wiki in the web app came back here and was told, as a fact, that it wasn't there.

The note says **why** it fell back, and the three reasons have three different fixes — relay the one
the note names, never a generic "try later":

- **"no longer valid"** — the sign-ins themselves are dead (they left those wikis, or the device was
  revoked). `commonground login` is the fix, and waiting is not.
- **"could not be reached"** — offline or an outage. Waiting is the fix, and logging in again is not.
- **"cannot list your memberships"** — the server is older than this plugin. Neither waiting nor
  logging in changes it; the list works again when the server updates.

**If a wiki they expect is missing**, two different situations, and only one is a problem:

- **They just created it, or were just invited.** Being a member is all it takes now — one sign-in
  reaches every wiki you belong to, so it should appear as soon as the server can be reached. There
  is nothing to log into. If it still isn't listed, they aren't a member yet (an invite not accepted,
  or a wiki created under a different account).
- **They want a NEW wiki.** Wikis are created in the web app — **app.commongroundapp.io**, "+ New
  wiki". You cannot create one from here; say that plainly and point them there rather than looking
  for a command. Once it exists and they're a member, it is usable here immediately.

## 4. Choose a mode — and, for local, where the folder goes

**Where a project's wiki lives is the user's decision: ASKED, with local recommended, never silently
defaulted (SER-323).**
In this order:
- **Adding (`--also`), dropping (`--drop`) or repairing (`--refresh`)?** The project is already
  pointed, so its mode is settled and comes from its own router block: don't ask it again, and
  don't pass `--mode` (the CLI refuses it beside those flags). Skip to step 5. On a local-mode add,
  the folder question at the end of this step still applies, to the wiki being added.
- `local` in `$ARGUMENTS` → that is the answer. Don't stage a choice the user already made. `mcp`
  in `$ARGUMENTS` is the answer only for a wiki that carries no `(Free plan)` marker; on a marked
  wiki it is answered with the sentence in the next bullet, not obeyed.
- **Marked `(Free plan)`** → **local-clone mode**, and say why in one line: Free works through the
  wiki folder on this machine, and the hosted connector comes with Pro. Don't offer MCP mode as an
  equal choice here. If the user asks for it anyway, say plainly that it will be refused for this
  wiki.
- **Otherwise → ask, recommending local.** Use the `AskUserQuestion` tool (multiple-choice UI) if
  it's available in this session, otherwise a plain question. Two options, local FIRST and marked
  recommended, and the trade-off stated in the options themselves so the choice is informed:
  - **Local folder (local-clone mode) (Recommended):** a full copy of the wiki on this machine as
    plain markdown. Faster and cheaper: Claude reads files on disk, with no connector call and no
    round trip to the server. Kept in step with `/commonground:pull` and `/commonground:push`, so
    it shows what was last pulled, and every write is a file you review before it publishes. Works
    offline; opens in Obsidian or any editor.
  - **Hosted connector (MCP mode):** Claude queries the server live, so it always sees the latest
    published version with nothing to pull. Nothing on disk. Needs a session restart and the
    connector's own consent (`/mcp`).

  The rule of thumb to say out loud: if this machine can run local, run local; MCP is for when
  being current without pulling matters more, or when no local folder is wanted here. Neither
  answer changes claude.ai Chat: Chat reaches a wiki through the connector whichever mode this
  project is in (step 7). Then wait for the answer. A question that resolves itself is the exact
  failure step 3 refuses for WHICH wiki, and it is how a project's pages once went live on a shared
  wiki with no review step (the reason `/commonground:seed` asks where pages land, SER-256).

**The marker is about REACH, not only about the plan.** A paid seat in any wiki keeps the hosted
connector on that person's own personal wiki, so someone who pays for a team wiki reads their own
free personal wiki through the connector too, and it carries no marker. Read the marker, never a
plan word picked up somewhere else: the server works it out for this user and this wiki, and it has
already counted their seats.

**No marker means UNKNOWN, and unknown means the question.** A marker can be absent for reasons
that are not a fact about the plan: the wiki is served after all, or the server is older than this
field and sends none, or no listing was fetched at all (it was skipped, it fell back to this
machine's sign-ins, which carry no plan, or it could not be reached). So an absence is never a
reason to say anything about plans in either direction, not Free and not Pro. It is the two-option
question above, with nothing said about plans.

**If they chose local, settle the folder in the same breath — one question, with a real default.**
The folder is named after the wiki (`~/CommonGround/<wiki-name>/`), so the default is already
sensible; the point is that the user gets told where their notes will live *before* a directory
appears, and can say otherwise. Ask it as a confirm-or-override, never as an open-ended "where?":

> *"I'll put your wiki at `~/CommonGround/acme-handbook/` — good, or would you rather it lived
> somewhere else (say, in your notes folder)?"*

- Accepting the default → run `init` with no `--path`.
- Naming a folder → pass it: `commonground init --mode local --path "<folder>" [wiki]`. It must be
  **empty or not exist yet**; the CLI refuses a folder with files in it and points at
  `commonground import` instead, which is the right tool for "I already have notes there".
- **Don't ask this in MCP mode** — there is no folder, and `--path` is rejected there.
- If the wiki is **already cloned**, `--path` is refused by design (it would strand the old folder,
  unpublished work and all). To move an existing folder, offer to run `commonground relocate
  <folder> [wiki]` for them — it moves the files, remembers the new spot, and updates this
  project's `./CLAUDE.md`.
- An existing folder is **connected, not refreshed** — see step 5. Local mode is safe to pick for a
  user who already has a clone: nothing in it moves.

## 5. Point it

Run `commonground init --mode <mcp|local> [--path <folder>] <wiki>`, then `commonground use <wiki>`.

**Adding or dropping instead?** The project is already pointed, so its mode and its primary are
settled — don't pass `--mode` or a bare wiki name beside the flag:
- add: `commonground init --also <wiki>` (local mode: add `--path <folder>` to choose where THAT
  wiki's folder goes; same confirm-or-override as step 4, same refusal of a non-empty folder; an
  existing clone is connected, not refreshed). Nothing about the wikis it already reads changes.
- drop: `commonground init --drop <wiki>`. Its folder, if any, is untouched; the project simply
  stops reading it. The CLI refuses to drop the primary while other wikis remain — point the project
  at another wiki first (`commonground init <wiki>`, which replaces the set), then `--also` the rest
  back — and refuses to drop the last wiki: a project reads at least one.
- a project reads at most five wikis; the CLI says so at the sixth.
Skip `commonground use` on an add or a drop: the machine-wide default is about the primary, and the
primary did not move.

**Re-pointing without a new wiki — a REPAIR, not a choice.** When the ask is to re-point or
refresh this project as it stands (a hook said the binding could not be recorded, the connector
serves a different wiki than the project names, or the block carries another machine's clone
path), run `commonground init --refresh` — it re-records every wiki this project already names
and replaces nothing (add `--mode local` only for the foreign-clone-path case, which re-clones
here). Never a bare `init <wiki>` for a repair: on a project that reads several wikis that
resets the set to that one wiki. There is nothing to ask the user here — no decision is being
made, only the recorded facts re-recorded — so run it, relay the receipt, and remind them a
session restart applies it.

**After a bare `init <wiki>` on a project that read several wikis, relay the line about what it
no longer reads.** Replacing the set is the bare verb's meaning and the receipt names what fell out;
the user should hear it from you, not discover it from a later `status`.

The first binds THIS project. It writes an idempotent CommonGround router block into this project's
`./CLAUDE.md` (it merges — it never clobbers the user's existing content) so Claude consults the wiki
before answering team questions. Local mode also clones the wiki, printing the folder it is creating
before it fetches into it (`Fetching your wiki into <path>`) — relay that path to the user, it's
where their notes now live.

It also records this project's wiki in `./.claude/settings.json` (merged, never clobbered — their
own permissions and hooks are untouched), which is what makes the MCP connector answer **for this
project's wiki** rather than for whichever one it was authorised for. If the CLI reports it could
not write that file, say so: it means the file isn't valid JSON, it was left alone rather than
overwritten, and until they fix it the connector will keep answering for the wrong wiki here.

The second makes this wiki the one **unbound** folders resolve to — so the last place you pointed is
also the sensible default everywhere you haven't pointed anything. It is a side effect, not a second
decision: **mention it only when it's relevant** (they work in folders that aren't set up, or they
just asked what "active" means). Never make the user reason about two pointers to run one command.

**Relay the CLI's line about what gets committed — don't drop it as boilerplate.** Both files it
writes are normally tracked by git, so `CLAUDE.md`'s wiki names, the first sentence of each charter's
brief and each category list, and the wiki id in both, reach anyone who clones this repo. That is
usually fine and occasionally not: a charter's first sentence and its categories are a statement of
what the team keeps, and in a public repo they are on GitHub. (The block no longer quotes the brief
at length or the anti-scope at all: both are read from the charter page on demand.) Say it once,
plainly, and move on — this is a heads-up, not a confirmation to collect. Neither file gets a
filesystem path and neither holds a secret; the sign-in lives elsewhere.

**If the fetch fails, relay what the CLI said and STOP — never work around it.** A failed `init`
in local mode says why in a sentence: the sign-in is no longer accepted (sign them in again, then
re-run), git could not present the sign-in (their git is too old; updating it is the fix), git is
not installed (the CLI says how to install it; and if this wiki carried no `(Free plan)` marker,
offering MCP mode instead is a fair next step, since it needs no git: the other option this step
offered, not a workaround), the server could not be reached, or a folder that is not a wiki is in
the way (it names the folder; nothing in it was touched). Whatever it says, these are never the answer, and
you do not offer them: writing the sign-in into a file, a `.netrc`, a keychain, a git credential
helper or the wiki's address; and, in local mode, seeding or saving through the MCP write tools
"instead" (the wiki would fill with pages nobody reviewed, in a project that was told its pages
are files). A failed `init` has written NO router block, so the hook that normally refuses those
tools here is not armed yet: the restraint is yours. `/commonground:status` is the diagnostic.
A retry is always safe: if an earlier attempt left an unfinished folder behind, `init` clears it
and says so; it never deletes a folder with anyone's files in it.

**If a wiki folder already exists, `init` leaves it exactly as it is.** It clones only when there is
no wiki on disk yet (an unfinished attempt is not a wiki: see above); it will not fast-forward an existing folder onto the hosted version, and it will
not publish local commits — even for an admin. Instead it reports where the folder stands (ahead,
behind, diverged, or matching) and names the verb that would act. **Relay that standing to the user
and stop there.** Do not follow it with `commonground pull`, `push`, `sync` or `resolve` to "finish
the setup": someone pointing a project has not asked you to reconcile their work, and a folder that
is ahead of the server holds the only copy of whatever is in it. Reconciling is its own decision, made
later, by them — offer `/commonground:pull` or `/commonground:push` as a next step if it's relevant
and let them choose.

**Re-pointing an already-pointed project is the same command.** The block records the wiki it's bound
to, and a project that named its wiki always keeps it until this command says otherwise — which is
what stops an unrelated folder from silently retargeting work in a repo the user isn't looking at.
When the project was already pointed somewhere else, say what changed, from which wiki to which.

## 6. Confirm, then hand off (don't dead-end at an empty wiki)

Tell the user: the mode chosen, that `./CLAUDE.md` now routes to CommonGround, and the wiki — or,
for a project that reads several, every wiki and which is the primary. **For MCP mode, tell them to
restart the session** — the wikis this project reads are recorded for the connector at session
start, so until they do, the connector is still answering for whichever wiki (or set) it was told
about when the session began; an add or a drop needs the restart exactly as a first point does.

**After an add, run the overlap check.** Two wikis read together is the moment SER-272's boundary
question becomes real. In MCP mode call the `lint` tool once (the session's own wiki; no `wiki`
argument needed) and read its `crossWiki` block — it compares the session's wiki against every
other wiki the user belongs to, the one just added included. In local mode `commonground lint` reads
the working tree and the MCP `lint` tool is still the one that carries `crossWiki`. If `unsettled`
is above zero, say so in a sentence and point at `/commonground:lint`, which lists the subjects
and settles which wiki answers for each; if it is zero, say the two don't overlap and move on.
Don't run `/commonground:lint` itself here uninvited — naming the check is the job.
Do not skip this because everything looks connected: that is exactly the state in which a wrong-wiki
answer is indistinguishable from a right one. For MCP
mode, mention that if the connector needs authentication — or if its tools stop appearing later,
which a plugin update can cause — they can run `/mcp` to (re)connect or restart the session; missing
tools are **usually** a connection problem, and `commonground pull [wiki]` still reads the wiki
without the connector. Three exceptions worth knowing: if this project names a wiki they are not a
member of, every call fails identically and `/mcp` cannot fix it, so that one needs an invite from
that wiki's admin; if the wiki's plan does not include the hosted connector, every call is
refused by design, so that one needs local mode rather than any repair; and if the wiki's
**subscription** is blocking, the consent this command is about to ask for is refused as well, so no
connector is added and the tools never appear at all. That last one is **Billing**, not a reconnect
and not a missing invitation: a wiki admin restores the subscription under Billing in the
CommonGround web app, nothing is deleted while it is blocked, and reading, `/commonground:pull` and
the local wiki folder answer throughout.
`/commonground:status` is what separates the four.

Then check the wiki's state so you hand off to the right next step. **MCP mode:** call
`get_awareness` (its `pageCount`) or `get_coverage`. **Local mode:** run `commonground coverage`,
which reads the folder `init` just fetched (every section empty = an empty wiki) — not the MCP
tools: a wiki marked `(Free plan)` is not served by the connector at all, and for any wiki they
describe the PUBLISHED copy rather than the folder this project works in.

- **Empty wiki (`pageCount === 0`, or every coverage section empty) + the user can curate
  (admin/curator):** the wiki has no content
  yet — pointing at it isn't the finish line. Flow straight into seeding: explain that
  **`/commonground:seed`** starts by chartering the wiki (who it's for — a team or just them — what
  it should hold, and when their AI should consult it), then interviews them or imports an existing
  folder/vault, and offer to start it **now**. This is the point of the whole setup — don't stop at
  "try asking a question" when there's nothing to consult yet.
- **Populated wiki:** suggest they try asking a question the wiki covers — their team or product,
  or themselves for a personal wiki — to see retrieval work, and (admins/curators) point them at
  `/commonground:seed` to fill gaps, plus `/commonground:ingest` (capture anything) and
  `/commonground:lint` (health + gaps).

**This command never imports.** Loading an existing folder of markdown belongs to
`/commonground:seed`, which triages what to import, normalizes frontmatter, and reports coverage —
so point at it rather than reaching for `commonground import` here.

## 7. (Optional) Bridge claude.ai Chat too

This command owns Claude **Code**'s `./CLAUDE.md` router. If the user also uses **claude.ai Chat**
(or mobile) — and the wiki is not marked `(Free plan)`, since Chat reaches a wiki only through the
hosted connector — offer to print a copy-paste instruction that makes plain Chat reflexively consult the
same wiki — follow the `maintainer` skill's **bridge-to-Chat** procedure, which owns the variants and
how to fill them. Pure-Chat teammates who can't run this command have the whole setup at
**https://app.commongroundapp.io/connect** — a public page, so it works before they have an account.

**Roles (v1):** admins and curators ingest/curate; members are read-only (search + read). For a
member on an empty wiki, note that an admin or curator needs to run `/commonground:seed` first.

## Related

- **`/commonground:status`** — which wiki this project reads (and which it also reads), which rule
  chose it, and its state.
- **`/commonground:seed`** — charter and fill the wiki (or import an existing folder).
- **`/commonground:lint`** — after a second wiki, where the two overlap and which answers for what.
