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

## Commands

| Command | What it does |
|---|---|
| `/commonground:seed` | Fill the wiki — guided interview, or import an existing markdown folder. Signs you in and asks which wiki, so it works before anything is set up |
| `/commonground:point` | Aim this project at one of your wikis (MCP or local-clone mode) — first time and every time after |
| `/commonground:ingest` | Capture anything into the wiki: notes, a transcript, a doc or URL, a decision |
| `/commonground:lint` | Health check — stale/orphan/broken-citation pages, coverage gaps, open suggestions |
| `/commonground:status` | Where you stand: connection, which wiki and why, role, and what to do next |
| `/commonground:pull` | *(local-clone mode)* Get the latest into your local copy |
| `/commonground:push` | *(local-clone mode)* Publish your changes |

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
  writes two `0600` files into the credential home (`COMMONGROUND_CONFIG_HOME`, default
  `~/.commonground`): a team keyword cache and a marker recording the running plugin build.
- **SessionStart also completes one credential move.** Before v0.4.1 the device token was stored
  *inside* the wiki folder, so moving the folder you open in Obsidian silently signed you out. The
  hook relocates it to `<COMMONGROUND_CONFIG_HOME>/credentials.json` by an exclusive hard link (so a
  concurrent sign-in can never be overwritten), fsyncs, and only then removes the old file. Anything
  unexpected aborts the move and leaves the original exactly where it is.
- **UserPromptSubmit** reads the keyword cache and the version marker. It writes nothing and makes
  no network call.
- **Neither hook ever reads, writes or deletes wiki page content.** A team's clone is read only for
  its current commit sha (`git rev-parse`), to decide whether to suggest a pull or a push.

Your sign-in lives outside your wiki folder, so moving, clearing or re-pointing that folder never
signs you out.

## The bundled CLI

The plugin ships a bundled `commonground` CLI on the Bash tool's PATH — no separate install. The
slash commands drive it for you; you can also run it directly (`commonground status`,
`commonground lint`, `commonground coverage`, `commonground pull`, `commonground push`).
`commonground help` lists everything.

## Troubleshooting

**The CommonGround tools disappeared mid-session.** Usually a *connection* problem — Claude Code
re-registers a plugin's MCP server whenever the plugin version changes, which tears down the live
connector. Run `/mcp` to reconnect, or restart the session. Meanwhile `commonground pull <team>`
still reads the wiki: it authenticates as the signed-in device rather than through the connector.

**…but reconnecting keeps not helping.** There is one other way to lose every tool at once: this
project names a wiki you are not a member of. Reconnecting can't fix that, because signing in again
doesn't grant membership — an admin of that wiki has to invite you. `/commonground:status` tells the
two apart: it says which wiki this project is bound to, and whether this machine can reach it.

**Upgrading.** Reinstall between sessions rather than mid-task, for the same reason.

## Links

- **App / sign-up:** [app.commongroundapp.io](https://app.commongroundapp.io)
- **Connect Claude.ai Chat too:** [app.commongroundapp.io/connect](https://app.commongroundapp.io/connect)
