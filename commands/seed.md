---
description: "Fill your wiki. Charters it with you (who it's for, what it holds), then builds it from an interview or imports your notes. Re-run any time to fill gaps."
argument-hint: "which wiki? add a folder of notes to import if you have one"
---

Take the user from *an empty wiki* to *a populated, useful one*. This is the onboarding arc: it
detects where the wiki is, **charters** it (who it's for, what it should hold, when an AI should
consult it), forks into **build from scratch** or **import what you have**, then converges on a
shared gap-fill loop driven by the charter's checklist. All drafting happens **in this session, on
the user's tokens** (Model A) — you produce the markdown; CommonGround persists it. Re-runnable and
**resumable**: it always resumes from the current charter + coverage, so running it again just
continues filling gaps.

**Asking questions:** whenever a question in this arc has enumerable answers, present it with the
**`AskUserQuestion` tool** (the multiple-choice UI) if it's available in this session — at most 4
options per question (an "Other" is built in). Fall back to a plain conversational question when
the tool isn't available or the answer is open-ended. Either way, ask one thing at a time.

**The mode — where pages land — is settled in step 0.3, and NEVER by detection alone.** It is
somebody's earlier decision or it is a question: a project that already reads this wiki carries the
mode `/commonground:point` set there, a wiki that already has a folder on this computer was given
one on purpose, and when neither holds, seeding is the one that asks (SER-256).

**Seeding never connects the folder this session is in to a wiki.** It fills the wiki's own folder
(or the hosted wiki), and connecting a project is `/commonground:point`, run on purpose from that
project (step 0.3 has the rule).
**Local-clone mode:** every page below is a FILE in the clone, and the charter too — do not use
`save_page` / `save_charter`; nothing is published until `/commonground:push`. **MCP mode:** the
write tools go straight to the hosted wiki, live the moment they land — for the whole team on a
shared wiki, and for every other Claude they use on a personal one. Both halves answer *where* a
write lands, never *whether* seeding may happen: the user invoked this arc, so confirm what you're
writing and write it — never tell them this project shouldn't write to the wiki.

**Roles.** In **local-clone mode** seeding needs no particular role — it builds the user's own
working copy — but a member can't publish it, so say that when the arc completes; offer
`suggest_change` only when this session actually has that tool (it is a connector tool: when it is
missing, the rule under **Setup has two sign-ins** below says what to do). In **MCP mode** seeding writes the hosted wiki directly, so it is **admin/curator
only**: for a member, don't attempt writes — explain the limit and offer to answer questions from
whatever wiki exists (`search` / `get_page`) instead.

Your role is a property of **the wiki being seeded**, not of the one this project reads. Someone can
curate their own wiki and be read-only in their company's, so when step 0 targets another wiki the
server decides — relay what it says rather than reasoning from the role you have here.

**Audience governs tone.** The charter (step 2) declares who the wiki is for. **just-me** → say
"your wiki" and "your Claude", never "your teammates"; personal and subjective content is in-scope
by definition. **my-team / whole-company** → the shared framing applies. Never suggest removing
content for "shareability" — see the golden rules in the `maintainer` skill.

Work through this conversationally — adapt to what's already true, don't robotically run every step.

**Running the CLI.** Every `commonground …` line in this file runs as
`node "${CLAUDE_PLUGIN_ROOT}/bin/commonground" …`. That form works from both the Bash and the
PowerShell tool; the bare word works only in Bash.

## Before anything runs: say what is about to happen

**Unless this session's context already shows this project reading a wiki** (the session-start line
names the wiki when it does), **your first output is words, not a tool call.** The first tool call
raises a permission prompt, and a new user who has been told nothing reads that prompt as something
going wrong. Say this in your own voice, keeping every fact:

> Here is what happens next, so nothing surprises you.
>
> 1. I check that this computer can run CommonGround, and whether you are signed in. If something
>    is missing I say what and why, and we sort that out first.
> 2. If you are not signed in yet, I sign you in: I give you a link and a short code, and on most
>    computers the page opens by itself. You approve it there and come back.
> 3. I settle where your wiki lives: usually a folder of its own on this computer, sometimes kept
>    online instead. I say where that folder goes before I create it, and I connect nothing to the
>    folder this chat is open in.
> 4. I ask about your work, suggest sections from your answers, and draft pages for you to check.
> 5. Nothing is published until you say so.
>
> Along the way Claude Code asks you to allow the CommonGround commands I run and the pages I save.
> Those and the browser sign-in are the only approvals a wiki folder needs. If your wiki is kept
> online instead, there is one more: CommonGround asks you to approve its own connection, once.

Every line there is true whatever the steps below find (someone already signed in, a machine with no
browser to open, a wiki whose plan settles the mode), which is why it says "if" and "usually": do
not sharpen it into a promise a later step will break. Then carry on to step 0. In a project that
already reads a wiki, skip it: they have seen it.

**Setup has two sign-ins, and only those two are CommonGround's.** The browser code, in every
mode; and the connector's own consent, for the hosted connector only. When this session reports
servers or tools that "need authorization":

- **Name only CommonGround's own entry** (`plugin:commonground:commonground` in a notice,
  `mcp__plugin_commonground_commonground__…` on a tool) and say whether this project's mode needs
  it. **Before a mode is chosen,** say setup needs it only if they pick hosted, and that nothing
  needs authorizing now. **A local wiki folder does not:** setup and seeding there use no
  connector at all, so say that sign-in can be left alone for now. It becomes useful later, for
  inviting a teammate, the suggestions queue, or checking two wikis for overlap.
- **Say the others are not part of CommonGround** and can stay as they are. Never start another
  server's sign-in, and never bring up a connector list or connector suggestions, as a step of
  setting up CommonGround.

**In a local project CommonGround's own connector is switched off by CommonGround, unless this
session lists it as needing authorization.** So when a connector tool you need there is not in this
session and the session does not list the connector, say that in one sentence and offer to switch
it on (`commonground connector on`, then a new session), and relay what that command answers. When
the session does list it, the tool waits on the connector's own sign-in (`/mcp`, the row named
CommonGround). **Never work around a missing tool by any other route.** A seeding session can run
in a folder that is connected to no wiki. Nothing was switched off there, so skip that command: a
missing connector tool there means the connector's own sign-in.

