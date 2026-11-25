---
type: refactor
status: designed
updated: 2026-11-25
---
# Rename the plugin's MCP server from brindley to core

## Goal

The Claude Code plugin's tools read `mcp__plugin_brindley_core__<tool>` (e.g. `mcp__plugin_brindley_core__brief`) instead of the doubled `mcp__plugin_brindley_brindley__<tool>`, with the plugin name, install command, skills and agent unchanged.

## Dependencies

_None._

## Related

- [45 Install Brindley as a Claude Code plugin](done/45-install-brindley-as-a-claude-code-plugin.md)
- [52 Bring the brindley-sidebar Claude Code mod into the project](52-bring-the-brindley-sidebar-claude-code-mod-into-the-project.md)
- [53 Document the Claude Code and OpenCode deployments on their own site pages](53-document-the-claude-code-and-opencode-deployments-on-their-o.md)

## Design

Claude Code names a plugin's MCP tools `mcp__plugin_<plugin>_<server>__<tool>`. The plugin is
`brindley` and its server key is also `brindley` (`plugin/.mcp.json:3`), so the name says
brindley twice. Only the server key changes, to `core`. The plugin name stays `brindley`, so
`/plugin install brindley@brindley`, the `/brindley:*` skills and `brindley:implementer` are
unchanged. Existing installs pick up the change with a normal plugin update.

Breaking: users' saved permission rule `mcp__plugin_brindley_brindley` stops matching, so
Claude Code asks before each tool call again until the rule becomes `mcp__plugin_brindley_core`.
This is released as a major version, and its release note gives the new rule.

Files that name the old prefix or the server (found by grep): `plugin/.mcp.json`,
`plugin/README.md`, `plugin/skills/{design-review,implement,spike,triage}/SKILL.md`,
`plugin/agents/implementer.md`, `README.md`, `site/guide/getting-started.md`,
`scripts/plugin-version.mjs` (reads and stamps `mcpServers.brindley`, lines 25 and 35, and its tests),
`site/reference/mcp.md`. The server source (`src/`) never names the prefix.

The `brindley` name used by plain MCP setups (`claude mcp add brindley`, OpenCode's `mcp.brindley`)
stays as it is; only the plugin's server key changes.

## Open questions

_None._

## Acceptance criteria

- `plugin/.mcp.json` registers the server as `core`; in a session with the plugin, the tools
  appear as `mcp__plugin_brindley_core__*`.
- No file outside `initiatives/` names `mcp__plugin_brindley_brindley`.
- The skills and implementer agent call tools by the new names and still work end to end.
- The release is a major version; the release notes give the new permission rule.
