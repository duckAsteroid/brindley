# Claude Code

Brindley comes to Claude Code as a plugin, `brindley`, from the `duckAsteroid/brindley`
marketplace. A second, optional plugin in the same marketplace, `brindley-sidebar`, shows the
initiatives in a pane beside the chat. Claude Code can also run the server without the plugin, as
a plain MCP server.

## The plugin

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

The plugin provides the server, so a repo that uses it doesn't also register Brindley — no
`brindley` entry in the repo's `.mcp.json`, and no `claude mcp add`. Two registrations give agents
every tool twice, possibly at different versions.

### Allow the tools

`/mcp` lists the plugin's server as `plugin:brindley:core`, and its tools are named
`mcp__plugin_brindley_core__<tool>`. A plugin cannot grant itself permissions, so Claude Code asks
before each Brindley tool call. To allow them all, add the rule to `.claude/settings.json` (for
everyone in the repo) or `~/.claude/settings.json` (for you):

```json
{
  "permissions": {
    "allow": ["mcp__plugin_brindley_core"]
  }
}
```

### Updates

The plugin runs an exact server version, not the latest one on npm. To move to the newest release:

```sh
claude plugin marketplace update brindley
claude plugin update brindley@brindley
```

## The sidebar (optional)

`brindley-sidebar` shows the repository's initiatives in a pane beside the chat: counts by status,
what to pick up next, and a detail view that queues an initiative as Claude's next turn.

```sh
claude plugin install brindley-sidebar --marketplace duckAsteroid/brindley
```

or `/plugin install brindley-sidebar@brindley` inside a session. It reads everything through the
Brindley MCP server and adds no tools of its own.

- The pane opens by itself at session start only in the terminal's fullscreen layout, in a
  repository with collections. Once closed in a project, it stays closed there until you open it
  again.
- `/initiatives` opens or closes it, on any surface and at any width.
- `/brindley` lists the collections; `/brindley <n | name | alias | path>` pins the pane to one,
  remembered per project; `/brindley all` clears the pin.

Both plugins carry the same version, since the sidebar reads that release's tool output. Update
them together:

```sh
claude plugin marketplace update brindley
claude plugin update brindley@brindley
claude plugin update brindley-sidebar@brindley
```

### Options

Set them in `/config`, or in `settings.json` under `pluginConfigs."brindley-sidebar".options`:

| Option | Default | Meaning |
| --- | --- | --- |
| `server` | `plugin:brindley:core` | The Brindley MCP server's name as `/mcp` lists it. The default is the `brindley` plugin's server; with Brindley added by `claude mcp add brindley`, set it to `brindley`. |
| `order` | `status-recency` | Row order: `status-recency`, `status-priority`, `recency` or `priority`. |
| `exclude` | `["**/test-corpus/**"]` | Globs matched against each collection's repo-relative path; matching collections are left out. |
| `maxRows` | `8` | Rows shown while "Pick up next" is collapsed. |

The [sidebar README](https://github.com/duckAsteroid/brindley/tree/main/sidebar#readme) covers
the pane's rows, glyphs and behaviour in large repositories.

## Without the plugin

Claude Code can run the server from npm as a plain MCP server; `brindley@latest` fetches the
newest release on first use.

```sh
# -s user applies it to every repo
claude mcp add -s user brindley -- npx -y brindley@latest
```

To share the setup with everyone who clones a repo, commit it as `.mcp.json` at the repo root
instead:

```json
{
  "mcpServers": {
    "brindley": { "command": "npx", "args": ["-y", "brindley@latest"] }
  }
}
```

Registered this way, the tools are named `mcp__brindley__<tool>`; allow them with the rule
`mcp__brindley`. The workflows run as the server's prompts, `/mcp__brindley__design-review` and so
on, instead of skills, and there is no implementer agent. Check the connection with `/mcp`.