**If this computer cannot run CommonGround yet** (step 0's first command comes back with `node` not
found): nothing in CommonGround runs without Node.js, not this command, not its hooks, not the
connector. Stop there: no sign-in attempt, no retry, no other route. Say so plainly (nothing is
wrong with their wiki or their account) and offer to walk them through it, for the platform this
session runs on:

  - **macOS:** the Node.js installer from nodejs.org (the LTS download for macOS: open it and click
    through, no terminal needed). `brew install node` only for someone who already uses Homebrew.
  - **Windows:** Node 20 or newer from nodejs.org, and for a local wiki folder Git for Windows
    (`winget install --id Git.Git -e --source winget`, or the installer from git-scm.com), which
    also gives Claude Code its Bash tool.
  - **WSL:** install inside WSL, never on the Windows side: `sudo apt install git`, and Node 20 or
    newer (nodejs.org lists the ways; a distro's own package can be older than 20).
  - **Linux:** Node 20 or newer, from nodejs.org or the distro's packages (check the version: a
    distro's own package can be older than 20).

  Then they **quit Claude Code completely and open it again** (in the desktop app that means
  quitting the app, not starting a new chat) and run the same command again. A running Claude Code
  keeps the PATH and the tools it started with, so run nothing else before the restart: it would
  only report the same thing missing. **Never run an installer they did not ask for.**

## 0. Which wiki, and is this session signed in?

Seeding is the FIRST thing a new user does, so this command cannot assume a signed-in machine or a
project that reads any wiki. It settles the sign-in itself, needs no pointed project, and never
bounces the user to another command to come back afterwards.

**Parse `$ARGUMENTS`.** A token that names a wiki (a name, an id, or a unique prefix of either —
check it against the `commonground use` listing) is the **target**. A token that is an existing path
is the **import folder**. Both may appear, in either order; neither is required.

**1. Signed in?** Run `commonground status`. If `commonground` or `node` is not found, follow
`/commonground:point` step 1's not-found branch: check the spelling first (run it the way the top of
this file says), never install anything unasked, and only after installing Node or Git, or
reinstalling the plugin, have them quit Claude Code completely and open it again before anything
else runs. That branch's walk
is spelled out above ("If this computer cannot run CommonGround yet"), because the file it lives in
is not open while this one runs. If it reports a team, you're signed
in: make the quiet-checks offer below, then go to 2. In a folder that reads no wiki that answer
ends with an offer to point the folder (`this project is not pointed at a wiki yet`), and the
several-wikis answer says to bind this project to one. Neither is a step of seeding: **do not relay
an offer to point this folder.** If it reports "not logged in" / "no team logged in", sign in **here**, inline:

- The user needs a CommonGround account **with at least one wiki** first — the authorize screen has
  nothing to approve without one, and its button is hidden rather than left dead. No account yet →
  https://app.commongroundapp.io/sign-up.
- Use the **split** form, never the one-shot `commonground login`: the one-shot blocks until the
  grant expires (~10 minutes), far longer than a tool call gets, so it is killed and looks like a
  failure when it was only waiting.
  1. `commonground login --start` — prints the URL and code, then exits. **It also opens a
     browser tab by itself** when the machine has a way to, so say a tab is about to open BEFORE
     you run it; a tab appearing unannounced is the first thing a new user distrusts. Then relay
     both: *"A tab should have opened showing the code ABCD-2345: check it matches and press
     Authorize. If no tab opened, open app.commongroundapp.io/activate and type the code in. Tell
     me when you've approved it."*
  2. `commonground login --wait` — polls ~90 seconds. **still waiting** is not an error; run it again.
- **Stop after the second "still waiting" and say why, instead of polling a third time.** A poll that
  never lands almost always means the user cannot press the button, not that they are slow — and the
  loop hides that completely. The two causes: they have **no wiki yet** (the screen offers no button
  at all and says to create one), or the code expired and needs a fresh `--start`. Ask which they see.

**Offer quiet checks to anyone who has not answered, at most once a session.** `commonground status
--json` carries `prefs.quietChecks` (run it now if you have not; the mode question reads the same
output): `null` means this person has not answered, `on` or `off` means they have. **Only when it
is `null`**, say
that Claude Code asks before every CommonGround command and that about half of them only look, and
ask (with `AskUserQuestion` when it is available):

> One optional thing. Claude Code asks you before every CommonGround command I run, and about half
> of them only look at things: your status, your list of wikis, what is covered, the health check,
> the preview before publishing, what changed in your wiki folder, what is incoming and what your
> saved drafts hold, and for a hosted wiki, searching and reading it. I can let those run without
> asking. Publishing still asks you every time, and so does saving pages. Want that?

- **Yes** → run `commonground prefs set quiet-checks on`. The dialog that command raises IS the
  confirmation, so do not ask a second question of your own. Then say they can undo it by asking
  you to turn quiet checks off.
- **No** → leave it and carry on; they can ask for fewer prompts at any time. A plain no is not
  recorded (recording it would cost them a prompt for saying no), so another day's session may
  offer it again. Only if they say not to be asked again, run `commonground prefs set quiet-checks
  off`, which records the answer for good.

**Never turn it on on your own initiative**, never to get past a prompt, and never offer it twice in
one session. With it on, a check runs without a prompt only when it is written the way the top of
this file says, with nothing after it but `2>&1` or one `| head -N`: anything joined to another
command asks again.

**2. Resolve the target.**

- **An argument was given** → that's it. Don't second-guess it.
- **Exactly one wiki** → don't stage a decision that isn't one. Say which and carry on.
- **This project is pointed at a wiki** (or, failing that, this machine has one marked `*` active in
  `commonground use`) → confirm in ONE sentence and move: *"Seeding **Acme Handbook** — that the
  one?"* A confirmation is not the same as a guess: it is one sentence they can say no to.
- **This project reads several wikis** (the listing marks `this project` AND `this project also
  reads it`) → that is a choice, not a confirmation: name them and ask which one this seeding is
  for. The primary is not a default here — a seeding arc writes dozens of pages, and the wiki it
  fills has to be the one the user meant.
- **Several wikis and nothing pointed or active** → list them by name (`commonground use`) and ask.

**Never guess, and never silently seed the fallback wiki when the user has several.** A wrong-wiki
write is the defect class this whole area exists to close, and seeding is the one arc that writes
dozens of pages before anyone would notice.

**3. Mode — WHERE PAGES LAND, settled before anything is read or written (SER-256).**

Where a page lands is never a silent default: the first live run presumed MCP because the connector
happened to work, and every drafted page would have gone live on a shared hosted wiki with no review
step. It comes before the recon in step 1, because the answer decides which sign-in must work (local
→ the CLI's membership of the target; MCP → the connector's).

**Whatever settled the target — an argument, this project's binding, or the listing — run
`commonground use` before the mode is settled.** The listing is the only place the plan appears
(`commonground status` and the router block carry no plan marker), and the marker decides whether
the mode is a question at all. The target decides WHICH wiki, never whether the plan gets learned.

Then, in this order:

- **This project already reads the wiki you are seeding** — `commonground status` reports its mode
  (`Mode: local, wiki folder <path>` or `Mode: hosted connector (MCP)`; `--json` carries it as
  `mode`). That is the mode.
  **Confirm it in ONE line and carry on**, never as a question: *"Pages land as files in your wiki
  folder, and nothing reaches the team until `/commonground:push`. Carrying on."* A project decides
  this once, and `/commonground:point` already decided it here. When they ask for the OTHER mode
  for a wiki this project reads, that is a re-point, and it is `/commonground:point`'s to make: put
  it to the user and let them decide before you seed a line. Seeding never makes it a side effect,
  and until they decide, seed the wiki where it already lives. A project that reads only OTHER
  wikis does not set this wiki's mode, with the one exception on the next line.
- **This project is local for another wiki** (`commonground status` reports `Mode: local`, and the
  wiki you are seeding is not one this project reads): **this wiki is seeded into its own folder,
  never through the connector.** The write guard in a local project refuses every hosted save
  whatever `wiki:` it carries, and the folder its redirect names is this project's, which holds
  another wiki. Say in one sentence that the pages land in the wiki's own folder, and carry on.
  When they asked for hosted, say that hosted seeding of this wiki runs from a session opened on a
  folder that is not a local project, and let them pick between that and the folder.
