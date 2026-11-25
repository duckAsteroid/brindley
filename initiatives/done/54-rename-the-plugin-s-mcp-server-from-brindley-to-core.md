---
type: refactor
status: done
updated: 2026-11-25
docs_impact:
  - README.md
  - site/guide/getting-started.md
---
# Rename the plugin's MCP server from brindley to core

## Goal

The Claude Code plugin's tools read `mcp__plugin_brindley_core__<tool>` (e.g. `mcp__plugin_brindley_core__brief`) instead of the doubled `mcp__plugin_brindley_brindley__<tool>`, with the plugin name, install command, skills and agent unchanged.

## Dependencies

_None._

## Related

- [45 Install Brindley as a Claude Code plugin](45-install-brindley-as-a-claude-code-plugin.md)
- [52 Bring the brindley-sidebar Claude Code mod into the project](52-bring-the-brindley-sidebar-claude-code-mod-into-the-project.md)
- [53 Document the Claude Code and OpenCode deployments on their own site pages](../53-document-the-claude-code-and-opencode-deployments-on-their-o.md)

## Design

Claude Code names a plugin's MCP tools `mcp__plugin_<plugin>_<server>__<tool>`. The plugin is
`brindley` and its server key is also `brindley` (`plugin/.mcp.json:3`), so the name says
brindley twice. Only the server key changes, to `core`. The plugin name stays `brindley`, so
`/plugin install brindley@brindley`, the `/brindley:*` skills and `brindley:implementer` are
unchanged. Existing installs pick up the change with a normal plugin update.

Breaking: users' saved permission rule `mcp__plugin_brindley_brindley` stops matching, so
Claude Code asks before each tool call again until the rule becomes `mcp__plugin_brindley_core`.
This is released as a major version, and its release note gives the new rule.

Changed: `plugin/.mcp.json` (server key), `scripts/plugin-version.mjs` and `test/version.test.ts`
(read and stamp `mcpServers.core`), the four `plugin/skills/*/SKILL.md` (`allowed-tools` and the
`brief` call) and `plugin/agents/implementer.md`, and the permission rule in `README.md`,
`plugin/README.md` and `site/guide/getting-started.md`. The server source (`src/`) and
`site/reference/mcp.md` never named the prefix.

Verified with a headless session started with `--plugin-dir plugin`: `/mcp` lists
`plugin:brindley:core` (connected) and the tools are `mcp__plugin_brindley_core__*`.
The commit is `refactor!:` with a `BREAKING CHANGE:` footer giving the new rule, so
`scripts/version.mjs` makes the next release major and `scripts/changelog.mjs` puts it under
"Breaking changes" in the release notes.

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

## Appendix: Rejected alternatives

- Renaming the plugin itself to `core`: it would change the install command (`core@brindley`),
  the skills (`/core:*`) and the agent (`core:implementer`), force existing users to uninstall
  and reinstall, and `core` alone doesn't identify Brindley in skill and agent lists.
- Other server keys: `mcp` (`mcp__plugin_brindley_mcp__`) repeats "mcp"; `tools` was workable,
  but `core` was preferred.
