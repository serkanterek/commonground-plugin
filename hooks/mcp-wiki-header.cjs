/**
 * Tell the connector which wiki THIS project is bound to (SER-237).
 *
 * The MCP access token names one wiki — the one the user authorised the connector for — and it is
 * re-minted from that same row on every refresh. So before this, one machine's connector answered
 * every project from the same wiki, while `commonground pull` in each of those projects synced
 * whichever wiki the project actually named. A project bound to wiki B got wiki A's pages back from
 * `search` and `get_page`, silently, and only `/commonground:status` could notice.
 *
 * Claude Code runs this once per connection and turns the JSON it prints into request headers. The
 * server treats `X-CG-Wiki` as a SELECTION and re-checks membership itself (SER-236), so the worst
 * a wrong value here can do is name a wiki the user already belongs to — or nothing at all.
 *
 * WHY A HELPER RATHER THAN A STATIC `headers` ENTRY. `${VAR}` interpolation inside `.mcp.json` reads
 * only the real process environment; it does NOT see the project's `.claude/settings.json` `env`,
 * which is where `commonground init` writes the wiki id. Measured directly: in one session a spawned
 * MCP subprocess saw `COMMONGROUND_WIKI` while the same session expanded `${COMMONGROUND_WIKI:-}`
 * to empty in both the `url` and `headers` fields. A helper is a spawned subprocess, so it inherits
 * the project's env and reads the variable for real.
 *
 * It also removes a failure mode rather than guarding against one: reading `process.env` cannot
 * produce the literal string `${COMMONGROUND_WIKI}` the way an unexpanded config value does. An
 * unset variable is simply `undefined` here.
 *
 * FAIL-OPEN, ALWAYS. Printing `{}` sends no header, which the server answers with the token's own
 * wiki — exactly the behaviour every project had before this shipped. That is also what a crash
 * does (a non-zero exit leaves the header off and the connection still succeeds), so the worst case
 * for an un-initialized project, an old project, or a broken helper is the status quo and never a
 * dead connector.
 *
 * Lives in `hooks/` because that is where the plugin keeps the CJS it runs at runtime and the
 * directory already ships; it is not itself a hook and is not registered in `hooks.json`.
 */
const wiki = (process.env.COMMONGROUND_WIKI || '').trim();

// No validation beyond "is there anything here". The server owns what a well-formed wiki id is, and
// a second opinion in the client is a second thing to keep in step — one that fails by dropping a
// header the server would have accepted, which reads to the user as the wrong wiki.
process.stdout.write(JSON.stringify(wiki ? { 'X-CG-Wiki': wiki } : {}));