- **`local` or `mcp` said outright** — in `$ARGUMENTS`, or in plain words ("keep it local", "switch
  to mcp"). For a wiki this project does not read, that is the answer. Those two words are modes,
  never wiki names. **When the word is `mcp`, run `commonground folder <wiki> --where` all the
  same:** if the wiki has a folder on this computer, say in one sentence that hosted saves leave
  that folder behind until `/commonground:pull <wiki>`, and that pages in it which were never
  published stay unpublished.
- **The wiki already has a folder on this computer**: `commonground folder <wiki> --where` answers
  `your wiki folder is at <path>`. That folder is the mode, because someone put this wiki there on
  purpose. Confirm it in one line, with the path, and carry on.
- **Nothing has set one yet** — seeding is the first asker here, so seeding asks, with the same
  question, the same machine probe and the same defaults as **`/commonground:point` step 4**: read
  `probe.git` from `commonground status --json`, lead with **Local folder (Recommended)** when git
  is present, and when it is missing lead with **Hosted connector (Recommended)** and offer the
  third option, **Help me install git**. Read that step rather than restating it here; the one
  sentence worth adding at seeding time is what each answer means for the pages you are about to
  write, which the preamble above already states. Three things from that step are said here as
  well, because that file is not open while this one runs: with the local option, that it needs no
  connector and no sign-in beyond the browser code; with the hosted one, that it needs the row
  named CommonGround approved under `/mcp`, and no other row (no restart here: seeding names the
  wiki on each call); and when
  `probe.node.supported` in the same read is false, one plain line first that this computer's
  Node.js is older than CommonGround is built for and that updating it is the fix. That last one
  is a warning, never a stop.

**A wiki marked `(Free plan)` in the `commonground use` listing is not a question either: it is
local.** Say why in one line (Free works through the wiki folder on this machine and does not
include the hosted connector) and carry on — the same rule, and the same marker, as
`/commonground:point` step 4. Offering "Hosted directly" there offers something that will not
answer.

**In claude.ai Chat, state rather than ask** — there is no filesystem, so don't stage a fake
choice: say plainly that pages go live on the hosted wiki as they are saved, and that running
`/commonground:seed` in Claude Code instead is the way to stage and review first.

Then wire the answer up. One rule the branches below all lean on: **seeding never points a folder
at a wiki, and never runs `init` to get one.** Filling a wiki needs the wiki's own folder, or the
hosted wiki, and nothing else. A first seed used to point whatever folder the session was in, which
wrote a note into that folder's `CLAUDE.md` and a setting into its `.claude/settings.json`: two
files in a folder nobody had mentioned, and in the home folder a connection that reached every
folder on the computer. Connecting a project to a wiki is `/commonground:point`, run on purpose
from that project. (The one `init` in this file is the `--refresh` after chartering, in a project
that already reads the wiki.)

- **Local, and the wiki is this project's PRIMARY** (the wiki `commonground status` reports for
  this project) → the local-clone rules above, unchanged: a command that names no wiki means it,
  and its folder is on the `Mode:` line.
- **Local, in every other case** (this folder reads no wiki, reads other wikis, or reads this one
  beside its primary) → seed into **the wiki's own folder**, in this order:
  1. Run `commonground folder <wiki> --where`. It answers `your wiki folder is at <path>` when the
     wiki is on this computer, and `It would be created at <path>` when it is not, and it makes
     nothing. Ask this, not `commonground status <wiki>`: in a project that reads another wiki,
     that readout carries the project's own mode and may name no folder at all.
  2. **Say where the wiki lives before any folder appears.** Not on this computer yet → ask it as a
     confirm-or-override, never as an open "where?": *"I'll keep your wiki in its own folder at
     `<path>`. Good, or would you rather it lived somewhere else (say, in your notes folder)?"*
     Already here → say the path in one sentence and carry on.
  3. Run `commonground folder <wiki>`, adding `--path "<folder>"` when they named one. It fetches
     the wiki into that folder when there is none yet, leaves an existing one exactly as it is,
     and writes no note and no setting into the folder this session is in. A folder they name must
     be empty or new: the CLI refuses one with files in it, and notes that already exist come in
     through step 5's import, **never by putting the wiki on top of them**. When it says the folder
     is behind the published wiki, **relay that and offer `/commonground:pull <wiki>`** before you
     write a page.
  4. **Only when this folder reads no wiki at all**, run `commonground use <wiki>`, so that a
     command which names none means this one. In a project that reads another wiki it changes
     nothing for this folder, and its receipt offers a re-point that is not yours to take: skip it.
  5. **Name the wiki on every command that takes one, for the whole arc**: `commonground coverage
     <wiki>`, `commonground lint <wiki>`, `commonground import "<staged folder>" <wiki>`, the
     publish at the end. A command that names no wiki answers for this project's primary, or for
     the computer's active wiki, and either can be another wiki than the one you are seeding.
     An import or a publish that lands there is a wrong-wiki write.
  6. Write the pages as files in that folder.

  Two things a project that reads this wiki as its primary would do for you are yours to hold in
  this arc. The hook that guards a local project's writes knows only this project's own wiki. It
  does not protect this one, and where it says "the clone" it means the project's. So never save
  a page of this wiki through `save_page`, and write its files only in the folder step 3 named.
  And nothing in the folder this session is in records the choice: the wiki's own folder does,
  which is why a later seeding finds it in the list above.
- **MCP, target is the session's wiki** → the write tools as-is.
- **MCP, target is a DIFFERENT wiki** → pass **`wiki: <teamId>`** on every seed-path tool call:
  `get_coverage`, `get_awareness`, `get_index`, `get_page`, `stage_sources`, `save_page`,
  `save_charter`, `save_seeding_progress`. The connector resolves its own wiki once per session, so
  this argument is the only thing that moves a write — there is no re-binding and no restart. The
  server authorizes it against the TARGET (membership and your role *there*); **relay its refusals
  as it words them** rather than pre-judging. A refusal is never a reason to retry without the
  argument — that writes into the wrong wiki.

**4. Verify which wiki answered — before the FIRST write, on every MCP seeding.** Every tool
response ends with `[commonground] answered from wiki <id>`. Read it off your first tool call of the
arc and check it against the target, whether or not you passed a `wiki:` argument: a session whose
connector is serving a different wiki than the one you are seeding looks exactly like a working one.
Once it matches, proceed and don't check again. On a `wiki:`-carrying call:

- It names the **target** → the argument landed. Proceed, and don't check again.
- It names the **session's** wiki → this server predates the argument and **silently ignored it**
  (an undeclared argument is dropped, not rejected — there is no error to catch, which is exactly
  why this check exists). **Write nothing.** Say plainly that the server is older than this plugin,
  and hand off: `/commonground:point <wiki>` in a project, then restart the session and seed there.
  Never retry the argument in a loop, and never fall through to seeding whatever answered.

**5. State the target once, then stay on it.** Name the wiki you are seeding at the top of the arc.
For the rest of this session **every seed-path call carries the same `wiki:`** — the reads in step 1
just as much as the writes in step 7. A `get_coverage` that forgets it reads the wrong wiki's
checklist and then interviews the user against sections that aren't theirs, which is a wrong-wiki
failure that produces no error and looks like a working session. Do not re-ask the target later —
not at a branch, not at a gap, and not on re-entry: the beats in 1a resume a *wiki*, and the target
was settled here.

## 1. Read the current state — one call, then talk

