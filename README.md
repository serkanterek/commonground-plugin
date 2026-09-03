# CommonGround for Claude Code

A curated, version-controlled **context wiki** — for your team or just for yourself — available
inside Claude. Ask a question and Claude consults it and cites the pages it used, instead of
guessing.

Curation runs **in your own Claude session on your own tokens**. CommonGround's backend does
storage, retrieval and auth; it never runs an LLM on your behalf.

## Requirements

A CommonGround account and team — create one at **[app.commongroundapp.io](https://app.commongroundapp.io)**.
The plugin is the client; it needs an account to talk to.

## Install

```
/plugin marketplace add serkanterek/commonground-plugin
/plugin install commonground@commonground-plugins
```

**Turn on auto-update while you're there** — `/plugin` → **Marketplaces** → select
`commonground-plugins` → **Enable auto-update**. Claude Code leaves this off for third-party
marketplaces, and nothing anywhere tells you when a new version exists, so without it you will
quietly stay on whatever version you first installed. With it on, updates arrive within about ten
minutes of a session starting and Claude Code offers you `/reload-plugins`.

To update by hand instead:

```
/plugin marketplace update commonground-plugins
/plugin update commonground@commonground-plugins
```

Restart Claude Code afterwards — an update stages immediately but only applies on restart.

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

Then **fill your wiki**, from any project — it doesn't need to be set up first:

```
/commonground:seed
```

That signs this machine in (a one-time browser step), asks which wiki if you have more than one, and
runs a short guided interview: it charters the wiki (who it's for, what it holds) and puts the first
pages in. Pass a name to be explicit — `/commonground:seed acme-handbook`.

Then **point the projects you actually work in** at it:

```
/commonground:point
```

Run that in any repo, any time you want to aim somewhere else — it is the same command every time,
first run and after.

**A project can read more than one wiki.** Your personal wiki beside your team's, a product wiki
beside the company's — tell `/commonground:point` to *also* read a wiki and it is added alongside
what the project already reads (say *drop* to take one back out). Claude then answers from all of
them at once, each wiki speaking for what it covers, and says which one a fact came from.

## Commands

| Command | What it does |
|---|---|
| `/commonground:seed` | Fill your wiki: charters it with you, then builds it from an interview or imports your notes. Signs you in and asks which wiki, so it works before anything is set up |
| `/commonground:point` | Connect this project to one of your wikis, or add a second beside it — first time and every time after |
| `/commonground:ingest` | Capture something into the wiki: a thought, notes, a transcript, a doc or link, a decision |
| `/commonground:lint` | Health-check the wiki: open suggestions, stale or orphan pages, broken citations, coverage gaps |
| `/commonground:status` | Where you stand: connection, which wiki and why, role, and what to do next |
| `/commonground:pull` | *(local-clone mode)* Bring the latest published pages into your local folder |
| `/commonground:push` | *(local-clone mode)* Publish your changes, after showing exactly what goes out |

## Two ways to connect

**MCP mode** (the default) — the wiki lives on the server and Claude reaches it live through the
CommonGround connector. No local files. Best for most coding projects. Writes here go live the moment
they land — on a shared wiki that means everyone, so Claude asks before each one.

**Local-clone mode** — a full copy of the wiki on disk in a folder named after it (`~/CommonGround/<wiki-name>/`
by default; choose your own with `--path`, or move it later with `commonground relocate`), plain markdown
that opens directly in Obsidian. The clone is your **working copy**: everything you ingest, edit or
fix lands there first, and nothing is published until you run `/commonground:push`, which
previews the change and asks. Editing your own copy needs no particular role; publishing is
admins/curators only.

## Roles

- **Admin / curator** — curate and publish.
- **Member** — read and ask questions; file `suggest_change` for anything wrong or missing. In
  local-clone mode members can also curate their own copy freely; what's reserved is publishing.

## What this plugin touches on your machine

Both hooks are dependency-free, fail-open (a hiccup never breaks your session), and run without a
per-run permission prompt — so here is the complete list of what they read and write.

- **SessionStart** injects wiki context and tells Claude where this project's writes may land. It
  writes only `0600` files, all into the credential home (`COMMONGROUND_CONFIG_HOME`, default
  `~/.commonground`): a team keyword cache, a marker recording the running plugin build, a
  first-install marker, and a record of the last release it checked for and told you about.
- **SessionStart also completes one credential move.** Before v0.4.1 the device token was stored
  *inside* the wiki folder, so moving the folder you open in Obsidian silently signed you out. The
  hook relocates it to `<COMMONGROUND_CONFIG_HOME>/credentials.json` by an exclusive hard link (so a
  concurrent sign-in can never be overwritten), fsyncs, and only then removes the old file. Anything
  unexpected aborts the move and leaves the original exactly where it is.
- **SessionStart makes one network call, to CommonGround and nowhere else.** Normally that is the
  read that fetches your wiki's state. In a project you have not pointed at a wiki — or on a machine
  that is signed out — there is no wiki to read, so instead it asks whether a newer plugin has been
  published, at most about twice a day and sending nothing but the version you are running. That is
  the only way a machine in that state ever learns an update exists, because Claude Code shows no
  update indicator and leaves auto-update off for third-party marketplaces. A session that is silent
  altogether stays silent: nothing is sent from a machine that has never signed in.
- **UserPromptSubmit** reads the keyword cache and the version marker. It writes nothing and makes
  no network call.
- **Neither hook ever reads, writes or deletes wiki page content.** A team's clone is read only for
  its current commit sha (`git rev-parse`), to decide whether to suggest a pull or a push.

Your sign-in lives outside your wiki folder, so moving, clearing or re-pointing that folder never
signs you out.

## The bundled CLI

The plugin ships a bundled `commonground` CLI on the Bash tool's PATH — no separate install. The
slash commands drive it for you: by default you never need to type a command, and Claude phrases
every next step as something you can ask it for.

**Prefer the terminal?** You can also run the CLI directly (`commonground status`,
`commonground lint`, `commonground coverage`, `commonground pull`, `commonground push`;
`commonground help` lists everything). And if you'd rather Claude named the command lines too,
set `COMMONGROUND_AUDIENCE=terminal` in your own `~/.claude/settings.json` under `env` — the
CLI's next-step hints and Claude's phrasing both follow it. With it unset, a Claude session
defaults to chat-first.

## Troubleshooting

**The CommonGround tools disappeared mid-session.** Usually a *connection* problem — Claude Code
re-registers a plugin's MCP server whenever the plugin version changes, which tears down the live
connector. Run `/mcp` to reconnect, or restart the session. Meanwhile `commonground pull <team>`
still reads the wiki: it authenticates as the signed-in device rather than through the connector.

**…but reconnecting keeps not helping.** Two other things lose every tool at once, and reconnecting
fixes neither.

*You're not a member of the wiki this project names.* Every call is refused, and it looks exactly
like a dropped connection. Signing in again doesn't grant membership: an admin of that wiki has to
invite you.

*The wiki is on an individual plan.* That plan works through the wiki folder on your own machine,
and the hosted connector is part of team plans, so every connector call is refused by design.
Nothing is broken and there's nothing to repair; run `/commonground:point` and choose local, which
gives this project the wiki as plain files on this machine.

`/commonground:status` sorts out which of the three you're in: it says which wiki this project is
bound to, whether this machine can reach it, and what the fix actually is.

**If the subscription lapses.** Writing is refused and reading still works. That is a *billing*
state, not a connection or a membership problem: a wiki whose **team subscription** has ended, or
whose **payments** stopped going through, goes read-only until it is restored. Nothing is deleted and
nothing is hidden. Searching the wiki, pulling it to your machine, your local folder and its whole
git history, and revoking credentials or invitations all keep working; publishing, saving a page and
inviting people wait. The refusal says so in its own words, and a wiki admin restores it under
**Billing** in the CommonGround web app. If you're not an admin of that wiki, tell one; there is
nothing to repair on your side and nothing to reconnect.

**Upgrading.** Reinstall between sessions rather than mid-task, for the reason at the top of this
section: a version change tears the live connector down.

## Links

- **App / sign-up:** [app.commongroundapp.io](https://app.commongroundapp.io)
- **Connect Claude.ai Chat too:** [app.commongroundapp.io/connect](https://app.commongroundapp.io/connect)
