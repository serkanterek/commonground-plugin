# CommonGround for Claude Code

A curated, version-controlled **context wiki**, for your team or just for yourself, available
inside Claude. Ask a question and Claude consults it and cites the pages it used, instead of
guessing. Tell Claude what to keep and it writes it into the right pages.

Curation runs **in your own Claude session on your own tokens**. CommonGround's backend does
storage, retrieval and auth; it never runs an LLM on your behalf.

**CommonGround is in private beta: creating a wiki needs an invite. Request one at [commongroundapp.io](https://commongroundapp.io).**

## Example prompts

Three to start with, once the plugin is installed:

1. `/commonground:seed` fills a new wiki. Claude signs this machine in, agrees with you who the wiki
   is for and what it holds, and writes the first pages from a short interview or from notes you
   already have.
2. `What did we decide about pricing, and why? Use the wiki and name the pages you read.` In a
   project you have connected with `/commonground:point`, Claude answers from the wiki and cites
   the pages it used.
3. `/commonground:ingest We moved the launch to March because the audit slipped.` Claude writes the
   decision into the right pages.

## Install

If you installed this plugin from Claude's plugin directory, you already have it: skip the two
lines below. They install the same plugin from CommonGround's own marketplace, so use one or the
other, not both.

```
/plugin marketplace add serkanterek/commonground-plugin
/plugin install commonground@commonground-plugins
```

Then **fill your wiki**, from any project. It doesn't need to be set up first:

```
/commonground:seed
```

That signs this machine in (a one-time browser step), asks which wiki if you have more than one, and
runs a short guided interview: it charters the wiki (who it's for, what it holds) and puts the first
pages in. Pass a name to be explicit: `/commonground:seed acme-handbook`.

Then **point the projects you actually work in** at it:

```
/commonground:point
```

Run that in any repo, any time you want to aim somewhere else: it is the same command every time,
first run and after.

**A project can read more than one wiki.** Your personal wiki beside your team's, a product wiki
beside the company's: tell `/commonground:point` to *also* read a wiki and it is added alongside
what the project already reads (say *drop* to take one back out). Claude then answers from all of
them at once, each wiki speaking for what it covers, and says which one a fact came from.

### Keeping it up to date

If you installed from Claude's plugin directory, updates reach you through the directory and the
rest of this section is not for you. The plugin's own update notice still names the two commands
below, which are for CommonGround's marketplace.

**Turn on auto-update while you're there:** `/plugin` → **Marketplaces** → select
`commonground-plugins` → **Enable auto-update**. Claude Code leaves this off for third-party
marketplaces and does not tell you when a new version exists, so without it you will quietly stay
on whatever version you first installed. With it on, updates arrive within about ten minutes of a
session starting and Claude Code offers you `/reload-plugins`.

To update by hand instead:

```
/plugin marketplace update commonground-plugins
/plugin update commonground@commonground-plugins
```

Restart Claude Code afterwards: an update stages immediately but only applies on restart.

### Rolling it out to a team

Add the marketplace once in the repo instead of asking everyone to type it. In the project's
`.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "commonground-plugins": {
      "source": { "source": "github", "repo": "serkanterek/commonground-plugin" }
    }
  }
}
```

Anyone who trusts the folder gets the marketplace with no further prompt. They still install the
plugin themselves (`/plugin install commonground@commonground-plugins`); adding a marketplace does
not install anything from it.

If your organization uses **managed settings**, put `"autoUpdate": true` on that same entry there.
That turns auto-update on for everyone at once, which is worth doing: it is off by default for
third-party marketplaces, and it is the only thing that reaches somebody who has stopped paying
attention. Everything else depends on them reading a message.

## What you need

- **Claude Code.** This is a Claude Code plugin; see [Where it works](#where-it-works).
- **A CommonGround account with at least one wiki.** Create both at
  **[app.commongroundapp.io](https://app.commongroundapp.io)**, once you have an invite. The plugin
  is the client; it needs an account to talk to, and the sign-in screen has nothing to approve until
  a wiki exists.
- **Node 20 or newer, on your PATH.** The plugin's hooks, the connector's wiki header and the
  command-line helper all run on it. Claude Code installed with its native installer does not need
  Node itself, so it may not be there. Check with `node --version`.
- **git**, for local-clone mode (the recommended one). 2.31 or newer signs in over the fast path; an
  older git still works, by a different route. No git on this machine means MCP mode, and
  `/commonground:point` offers to walk you through installing it.
- **On Windows: Git for Windows** for a local wiki folder, with
  `winget install --id Git.Git -e --source winget` or the installer from git-scm.com. It brings git,
  and the Bash tool Claude Code uses beside PowerShell; CommonGround's commands run from either.
  Restart Claude Code after installing anything, since a running session keeps the PATH it started
  with.
- **In WSL: install git and Node inside WSL** (`sudo apt install git`), never on the Windows side. The
  wiki folder then lives in Linux (`~/CommonGround/<wiki>`), and Windows apps such as Obsidian reach
  it at `\\wsl.localhost\<distro>\home\<you>\CommonGround\<wiki>`. Signing in may ask you to copy a
  link into your Windows browser.
- **Keep the wiki folder out of OneDrive and Dropbox.** A sync client rewriting files inside a git
  folder can corrupt it and keeps files open. On Windows, Documents and Desktop are often inside
  OneDrive, so the default `~/CommonGround/` is the safe place.

## What this plugin runs and writes on your machine

Installing the plugin adds, for every Claude Code session on this machine: seven commands, one
skill, one connector entry with a small header helper, the bundled CLI, and three hooks. All of it
runs on Node from files in the plugin folder: no code is downloaded when a hook or the CLI runs.
What they fetch is data: your wiki, facts about it, and whether a newer plugin has been published.

The hooks are dependency-free and run without a per-run permission prompt, so here is the complete
list of what they read and write. Two of them are fail-open (a hiccup never breaks your session).
The third is the publish guard: when it is unsure it asks you, and it never approves anything.

- **SessionStart** injects wiki context and tells Claude where this project's writes may land. What
  it says is text that ships in the plugin, filled in with facts it reads from CommonGround about
  your wiki: how many pages it has, what to do next, its keywords, whether a newer plugin exists,
  and the name of a section a teammate asked you to cover. CommonGround's server also supplies a
  few fixed phrases that depend on whether the wiki is personal or shared ("your wiki", "the team
  wiki") and, when a charter page is not taking effect, a short code saying why. On four occasions
  it asks Claude to show you a short message word for word: once after install, once after you
  first sign in, when a newer plugin has been published, and when a teammate invited you to cover a
  section that is still empty. In a project that is not connected to a wiki, on a machine that is
  signed in, it still adds one line telling Claude so and that `/commonground:point` connects it.
  To learn which wiki a project reads, it reads the `CLAUDE.md` of the folder you are in and of
  each parent folder until one carries the CommonGround block, and CommonGround's own files in the
  credential home. In the credential home (`COMMONGROUND_CONFIG_HOME`, default `~/.commonground`)
  it writes only `0600` files: a team keyword cache, a marker recording the running plugin build
  (one per session, removed after seven days), a first-install marker, and a record of the last
  release it checked for and told you about.
- **SessionStart also completes one credential move.** Before v0.4.1 the device token was stored
  *inside* the wiki folder, so moving the folder you open in Obsidian silently signed you out. The
  hook relocates it to `<COMMONGROUND_CONFIG_HOME>/credentials.json` by an exclusive hard link (so a
  concurrent sign-in can never be overwritten), fsyncs, and only then removes the old file. Anything
  unexpected aborts the move and leaves the original exactly where it is.
- **SessionStart can also record this project's wiki in `.claude/settings.json`.** A connected
  project names its wiki twice: in its `CLAUDE.md` block, and in the `env` of its
  `.claude/settings.json` (`COMMONGROUND_WIKI`, plus `COMMONGROUND_WIKIS` when the project reads
  several wikis). When the second is missing or disagrees with the first (a teammate's fresh clone,
  a repo that ignores that file), the hook runs the bundled CLI's `record-wiki`, which writes what
  the `CLAUDE.md` block says into those keys and keeps every other key in the file. A file that is
  not valid JSON is left alone. Claude tells you when this happened, because that file is often
  tracked by git, and the change applies from the next session. It is the only thing a hook writes
  outside the credential home.
- **SessionStart makes its network calls to CommonGround and nowhere else.** Normally that is one
  read of your wiki's state for each wiki the project reads (five at most). In a project you have
  not pointed at a wiki, or on a machine that is signed out, there is no wiki to read, so instead it
  asks whether a newer plugin has been published, no more than once every half hour and sending
  nothing but the version you are running. That is the only way a machine in that state ever learns
  an update exists, because Claude Code shows no update indicator and leaves auto-update off for
  third-party marketplaces. A session that is silent altogether stays silent: a machine that has
  never signed in, in a folder no wiki is connected to, sends nothing.
- **UserPromptSubmit** reads what you typed, on this machine, to match it against the keyword cache,
  and reads the version marker, CommonGround's own files in the credential home (your sign-in, the
  wiki pointer, the wiki's cached profile) and the `CLAUDE.md` of this folder and its parent
  folders, for the CommonGround block. When your prompt mentions one of the wiki's keywords, it
  adds a line telling Claude to consult the wiki before answering. When the plugin was updated
  under a running session, it tells Claude so, once, because an update disconnects the CommonGround
  tools. It makes no network call, so your prompt is sent nowhere. It writes that marker only when
  none exists yet or the plugin changed under a running session.
- **PreToolUse is the publish guard.** It is registered twice, on `Bash|PowerShell|Monitor` (every
  shell command Claude runs) and on `mcp__.*` (every MCP tool call), in every project. It is
  registered that widely because a publish can be typed into any shell and a wiki write can arrive
  under more than one connector name, and a narrower registration could not be checked without
  publishing something. What it judges is narrow: CommonGround's own CLI and CommonGround's own
  server, and nothing else.
  - **In a shell command** it looks for the CommonGround CLI run with `push`, `import` or `sync`,
    the verbs that publish, and asks you first. It also asks when it cannot read which CommonGround
    command is being run. Previews and reads (`push --dry-run`, `status`, `lint`) pass untouched.
    `git push`, `gh`, `npm publish` and deploys are never judged: those belong to your own repos.
  - **In an MCP call** it looks for CommonGround's write tools: `save_page`, `save_charter`,
    `stage_sources`, `invite_teammate` and `resolve_suggestion`. In MCP mode it asks before each
    one, because the write is live the moment it lands. In a local-clone project it refuses the
    three that write content (pages, the charter, sources) and sends Claude to write the file in
    your wiki folder instead, and still asks before an invitation or a resolved suggestion. If this
    project and the plugin's connector name different wikis, it refuses that connector's calls,
    reads included, until you restart the session, because an answer from the wrong wiki looks
    exactly like a right one.
  - **Other servers are left alone**, whatever their tools are called. One exception, and it is
    only ever a question: the Claude desktop app names a connector added in Claude by an id, so
    before a tool with one of those five names on an id-named server the guard asks, and its prompt
    says that it may be another service.
  - **It never approves anything.** In 0.19.x its only answers are "ask the user" and "refuse".
    When it has nothing to say it stays silent and Claude Code's own permission rules decide, as if
    the hook were not there; the same happens if it crashes. When it asks or refuses, it also adds
    a note to Claude's context saying so. It reads the command or tool call Claude is about to run,
    the `CLAUDE.md` of this folder and its parent folders, for the CommonGround block, and the wiki
    recorded for the session. It writes nothing and makes no network call.
- **No hook ever writes or deletes wiki page content, and none sends it anywhere.** In local-clone
  mode SessionStart asks `git` about your wiki folder (its current commit, and the names of files
  changed since the last publish) to decide whether to suggest a pull or a push.

**The header helper** (`hooks/mcp-wiki-header.cjs`) is not a hook. Claude Code runs it once each
time it connects to the CommonGround connector, and it prints the wiki ids from
`COMMONGROUND_WIKI` and `COMMONGROUND_WIKIS` as two request headers, so the connector serves the
wiki this project names. It reads nothing else, writes nothing and makes no network call.

**The commands**, run by you through Claude, write in three places, and Claude tells you about each:

- **The credential home** (`COMMONGROUND_CONFIG_HOME`, default `~/.commonground`): your sign-in
  (`credentials.json`, `0600`) and, beside it, three small files: which wiki is active and your
  preferences, each wiki's name and folder, and a sign-in that is waiting for your approval.
- **A project you connect:** one block in its `CLAUDE.md`, between `commonground:router-rule`
  comment markers, telling Claude which wiki to consult and how; and the `env` entry in its
  `.claude/settings.json` described above. Every other line and key in both files is kept: your own
  instructions, permissions and hooks are untouched.
- **Your wiki folder**, in local-clone mode: the wiki as plain markdown, by default
  `~/CommonGround/<wiki-name>/`, plus a `CLAUDE.md` of its own that tells Claude the folder is the
  working copy. That file is never published.

Your sign-in lives outside your wiki folder, so moving, clearing or re-pointing that folder never
signs you out.

The plugin downloads and installs no software. If Node or git is missing, Claude offers to walk you
through installing it with your system's own installer, and never runs an installer you did not ask
for.

### The bundled CLI

The plugin ships a bundled `commonground` CLI, with no separate install. The slash commands drive it
for you: by default you never need to type a command, and Claude phrases every next step as
something you can ask it for. Claude runs it as `node "<plugin folder>/bin/commonground" …`, which
works from both the Bash and the PowerShell tool. Claude Code also puts the plugin's `bin/` on the
Bash tool's PATH, and on that tool's alone, so the bare `commonground` works there and nowhere else.

It is one file, `bin/commonground`: CommonGround's own sync code bundled with the open source
libraries named in [THIRD_PARTY_NOTICES.md](https://github.com/serkanterek/commonground-plugin/blob/main/THIRD_PARTY_NOTICES.md).
It runs when a command calls it, and for the one repair described above, and exits when it is done.
It signs this machine in (opening your browser for that), lists your wikis, keeps your wiki folder
in step using `git`, and writes the files listed above. It talks to `api.commongroundapp.io` only.

**For git it uses its own CommonGround sign-in and nothing else.** It never reads your git
credentials, your SSH keys or any other tool's tokens. For its own git commands it switches the
machine's credential helpers off, so your keychain is neither read nor written, and the sign-in is
never written into the wiki folder. It hands that sign-in to git in the environment of the git
process it starts (`COMMONGROUND_GIT_TOKEN`, and git's own `GIT_CONFIG_*` variables), for
CommonGround's address only: never on a command line and never in a file.

**Prefer the terminal?** You can also run the CLI directly (`commonground status`,
`commonground lint`, `commonground coverage`, `commonground pull`, `commonground push`;
`commonground help` lists everything). Two verbs there do what no slash command does:
`commonground export` writes an archive of the wiki (`<wiki id>-wiki.tar`, in `~/CommonGround/`
beside your wiki folders), and `commonground login <token>` signs in with a device token you pass,
in place of the browser step. Outside Claude Code's Bash tool, spell it
`node ~/.claude/plugins/cache/<marketplace>/commonground/<version>/bin/commonground`, or alias
that (`<marketplace>` is `commonground-plugins` when you installed from CommonGround's own). And
if you'd rather Claude named the command lines too, set `COMMONGROUND_AUDIENCE=terminal`
in your own `~/.claude/settings.json` under `env`: the CLI's next-step hints and Claude's phrasing
both follow it. With it unset, a Claude session defaults to chat-first.

## Data and privacy

Everything the plugin sends goes to `api.commongroundapp.io`, and nowhere else. That is:

- **The wiki content you publish or save:** pages, the charter, and source material you hand over.
- **What Claude asks the connector for:** search terms, page names, and anything else you ask a
  CommonGround tool to do, such as the email address of a teammate you invite. In local-clone mode
  Claude reads pages from the files on your disk instead.
- **Your CommonGround sign-in token**, on each request, to prove who you are.
- **The plugin version**, and the ids of the wikis a project reads, with the commit ids git needs
  to keep a folder in step.

Signing in happens in your browser, at `app.commongroundapp.io`. You never paste a password or a
key into Claude.

The plugin does not send your prompts, your code or the other files in your projects. What reaches
CommonGround from them is only what you ask Claude to look up in the wiki or to capture into it.
In local-clone mode, an edit stays on your machine until you publish it with `/commonground:push`.

`COMMONGROUND_API_URL` is a developer override: it points the hooks, the CLI and the connector at
another server, for testing against a local one. Leave it unset. A project's
`.claude/settings.json` can set it too, and the plugin then sends your CommonGround sign-in to that
address, so treat that key in a repository you did not write as you would a hook.

Four more variables change where things are kept or how the CLI behaves. `COMMONGROUND_HOME` moves
where wiki folders are kept (default `~/CommonGround`). `COMMONGROUND_NO_BROWSER` makes sign-in
print its link and open no browser. `COMMONGROUND_REPOS_DIR`, with `COMMONGROUND_MEMBERSHIPS`,
points the CLI at git repositories on this machine in place of the server, for testing. The CLI
also reads a few variables other programs set: `CLAUDECODE`, `WSL_DISTRO_NAME`, `WSL_INTEROP` and
`MSYSTEM` tell it where it is running, and `GIT_CONFIG_COUNT` lets it add its git settings after
yours. The yaml library inside it reads its own debug switches, `LOG_TOKENS` and `LOG_STREAM`.

How long CommonGround keeps your data, and how to have it removed, is in the
[privacy policy](https://commongroundapp.io/privacy). The [terms](https://commongroundapp.io/terms)
cover use of the service.

## Where it works

The plugin works in **Claude Code** only. It does not install in Claude Chat or Cowork, because it
bundles a command-line tool. To reach the same wiki from Claude Chat, add the CommonGround
connector: [app.commongroundapp.io/connect](https://app.commongroundapp.io/connect) has the steps,
and the [docs](https://commongroundapp.io/docs) list what the connector can do.

## Commands

| Command | What it does |
|---|---|
| `/commonground:seed` | Fill your wiki: charters it with you, then builds it from an interview or imports your notes. Signs you in and asks which wiki, so it works before anything is set up |
| `/commonground:point` | Connect this project to one of your wikis, or add a second beside it, first time and every time after |
| `/commonground:ingest` | Capture something into the wiki: a thought, notes, a transcript, a doc or link, a decision |
| `/commonground:lint` | Health-check the wiki: open suggestions, stale or orphan pages, broken citations, coverage gaps |
| `/commonground:status` | Where you stand: connection, which wiki and why, role, and what to do next |
| `/commonground:pull` | *(local-clone mode)* Bring the latest published pages into your local folder |
| `/commonground:push` | *(local-clone mode)* Publish your changes, after showing exactly what goes out |

## Two ways to connect

`/commonground:point` asks which one you want and recommends local: it is faster and cheaper,
because Claude reads files on disk instead of calling the connector. MCP mode is for when always
seeing the latest published version, with nothing to pull, matters more. A project decides this
once, and whichever of `/commonground:point` and `/commonground:seed` you run first is where the
question comes up.

During the beta the hosted connector is on for every plan.

**MCP mode.** The wiki lives on the server and Claude queries it live through the CommonGround
connector, so it is always current. No local files. Writes here go live the moment they land. On
a shared wiki that means everyone, so Claude asks before each one.

**Local-clone mode.** A full copy of the wiki on disk in a folder named after it (`~/CommonGround/<wiki-name>/`
by default; choose your own with `--path`, or move it later with `commonground relocate`), plain markdown
that opens directly in Obsidian. The clone is your **working copy**: everything you ingest, edit or
fix lands there first, and nothing is published until you run `/commonground:push`, which
previews the change and asks. Editing your own copy needs no particular role; publishing is
admins/curators only.

## Roles

- **Admin / curator:** curate and publish.
- **Member:** read and ask questions; file `suggest_change` for anything wrong or missing. In
  local-clone mode members can also curate their own copy freely; what's reserved is publishing.

## Troubleshooting

**The CommonGround tools disappeared mid-session.** Usually a *connection* problem: Claude Code
re-registers a plugin's MCP server whenever the plugin version changes, which tears down the live
connector. Run `/mcp` to reconnect, or restart the session. Meanwhile `commonground pull <team>`
still reads the wiki: it authenticates as the signed-in device rather than through the connector.

**…but reconnecting keeps not helping.** One other thing loses every tool at once, and reconnecting
does not fix it.

*You're not a member of the wiki this project names.* Every call is refused, and it looks exactly
like a dropped connection. Signing in again doesn't grant membership: an admin of that wiki has to
invite you.

`/commonground:status` sorts out which of the two you're in: it says which wiki this project is
bound to, whether this machine can reach it, and what the fix actually is.

**The wiki folder could not be fetched** (local mode: `/commonground:point`, `/commonground:pull`).
The message says which of these it is. *Your sign-in is no longer accepted:* it was revoked or has
expired, so sign in again and retry. *Git could not present your sign-in:* CommonGround signs in to
git by itself and needs nothing stored, so the message names the cause it can prove and quotes git's
own last line. On a git older than 2.31 the sign-in goes by a second route, and when that fails too,
updating git is one fix worth trying, not a proven cause; on a newer git, something on this machine
(usually a credential helper or a proxy) is answering instead. *Git is not installed:* a local wiki
folder needs it. *A folder that is not a wiki is in the way:* the message names it, and nothing in it was touched; move it, or choose another place. Two things
are never the fix: copying your sign-in into a file, a keychain or a git setting, and retrying in
a loop. A retry itself is always safe, though. If an earlier attempt left an unfinished folder
behind, the next one clears it, says so, and fetches again; it never removes a folder with your
files in it.

**If the subscription lapses.** Writing is refused and reading still works. That is a *billing*
state, not a connection or a membership problem: a wiki whose **subscription** has ended, or
whose **payments** stopped going through, goes read-only until it is restored. Nothing is deleted and
nothing is hidden. Searching the wiki, pulling it to your machine, your local folder and its whole
git history, and revoking credentials or invitations all keep working; publishing, saving a page and
inviting people wait. The refusal says so in its own words, and a wiki admin restores it under
**Billing** in the CommonGround web app. If you're not an admin of that wiki, tell one; there is
nothing to repair on your side and nothing to reconnect.

**"You have unpublished pages" every time a session starts.** That's the reminder that work is
sitting in your wiki folder and hasn't gone out yet. Ask Claude to stop reminding you, or run
`commonground prefs set push-nudge off` yourself; `... on` brings it back. The pages stay where they
are either way, and `/commonground:status` still tells you what's unpublished whenever you ask.

**Upgrading.** Reinstall between sessions rather than mid-task, for the reason at the top of this
section: a version change tears the live connector down.

## Support

- **Questions and bugs:** this repository's
  [issues](https://github.com/serkanterek/commonground-plugin/issues), or hello@commongroundapp.io.
- **Docs:** [commongroundapp.io/docs](https://commongroundapp.io/docs)
- **App:** [app.commongroundapp.io](https://app.commongroundapp.io)
- **Connect Claude Chat too:** [app.commongroundapp.io/connect](https://app.commongroundapp.io/connect)

## Security

To report a vulnerability, email hello@commongroundapp.io.
[SECURITY.md](https://github.com/serkanterek/commonground-plugin/blob/main/SECURITY.md) says what to
include. Please do not open a public issue for one.

## Licence

The plugin is free to install and use with CommonGround. It is not open source: the terms are in
[LICENSE](https://github.com/serkanterek/commonground-plugin/blob/main/LICENSE). The notices for the
open source libraries inside the bundled CLI are in
[THIRD_PARTY_NOTICES.md](https://github.com/serkanterek/commonground-plugin/blob/main/THIRD_PARTY_NOTICES.md).