**Local-clone mode: run `commonground coverage [wiki]`** (add `--json` for the structured form).
It reads the FOLDER — unpublished pages included, which is the wiki being seeded here — and it is
the only read a `(Free plan)` wiki has: the connector does not serve one. It gives `progress`,
the section rows, `chartered`, the charter's `categories`, and the team's `shape` — step 2's
confirm line reads that `shape`, and `assumed: true` means it is the default rather than the
recorded one, so treat it as unknown and ask openly instead of confirming it. The charter's
audience is not in this output: read it from `wiki-charter.md` in the folder at the step that
needs it. It does not know `callerDiscipline` or the `seeding` cursor either, so ask the
discipline once and skip 1a's re-entry beats (open as `fresh`, or as a top-up if pages exist). Do NOT call `get_coverage` for a local-mode seeding even when the connector is
attached: it describes the published wiki, and would report as empty the sections you filled ten
minutes ago and have not pushed.

**MCP mode:** call `get_coverage`, with the `wiki:` argument whenever step 0 targeted
another wiki. It answers everything the arc needs to open: overall `progress`
(`done`/`total`/`pct`), one row per section (`status` done/partial/empty, its `prompt`, `scope`,
`havePageIds`, and per-section counts), **`callerDiscipline`** — the user's own discipline
(pm/dev/design/qa/exec/other), the seeding lens — plus `chartered`, `audience`, and the `seeding`
re-entry cursor (step 1a). Empty-vs-populated falls out of the counts: every section at zero is a
first run; anything else is a top-up.

**That one call is the whole opening scan (SER-257).** Don't front-load `get_awareness`,
`get_index`, or a charter `get_page` here — read the charter page (`wiki-charter`, or
`company/wiki-charter` on an older wiki) at the step that actually needs its prose (the retrieval
brief and excludes), and the index when import triage calls for it (step 5). The person who
invoked seeding is holding the answers; the first minute of the arc belongs to their words, not
to a tool feed.

**Read ONLY the wiki being seeded.** The connector's own instructions push toward consulting the
session's wiki whenever its keywords come up — that reflex belongs to ANSWERING questions, not to
seeding a different wiki, and it is how a seeding session quietly reads a personal wiki to ground
a shared one. Grounding from any other wiki — especially personal → shared, the
privacy-sensitive direction — is offer-and-consent, never silent: *"Your personal wiki has three
Acme pages — want me to draw on them here?"* No consent, no read; and never quote another wiki's
content into this one without it.

`get_coverage` is **charter-aware**: once a charter exists it reports `chartered: true` plus the
charter's `audience`, and when that charter lists sections its rows ARE the charter's Structure
list, the wiki's own definition of complete. With no charter, the rows are the org-shape template
(the pre-charter fallback). A charter saved from a blank start lists no sections: it still reports
`chartered: true`, and its rows are a template's, none of them carrying a `category`.
`commonground coverage` reports the same, so `chartered` means one thing in both modes: a charter
is in effect.
The charter page itself is meta: the server excludes it from section counts and `pageCount`.

- If `callerDiscipline` is present, use it — **don't re-ask** their discipline.
- If it's `null` (unknown), briefly ask which of pm / dev / design / qa / exec / other fits them.
- **Empty** (all counts zero) → frame this as first-run seeding. **Populated** → frame it as
  "let's fill what's still thin," resuming from the coverage above (skip the from-scratch
  interview unless they want it).

### 1a. Re-entry — open on the RIGHT beat

`get_coverage` also returns **`seeding`**, which says what the last session left behind. Charter and
coverage only show what was *written*, so without this an interview three questions deep that hadn't
yet produced a page looks identical to a first run — and the person most likely to need help, the one
who stopped partway, gets the beginner's greeting. Open on the matching beat:

- **`fresh`** — no session on record. Proceed as first-run.
- **`resume`** — the same person, recently. Pick up mid-thought: *"Picking up where we left off — we
  were on **Key decisions**."* Don't recap the whole arc, and **don't re-ask any `askedQuestionIds`**.
- **`abandoned`** — the same person, but a while ago. They will not remember where they were, so
  re-orient in one line before continuing: *"Last time we got as far as **Key decisions** — N of M
  sections are filled. Want to carry on there, or pick somewhere else?"*
- **`other`** — somebody ELSE was seeding this wiki. Say so and let them choose rather than silently
  interleaving two interviews: *"Alex was seeding this about ten minutes ago, on **Key decisions**.
  Want to continue where they stopped, or take a different section?"*

**Record progress as you go (MCP mode).** In local-clone mode there is no cursor to keep: the
files in the folder ARE the progress, and `commonground coverage` reads them back — skip this, and
never treat the tool's absence or refusal as a reason to stop seeding. After each section, call
**`save_seeding_progress`** with the `sectionId` and every question id you have put. Call it once more with `done: true` when seeding
finishes, which clears the cursor. It stores POSITION ONLY — never answers, which belong in pages.

Be honest about the limit if it comes up: an answer given but not yet written to a page is still
lost. What resuming guarantees is that you won't be asked the same question twice.

## 2. Charter the wiki (first run — skip when coverage reports `chartered: true`)

A few quick questions, then one small page. Keep it to ~3 minutes — it's a conversation opener,
not a ceremony.

**Content first, structure second.** Ask what they actually do, then name the sections from their
answers. Never the other way round: a section list presented before a single question about their
work is a template, and "accept, edit, or reject this template" is a far worse prompt than
describing your own work and hearing it named back. The order below is the point of this step.

1. **Audience.** *They have probably already answered this* — it is the first question the web asks
   when a wiki is created, and the answer is recorded as the team's **shape** (`get_coverage`
   returns it). **Don't ask it cold.** Read the shape and CONFIRM in one line instead:

   | shape | say |
   |---|---|
   | `solo` | *"You set this up as a personal wiki — just you. Still right?"* |
   | `team` | *"This one's for your team. Still right?"* |
   | `company` | *"This one's company-wide. Still right?"* |

   Only ask the open question — *Who is this wiki for?* — with **Just me** (a personal context wiki)
   / **My team** / **The whole company**, when the shape is genuinely unknown, or when they say the
   recorded answer is wrong. Asking someone the same question twice in two minutes, in the same
   words, is how a product tells them nothing it collected was remembered.

   The answer sets the tone rules above, what curation may flag, and (later) the retrieval
   instructions. The **charter page stays canonical** — shape only supplies the starting point.
