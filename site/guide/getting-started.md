# Getting started

Brindley has two parts: a **format** (plain Markdown files you could keep by hand) and an **MCP
server** that gives your AI agent tools and prompts for working with them. You need Node 20+ and
git.

## 1. Connect your agent

### Claude Code

```sh
claude plugin install brindley --marketplace duckAsteroid/brindley
```

The plugin brings the server, the workflows as skills and an implementer agent. Allowing its tools,
the optional sidebar, updates and setup without the plugin: see [Claude Code](/guide/claude-code).

### OpenCode

```jsonc
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

More, including checking the connection: see [OpenCode](/guide/opencode).

### Any other MCP client

Brindley is published to [npm](https://www.npmjs.com/package/brindley), so your MCP client runs it
with `npx`; `brindley@latest` fetches the newest release on first use. The server talks MCP over
stdio and works on the git repository it is started in.

```json
{
  "mcpServers": {
    "brindley": { "command": "npx", "args": ["-y", "brindley@latest"] }
  }
}
```

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
