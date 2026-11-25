# Getting started

Brindley has two parts: a **format** (plain Markdown files you could keep by hand) and an **MCP
server** that gives your AI agent tools and prompts for working with them. You need Node 20+ and
git.

## 1. Connect your agent

### Claude Code: the plugin

```sh
claude plugin install brindley --marketplace duckAsteroid/brindley
```

or, inside a session, `/plugin marketplace add duckAsteroid/brindley` then
`/plugin install brindley@brindley`. Installed once, the plugin works in every repo and brings:

- the Brindley MCP server, working on the repository the session is started in;
- the workflows as skills: `/brindley:design-review <ref>`, `/brindley:implement <ref>`,
  `/brindley:spike <ref>` and `/brindley:triage [collection]`;
- an implementer agent, `brindley:implementer`, that builds one initiative from its brief through
  to `complete`.

The plugin runs an exact server version, not the latest one on npm; `claude plugin marketplace
update brindley` then `claude plugin update brindley@brindley` moves you to the newest release.

The plugin provides the server, so a repo that uses it doesn't also register Brindley — no
`brindley` entry in the repo's `.mcp.json`, and no `claude mcp add`. Two registrations give agents
every tool twice, possibly at different versions.

A plugin cannot grant itself permissions, so Claude Code asks before each Brindley tool call. To
allow them all, add the rule to `.claude/settings.json` (for everyone in the repo) or
`~/.claude/settings.json` (for you):

```json
{
  "permissions": {
    "allow": ["mcp__plugin_brindley_core"]
  }
}
```

### Claude Code: the sidebar (optional)

A second plugin in the same marketplace, `brindley-sidebar`, shows the repository's initiatives in
a pane beside the chat: counts by status, what to pick up next, and a detail view that queues an
initiative as Claude's next turn.

```sh
claude plugin install brindley-sidebar --marketplace duckAsteroid/brindley
```

or `/plugin install brindley-sidebar@brindley` inside a session. It reads everything through the
Brindley MCP server and adds no tools of its own. The pane opens by itself only in the terminal's
fullscreen layout; `/initiatives` opens or closes it anywhere, and `/brindley <collection>` pins it
to one collection.

Its `server` option names the server to read, as `/mcp` lists it, and defaults to the `brindley`
plugin's, `plugin:brindley:core`. When Brindley is connected another way (e.g.
`claude mcp add brindley`), set `server` to that name in `/config`. Both plugins carry the same
version, since the sidebar reads that release's tool output, so update them together. Its other
options (`order`, `exclude`, `maxRows`) are described in the
[sidebar README](https://github.com/duckAsteroid/brindley/tree/main/sidebar#options).

### Any MCP client

Brindley is published to [npm](https://www.npmjs.com/package/brindley), so your MCP client runs it
with `npx`; `brindley@latest` fetches the newest release on first use. The server talks MCP over
stdio and works on the git repository it is started in.

::: code-group

```sh [Claude Code]
# without the plugin; -s user applies it to every repo
claude mcp add -s user brindley -- npx -y brindley@latest
```

```jsonc [opencode]
// ~/.config/opencode/opencode.jsonc — applies to every repo
{
  "mcp": {
    "brindley": {
      "type": "local",
      "command": ["npx", "-y", "brindley@latest"],
      "cwd": ".",
      "timeout": 30000,
      "enabled": true
    }
  }
}
```

```json [Other MCP clients]
{
  "mcpServers": {
    "brindley": { "command": "npx", "args": ["-y", "brindley@latest"] }
  }
}
```

:::

Added with `claude mcp add`, the tools are named `mcp__brindley__<tool>`; allow them with the rule
`mcp__brindley`, and run the workflows as the prompts `/mcp__brindley__design-review` and so on. To
share the setup with everyone who clones the repo, commit the "Other MCP clients" snippet as
`.mcp.json` at the repo root — Claude Code picks it up from there. Check it with
`opencode mcp list` (or your client's equivalent).

On connect, the server sends your agent a short explanation of how Brindley works, so it can use
the tools straight away.

## 2. Mark a collection

A **collection** is any folder whose `README.md` front-matter says `brindley: 1`. Ask your agent:

> Make `docs/plans` a collection.

or run `npx brindley init docs/plans`. The folder and README are created if
needed; an existing folder keeps its files and README text. The first collection in a repo also
prints a snippet for your `AGENTS.md` / `CLAUDE.md`, so agents follow the conventions even
without the server.

## 3. Plan something

> Create a feature ticket in plans called "Lock sensor import".

Brindley coins the next number, writes `01-lock-sensor-import.md` with a skeleton, and updates the
collection README's table. From here, see [the workflow](/guide/workflow).

::: tip Try it
`npx @modelcontextprotocol/inspector npx -y brindley@latest` opens a browser UI
where you can call every tool by hand.
:::
