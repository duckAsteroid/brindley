# Getting started

Brindley has two parts: a **format** (plain Markdown files you could keep by hand) and an **MCP
server** that gives your AI agent tools and prompts for working with them. You need Node 20+ and
git.

## 1. Build the server

Brindley is not on npm yet. Build it from source:

```sh
git clone https://github.com/duckAsteroid/brindley
cd brindley
npm install
npm run build
```

The server is now `dist/cli.js`. Run `npm link` if you'd like a `brindley` command on your path.

## 2. Connect your agent

The server talks MCP over stdio and works on the git repository it is started in.

::: code-group

```sh [Claude Code]
# run inside the repo you want to plan in
claude mcp add brindley -- node /path/to/brindley/dist/cli.js
```

```jsonc [opencode]
// ~/.config/opencode/opencode.jsonc — applies to every repo
{
  "mcp": {
    "brindley": {
      "type": "local",
      "command": ["node", "/path/to/brindley/dist/cli.js"],
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
    "brindley": { "command": "node", "args": ["/path/to/brindley/dist/cli.js"] }
  }
}
```

:::

Check it with `opencode mcp list` (or your client's equivalent). On connect, the server sends
your agent a short explanation of how Brindley works, so it can use the tools straight away.

## 3. Mark a collection

A **collection** is any folder whose `README.md` front-matter says `brindley: 1`. Ask your agent:

> Make `docs/plans` a collection.

or run `node /path/to/brindley/dist/cli.js init docs/plans`. The folder and README are created if
needed; an existing folder keeps its files and README text. The first collection in a repo also
prints a snippet for your `AGENTS.md` / `CLAUDE.md`, so agents follow the conventions even
without the server.

## 4. Plan something

> Create a feature ticket in plans called "Lock sensor import".

Brindley coins the next number, writes `1-lock-sensor-import.md` with a skeleton, and updates the
collection README's table. From here, see [the workflow](/guide/workflow).

::: tip Try it
`npx @modelcontextprotocol/inspector node /path/to/brindley/dist/cli.js` opens a browser UI
where you can call every tool by hand.
:::