2. **What is this for? Ask TWO OR THREE OPEN QUESTIONS — before naming any section.** Plain
   questions, one at a time, conversational (not AskUserQuestion — these are open-ended). Pick by
   audience:

   | audience | ask |
   |---|---|
   | `just-me` | *"What do you actually spend your time on — work, projects, the things you keep coming back to?"* · *"What should your Claude always know about you, that you'd otherwise re-explain in every new chat?"* · *"What are you deciding or wrestling with at the moment?"* |
   | `my-team` | *"What does this team actually make or do — in your words, not the org chart's?"* · *"How does work happen here: who decides what, and how does something get from idea to shipped?"* · *"What's already been decided that someone joining next week would need to know?"* |
   | `whole-company` | *"What does the company make, and for whom?"* · *"How is it organized — what are the parts, and who owns what?"* · *"What decisions or policies does everyone need to be working from?"* |

   **Skip** anything they can't answer, and stop at two if the first two were rich — this is not an
   interrogation. If they answer in one word, don't push: fall through to the template fallback in
   step 3 and let structure emerge from content later.

   **These answers are CONTENT, not just charter input.** Hold on to them verbatim. Record the
   question ids with `save_seeding_progress` (MCP mode) so re-entry doesn't re-ask them, and — critically —
   **Branch A must not ask the same things again** (step 4): draft its first page(s) straight from
   these answers, and open there rather than at question one.
   **If they have another wiki, read its charter before naming anything (SER-272).** A second
   wiki is seeded alone by default, as though the first did not exist — and then two connectors claim
   the same subjects. List their wikis (`commonground use`, or the session's memberships); for each
   other one, read its charter (`get_page` `wiki-charter` with `wiki: <that teamId>` in MCP mode —
   its audience, Structure and brief; or the clone's `wiki-charter.md` when it is cloned here). Draft
   THIS charter so it does not re-claim territory that wiki already holds as its subject: a personal
   wiki beside an employer's wiki describes the person's own part in the company, not the company;
   two team wikis name what each team owns. Never write a sentence naming the other wiki — describe
   this one more sharply instead. After seeding, `/commonground:lint` compares the two for real.
3. **Structure — named from what they just said.** Derive **4–8 sections from their own answers**,
   using their nouns: "I coach three clients and write a newsletter" gives you *Clients* and
   *Writing*, not *Mission* and *Personas*. Show each with a one-line "what goes here", and where
   it's not obvious, say which answer it came from — a section they can trace to their own sentence
   is one they'll correct rather than shrug at. Then ask: **Use this structure** / **Edit it with
   me** / **Start blank** (just `index.md`; structure emerges as content lands).

   Editing is conversational free text: add / rename / drop.

   **Fallback, not opener:** only if they said almost nothing, fall back to the shape template's
   sections from `get_coverage` — and say that's what you're doing, so a generic list is never
   passed off as a reading of their work. Never present the template first.

   The final list is **this wiki's own definition of complete** — and it is also the wiki's
   **category vocabulary**: every page written afterwards carries one or more of these sections in
   its `tags:`, and that is what groups it in the catalog. So keep the list small and keep the names
   ones a person would actually reach for. It names sections — not folders: folders come into
   existence when pages are written into them, they group nothing, and nothing here reserves a path.
4. **Retrieval brief.** If `./CLAUDE.md` has the fenced CommonGround router block (written by
   `/commonground:point`) **and it names the wiki being seeded**, show the user its trigger sentence
   verbatim; if this project was never pointed anywhere, or is pointed at a different wiki than the
   one you are seeding, skip the show-and-tell and just capture the brief below — a trigger sentence
   from another wiki's router block is not this wiki's to approve.

   **Say whose words they are.** That sentence was written by `init`, when the project was pointed, in the DEFAULT
   voice — it is not theirs, and presenting it for approval as though it were invites a shrug and a
   "sure, fine". Name it: *"That's the generic version `init` wrote. Once you've chartered the wiki
   I'll rewrite it in your words."* Then explain that this text (plus a keyword nudge derived from
   page titles) is what sends an AI to the wiki, and that it re-renders from the charter — audience
   framing, the wiki's name and its Structure sections, plus their brief as a trigger line. Ask:
   **Keep the default** / **Tailor it**. Tailoring: capture 1–3 sentences in the user's own words —
   which topics or questions should route here (for a just-me wiki this is the crucial fix: e.g.
   "anything about me — how I work, my projects, my preferences, my history"). **Describe this wiki,
   never another one.** A brief that says "for Acme questions, use the Acme wiki" is a cross-reference
   to a wiki a teammate may not have, and it tells everyone who reads the charter which wikis the
   author belongs to. A sharper self-description ("my own part in the companies I worked at") routes
   the same way and leaks nothing — and the frames already carry the general rule (an organization's
   own wiki answers for the organization; a personal wiki answers for one person's part in it), so
   the brief only has to say what THIS wiki is about.

   **Pinned keywords — define, don't fish.** Their one job is trigger PHRASES no page title would
   ever produce: "catch me up", "what did I miss", a codename that never appears as a title. The
   keyword hook already harvests every page title and id, so pinning an entity that has a page (a
   company, a product, a person) is a no-op for the hook and noise in the instruction — which names
   the wiki and enumerates its Structure sections on its own. Empty is the usual answer; offer it
   as such rather than asking for a list.
5. **What does NOT belong.** Ask it plainly — "is there anything that should stay OUT of this wiki,
   and where does it live instead?" Capture their answer in their own words (e.g. "client work
   stays in Notion; nothing about my day job lives here"). This is the contract's other
   half: without it every surface only ever says *consult this wiki*, so material drifts in and the
   wiki stops being trustworthy. Skip it gracefully if they have nothing to exclude — an absent
   Excludes section renders exactly as before. Also mention what it does: the connector's
   instructions start saying where that material belongs instead, and the CLAUDE.md router block
   points Claude at the charter page for it (it no longer quotes the anti-scope itself).
   The self-description rule holds here too: say what this wiki is NOT about, never which other
   CommonGround wiki should answer instead.

   **The anti-scope never changes the checklist: reconcile it with Structure here, with them.**
   Coverage counts pages against the Structure list from item 3 (the default sections for the
   wiki's shape when they chose Start blank) and reads nothing else, so a section stays on the
   checklist until it leaves that list. Before you draft the charter, read their answer against
   the list:

   - **It rules out a section you listed** ("no meeting notes here", against a *Meetings* section):
     say so, and offer to drop that section from Structure. Drop it only on their yes. A section
     that is both listed and ruled out is a gap the wiki gets asked to fill for good.
   - **They chose Start blank, and it rules out one of the default sections:** there is no list to
     drop it from, and a default section leaves the checklist only when a Structure list replaces
     the defaults. Say so, and offer to write Structure as the defaults without that one. Only on
     their yes; otherwise the section stays as a gap, and say that too.
   - **It says what the wiki IS, not what stays out** ("professional profile only"): it removes
     nothing from Structure. Offer it back as what stays out ("so nothing about your private life
     goes in here. Is that the line?") and write Excludes from the wording they confirm. The
     connector quotes that section to every session as where the wiki's scope ends, and tells it
     not to file what the section rules out, so an "X only" sentence there names nothing to keep
     out.

Draft the charter page, show it, and on confirm **persist it right away** (don't defer to
step 7 — it's the contract everything below reads). It goes at the reserved pageId `wiki-charter`
(repo root) — that id is the only thing that makes a page the charter:

```markdown
---
title: Wiki Charter
updated: <today>
---

## Audience
<one of: just-me | my-team | whole-company> — plus one line on who reads/writes here.

## Structure
- <Section> — <what belongs there>   (one bullet per section — the coverage checklist AND the
  page-category vocabulary: pages carry these names in `tags:`; the router instruction also
  enumerates them — *consult it for anything related to <the wiki>: <these names>* — so name them
  the way a reader would say them)

## Retrieval brief
<When an AI should consult this wiki, in the user's words.>

## Pinned keywords
<comma-separated, optional — usually empty. Trigger PHRASES no page title would produce ("catch
me up", "what did I miss", a codename that is never a title). Not entity names: every page title
and id is already a keyword, and the instruction names the wiki and its sections on its own.>

## Excludes
<What does NOT belong here, and where it lives instead — in the wording the user confirmed, said
as what stays OUT (never an "X only" sentence: that says what the wiki is). Optional. Describe
what THIS wiki is not about; never point at another CommonGround wiki — the charter is shared
content, and a sharper self-description routes the same way without naming a wiki a teammate may
not have.>
```

Keep the `##` headings exactly as written — the server parses them (coverage builds its checklist
from Structure and from nothing else, falling back to the shape's default sections only when
there is no Structure list; the keyword trigger unions
Pinned keywords; both instruction surfaces name the wiki and enumerate its Structure sections; the
connector's instructions render Retrieval brief and Excludes in full, the CLAUDE.md router block
carries the brief's first sentence as the wiki's trigger and points at the charter for the rest).

With the charter persisted, make it live **in this project — but only if this project actually reads
the wiki you just chartered.** Check the router block first (`commonground status` names the wikis
this project reads): if the wiki is one of them, run **`commonground init --refresh`**, which
re-renders the fenced block in the wiki's own voice — its kind (personal for a just-me wiki), its
name and Structure sections, the brief's first sentence as its trigger line — and absorbs any
leftover `retrieval-brief` marker block from earlier plugin versions. Never hand-edit inside the
fence. **In the home folder, a folder that holds it or the top of a drive, say what that refresh
does before you run it, and run it on their yes.** That is every folder where `probe.folder` in
`commonground status --json` is not `project`. Step 0 reads that output for the quiet-checks
answer; run it now if this session has not. There the note it re-renders is the one every folder
under this one reads, and it writes the wiki's keys (`COMMONGROUND_WIKI`, and `COMMONGROUND_WIKIS`
for a folder that reads several wikis) into `./.claude/settings.json` when they are missing or
differ, keeping every other setting. In the home folder that file is the user's own Claude Code
settings: say so. If this folder reads no wiki, or reads some OTHER wiki, `--refresh` has nothing to do with
the one you just chartered: say so in a sentence (*"the charter is saved; run `/commonground:point <wiki>` in the
projects that should read it"*) and move on. The MCP connector's instructions pick the charter up
automatically (per session/request) — no extra step there.

## 3. Fork: build fresh, or import what you have?

If `$ARGUMENTS` is a folder path, treat that as "import" and skip the question. Otherwise ask
(AskUserQuestion): **Build from scratch** (I interview you and draft pages) / **Import an existing
markdown folder** (a notes folder, a `docs/` tree, a Notion/Confluence export — normalized in) / **Import, then
top up** (import first, then interview the thin spots). All paths write real pages and end at the
same gap-fill loop (step 6).

## 4. Branch A — build from scratch (the checklist-walk interview)

Walk the **charter's Structure list** (fallback: the coverage rows) as the checklist — it is both
the interview *and* the progress bar.

**Start by banking what step 2 already told you.** They described their work two minutes ago; those
answers are page material, not just charter input. Draft the first page(s) from them, show them, and
open the interview at the FIRST STILL-EMPTY section. Re-asking "what does your team do" here, right
after they answered it, is how an arc tells someone their words went nowhere — and it is the exact
failure the reordering in step 2 exists to prevent. Anything already recorded in
`askedQuestionIds` is off the table too.

1. Deepen the durable "starting context" sections with the discipline question bank (all
   audiences): read `seeding.md` in the `maintainer` skill folder and use the section
   for the user's discipline (from `callerDiscipline`). Its questions map each answer to a
   concrete page (pageId, title, scope). For a **just-me** wiki, adapt at ask time — reword
   the team-phrased questions to the person ("what should your AI always know about how you
   work?") **and re-target answers to the charter's own sections** (the bank's pageIds and team
   framing are a starting point, not a layout — pick pageIds that fit the charter's structure, and
   create folders by saving pages into them). Never edit `seeding.md` itself; it's generated.
2. **Ask one question at a time**, conversationally — these are open-ended, so plain questions,
   not AskUserQuestion. **Skip** anything the user can't answer yet — never block, never invent an
   answer.
3. For each answer, **draft one schema-correct page** (frontmatter `scope` from the
   `seeding.md` mapping or the checklist section; `updated` = today; the user's answer as the
   body). Set **`tags:` to the charter Structure section(s) this page fills** — the checklist row's
   own `category` — and coverage then matches it exactly, with no pageId wordplay needed. Give it a
   real body too: a hollow stub ("TBD") never ticks a section however it is tagged. See the
   `maintainer` skill for the frontmatter contract and golden rules.
4. **Show the drafted page and persist only on the user's confirm** — never auto-write. Then
   persist (step 7). Each saved page visibly ticks a section of the checklist.

## 5. Branch B — import an existing markdown folder (triage, then normalize — don't dump)

The hero path when content already exists. Nothing lands raw — imported content becomes
schema-valid, retrievable pages, not files that look covered but answer badly.

**Survey.** Get the folder path (`$ARGUMENTS` or ask for it). Read the layout: count the markdown
files and **cluster them** by folder/topic (e.g. "14 psychology notes · 8 client docs · 5 book
summaries"), and check for overlap with what the wiki already has — **in local-clone mode read the
page FILES in the folder**, not `index.md`: the catalog is machine-generated and regenerates on
`/commonground:push`, so anything written this session is missing from it and there is no verb that
rebuilds it in place. `get_index` in MCP mode. Either way, likely **duplicates** are flagged up
front.

**Triage.** Keep clusters coarse — top-level folders/topics, aim for **≤8** even on a big tree.
Show the cluster summary, then decide. For a **large import**, start with one **multiSelect**
question ("which clusters should I leave out?"), default the kept clusters to Normalize, and
refine per cluster only where the user cares. For a **handful of clusters**, decide per cluster
(AskUserQuestion, one question per cluster, batched ≤4 at a time): **Import as-is** (body preserved,
apart from trimming blank lines around it; only backfill valid frontmatter) / **Normalize**
(restructure into schema-correct pages, merge near-duplicates) / **Skip**. Base recommendations on retrieval usefulness and
duplication — **never** on content being "too personal" (the charter's audience decides what
belongs; for just-me, everything is in-scope). The user's call is final.

**A folder tree with its own subfolders keeps them, verbatim.** Import preserves paths exactly — a page's
path IS its pageId. Never restructure a tree the user already built. But a folder no longer groups
anything: **give each page a `tags:` naming the cluster its folder represents**, or the whole import
lands under `(uncategorised)`. Prefer the charter's own `## Structure` wording where a folder matches
one — `psychology/` under a charter section "Psychology notes" is `tags: [psychology-notes]`.

**A flat folder with no subfolders: offer sections, don't impose them.** A flat pile imports flat, which is
honest and perfectly fine for twenty notes — but one unlabelled alphabetical list of two hundred is
unusable, and that is exactly when help is worth most. You have already clustered these files by
topic to run the triage above, so the work is done; the only question is whether the user wants it
applied. Ask once (AskUserQuestion), with flat as a first-class answer:

> *"These 47 notes have no folders. I'd group them as **Psychology · Clients · Book notes ·
> Recipes** — file them that way, keep everything flat, or would you rather name the groups?"*

**File them** → put the cluster name in each page's **`tags:`**, not in its path — that is what
groups it, and it means nothing has to move. **Keep flat** → no tags yet, and say the pages will sit
in the catalog's `(uncategorised)` bucket until they're categorised. **Let me name them** → take
their names and use those. Prefer the charter's existing `## Structure` sections when a cluster
clearly matches one — don't invent a second vocabulary for the same thing. This is a proposal about
*how pages are grouped*, never a reason to change what a page says.

**Before importing:** if the folder's root `index.md` is a real home/MOC note (prose, not a
generated list), save it as a proper page first (e.g. `overview`) — import will **not** take
a root `index.md`, because the wiki regenerates its own catalog there. Same for a root `log.md`.

**Execute.**
- **Local-clone mode** (admins/curators): know the CLI's limits — `commonground import` is
  **frontmatter-only** normalize (backfill/validate; it never merges or restructures bodies). So:
  stage the kept clusters into a scratch folder **preserving relative paths** (or use the folder
  directly when everything is kept as-is); staging never moves a file — when the user chose to
  **file them**, the cluster name goes into each staged file's `tags:`, which is what groups it, so
  a flat folder stays flat on disk. Pick a scratch folder that the file tools and the shell spell the
  same way: an absolute path under the user's home, such as `<home>/commonground-import-<wiki>` (on
  Windows with forward slashes, `C:/Users/<you>/commonground-import-<wiki>`), never `/tmp`, which
  the Bash tool on Windows maps to a different folder than the one the file tools write. For
  clusters marked **Normalize**, do the
  restructuring/merging yourself in-session first, editing the staged files; then run
  `commonground import "<staged folder>"`, quoted (and with the wiki named after it, `commonground
  import "<staged folder>" <wiki>`, whenever the wiki you are seeding is not this project's
  primary: step 0.3). It overlays the folder onto the clone, **backfills
  missing/invalid frontmatter** (carrying `tags`/`aliases`/`created` onto the schema and preserving
  any other frontmatter key verbatim — an imported `tags:` is the source folder's own **legacy label**, not
  a category, so assign the charter category the cluster belongs to as well), **regenerates
  `index.md`** from the whole wiki — it never imports the source folder's own `index.md`, `log.md`
  or `CLAUDE.md`, and never overwrites anything already under `sources/`. Then it commits and
  pushes. **Relay the CLI's receipt to the user verbatim** — it names what wasn't imported and
  what frontmatter it couldn't carry; that's the answer to "can I retire the original?", so don't
  summarise it away. A file left out because some machine cannot hold its name (a character Windows
  refuses, a name ending in a dot or a space, a device name like `con`, or a name that differs from a
  page already there only in capitals) can come in under a new name: offer to rename it in the
  staged folder and import again. If `import` refuses instead over a file ALREADY in the wiki folder
  with such a name, nothing was committed or published: handle it as `/commonground:push` §3c says
  (rename it in the wiki folder, then publish with `/commonground:push`; the imported files are
  already there), naming the wiki in that publish when it is not this project's primary. A refusal saying two names `differ only in letter case, and this machine can hold
  only one of them` means what it means there: nothing can be published from this machine, and no
  rename here fixes it. One thing to say out loud: each page keeps its **real** date (its own
  frontmatter date, else the file's modification time), so genuinely old notes will read as old and
  `/commonground:lint` may flag them **stale** — that's the honest signal, not a bug.
- **MCP mode (no local clone):** do the normalize in-session, honoring each cluster's triage
  choice (as-is = body untouched + frontmatter backfill; normalize = restructure/merge). Read the
  folder yourself (your Read / Glob tools — a remote MCP can't reach local files). For each doc:
  derive a `pageId` that mirrors the source folder's own structure — a flat folder stays flat, since
  the cluster the user agreed to rides in `tags:`, not in the path — and that follows the **pageId
  rule** in the `maintainer` skill. A Mac lets a note be called `Q3: plan?.md` and Windows cannot hold
  that name, so the server refuses it as a new page: fold such a name to lowercase words joined by
  `-`, and say which ones you renamed. Then write **valid frontmatter**
  (title from the H1/filename, and `updated` = the doc's own date if it has one,
  else today — don't restamp real modification dates). Don't add a `scope`: an imported folder never
  declared one, and inventing `company` puts an org word on somebody's own notes. **Carry the source's frontmatter across**: `tags`/`aliases`/`created` are
  first-class fields, and any other key rides along untouched; only a near-miss of a contract key
  (`Tags`) has to go, and say so when it does. An imported `tags:` is the source folder's own **legacy
  label**, not a category — add the charter category for the cluster this page came from alongside
  it, or the import re-creates a free-form vocabulary on the hero onboarding path.
  Prefer **updating** an existing page over a near-duplicate (`get_index` first). Persist each
  with `save_page` (CAS-guarded: on a conflict, `get_page` for the fresh `baseSha`, merge, retry).
  Stage genuinely-raw material under `sources/` with `stage_sources` where it helps, but land
  curated pages via `save_page`.

**Post-import — say where the wiki lives now (there are two copies, and only one is the wiki).**
Import **copies**; it never adopts the folder. So, in this order:
1. Re-read coverage — `commonground coverage` in local-clone mode (the wiki named, when it is not
   this project's primary), `get_coverage` in MCP mode —
   and the index, and report how the import mapped onto the **charter's structure** — which sections it filled, which are still thin.
2. Name the canonical copy: **the wiki folder is the wiki** — the copy CommonGround syncs,
   publishes and serves. The folder you imported was left untouched and is now a separate copy that
   will drift.
3. **Delete the scratch staging folder** if this flow created one (it's a scratch copy, not the wiki —
   the CLI receipt names it as the source). Never delete the user's own source folder.
4. Offer the convergence choice when they imported a folder they actually work in: **repoint their
   editor** at the wiki folder (plain markdown — it opens in Obsidian or any editor; the path is
   the one `commonground folder <wiki> --where` gives) so there is one copy again, or **keep working in the
   original** and accept that every change needs another import run — which you do for them, on
   request — to reach the wiki. Their call; just don't leave it unsaid.

That leads into step 6.

## 6. Shared tail — fill the remaining gaps

Whichever branch ran, finish on the gap-loop (the same gap-fill `/commonground:lint` offers,
inline): re-check
the **charter's Structure list** against what exists, take the still-empty/thin sections
most-impactful-first — offer the pick as an AskUserQuestion (the top **3** gaps + "somewhere
else") — and
for each, interview + draft + confirm + persist one page at a time, skipping what the user can't
answer yet. **A gap they say does not belong in this wiki is not one to fill:** when a still-empty
section is one the charter's Excludes rules out, or the user says it should not be here, offer to
drop it from the charter's Structure list (the `wiki-charter.md` file in a local folder,
`save_charter` in hosted mode) and drop it only on their yes. It is the one way a section leaves
the checklist; a wiki chartered before coverage stopped reading Excludes can carry such a section,
and it would otherwise be asked for at every session. **In hosted mode read the charter first**
(`get_page` `wiki-charter`, or `company/wiki-charter` on an older wiki) **and send every field back
with that section removed:** `save_charter` replaces the whole charter, and a field left out is
erased. **If neither id reads, stop and say so: never call `save_charter` with a charter you could
not read.** In a local folder it is the same two names as files; edit the one that exists. When the charter has no Structure list
the rows are the shape's default sections: offer to write Structure as those rows without that
one, since a default leaves only when a list replaces the defaults. Every page you draft here gets a `summary:` that **partitions** with its title instead
of echoing it — the title is the page's name, the summary is what is *inside* it, so `Rocket skates` +
`Twin solid-fuel rockets on roller skates, no brake, retired Aug 2026` beats `Rocket skates —
retired gadget (no brake)` + `Retired gadget, no brake`. Seeding is where a wiki's first twenty titles
get written, and a title that swallows the summary is written once and read forever. Stop when the user is done or the important sections are covered; they can always run
`/commonground:seed` again later to pick up where they left off.

**When a gap isn't theirs to fill, offer to hand it over** (shared-audience wikis only — never for
`just-me`). A section carries a `discipline`, and "I don't really know this one" is the most common
way seeding stalls. If the user is an **admin** (their role in this wiki is on `commonground status <wiki>`; having
`invite_teammate` in your tool list is not the test, since a session can be without the connector's
tools for a reason that has nothing to do with the role, and for an admin without the tool the rule
under **Setup has two sign-ins** applies), name the
person who would know and offer a *delegated* invite:

> "Design decisions is design-owned and you've said it's not your area — I can invite your design
> lead with that section queued up, so they land straight on it."

Call `invite_teammate` with the section's **`id` as** `targetScope` (from `get_coverage` — never
invent one), and only once the user has confirmed the email address and role. Whether the invitation
is emailed for them or only comes back as a link to pass on depends on the deployment — **read
`delivery` in the result and say which happened**, never promise either. The accept link always
comes back. Then move to the next gap rather than waiting. If the user isn't an admin, say who to ask instead of offering something you cannot do.

**`invite_teammate` takes no `wiki:` argument: it invites into the wiki this session's connector
answers for.** Every tool response ends with `[commonground] answered from wiki <id>`, so read
that off one before you offer, and offer the invite only when that wiki is the one you are
seeding. In every other case say the invitation goes out from the Team page of the CommonGround web
app, or from a session in a project pointed at this wiki: an invite sent from here would add the
person to another wiki.

## 7. Persist + close

Persist every confirmed page:
- **Local-clone mode:** write the files (each with its own `summary:`), then **offer**
  `/commonground:push --message "seeded the wiki from the <discipline> interview — N pages"` (or
  `"imported <folder>"`) — the wiki is seeded either way; publishing is a separate, asked-for step.
  When the wiki you seeded is not this project's primary, name the wiki in that offer and in the
  publish, so it cannot land in the wiki this folder reads.
  If the user is a member, say the work is saved in their copy and offer `suggest_change`,
  **passing `wiki: <teamId>` whenever the wiki you seeded is not this project's primary** (in a
  folder that reads no wiki, always): without it the suggestion is filed in the wiki this session's
  connector answers for.
- **MCP mode:** `save_page` per page (CAS-guarded; re-read + retry on conflict) — each one is
  immediately live for the team.

**If a save or a publish comes back refused over the wiki's subscription, stop the persist step
there.** A sentence about the wiki's **subscription**, or about **payments** that did not go
through, is a billing state: not a connection fault, not a role gate, and not something a retry or a
different wiki gets around. Relay it as the server worded it, say by name what landed before it and
what did not, and never re-route the remaining pages into another wiki or another mode to get them
written. Nothing already in the wiki is deleted, and reading, search and `/commonground:pull` keep
working. The fix is **Billing** in the CommonGround web app, where a wiki admin restores the
subscription; if the user is not an admin of this wiki, the step is to tell one. In local-clone mode
the pages are already safe in their own copy, so say that before anything else, and offer to resume
seeding once it is back.

Close with a short, encouraging status that is **audience-aware and true about where the pages
are**. "Live" is a claim about the hosted wiki, so only say it when something was actually
published:

- **Local mode, nothing pushed yet** (the usual end of a local seeding run): *"N of M sections
  covered, saved in your wiki folder. Nothing reaches the team until `/commonground:push`."* For a
  just-me wiki: *"…saved in your wiki folder. It reaches your other Claude sessions when you
  publish."* Never "your wiki is live" here: the pages are on this machine and nowhere else, and a
  user who believes otherwise stops before the one step that shares them.
- **Local mode, they published** → then it is live; say what the push sent.
- **MCP mode, just-me:** "Your wiki is live — N of M sections covered. Your Claude now starts every
  session from your own context."
- **MCP mode, my-team / whole-company:** "Your wiki is live — N of M sections covered. Your
  teammates' Claude now starts from this context."

Then, **in MCP mode**, call **`save_seeding_progress` with `done: true`** — that clears the cursor,
so the next run opens as a fresh top-up rather than trying to resume a session that finished. In
local-clone mode there was no cursor to keep, so there is nothing to clear.

**Then hand off to pointing — that is the next beat, not the previous one.** A wiki with content in
it is only useful where the user actually works, so close by offering
**`/commonground:point <wiki>`** in the repos they spend their time in: *"Run
`/commonground:point acme-handbook` in any project and I'll answer from this there too."* Say it even
when THIS project is already pointed at the wiki — one project is rarely all of them. In MCP mode,
a project pointed during a live session needs a restart before its connector follows.

**In local mode, say where the wiki is, once more, as the last thing about it.** Seeding connected
no project, so the folder is the one place the wiki lives on this computer: name its path, say
that a session opened on that folder works in the wiki directly, and that every other folder reads
it only after `/commonground:point` is run there.

Note it's resumable (`/commonground:seed` again) and point admins/curators at
`/commonground:ingest` (capture anything new — notes, docs, decisions) and `/commonground:lint`
(health + remaining gaps) to keep it growing. Both act on the wiki a session's folder reads, so
say where they work for this wiki: a session opened on the wiki folder, or a project pointed at it.

**If they have more than one wiki, name the check.** *"You now have two wikis — run
`/commonground:lint` and I'll show where they overlap and settle which answers for what."* That is
the moment the boundary question becomes real (SER-272), and seeding is only one of the three ways
to arrive there (joining a wiki and ordinary drift are the others).

### If it doesn't finish

Seeding runs in this session on the user's own tokens, so it can be interrupted — the context gets
compacted, an import is larger than it looked, or they simply stop. None of that is a failure, and
none of it should be reported as one.

- **They stop partway.** Say what landed and how to come back, in one line: *"Saved what we have —
  N of M sections. `/commonground:seed` picks up here whenever you want."* Record the cursor first
  (MCP mode; in local-clone mode the files in the folder are the record).
- **An import is bigger than expected.** Say so before ploughing on: *"That folder has 200 files —
  I'll work through them in batches and save as I go, so nothing is lost if we stop."* Persist each
  batch rather than holding everything to the end; a run that dies at file 190 must not lose 189.
- **An import fails partway.** Report what DID land and what didn't, by name. Never re-run a whole
  import silently — `stage_sources` is content-addressed, so re-staging is safe, but the user should
  be the one to decide.
- **Nothing landed at all.** Say that plainly too. A seeding session that produced no pages and
  claims success is worse than one that admits it stalled.

Finally, if the user also works in **claude.ai Chat** — and this wiki is NOT marked `(Free plan)`
in the listing, because Chat reaches a wiki only through the hosted connector and a marked wiki is
not served one — offer to bridge it: now that the charter
exists, you can print a Chat instruction **tailored to its audience** (retrieval brief + pinned
keywords) that they paste into Profile preferences or a Project's custom instructions. Follow the
`maintainer` skill's **bridge-to-Chat** procedure. It's a different surface from this project's
`CLAUDE.md`, so it's purely additive.
