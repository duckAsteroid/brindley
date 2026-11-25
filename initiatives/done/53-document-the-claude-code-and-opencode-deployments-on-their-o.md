---
type: docs
status: done
updated: 2026-11-25
docs_impact:
  - site/guide/claude-code.md
  - site/guide/opencode.md
  - site/guide/getting-started.md
  - README.md
---
# Document the Claude Code and OpenCode deployments on their own site pages

## Goal

Someone using Claude Code, or someone using OpenCode, finds one site page covering everything Brindley offers for their tool: how to connect the server, the plugins available (core plugin and, once shipped, the sidebar), permissions, and keeping versions current. Neither page should mix in the other tool's steps.

## Dependencies

_None._

## Related

- [45 Install Brindley as a Claude Code plugin](45-install-brindley-as-a-claude-code-plugin.md)
- [47 Package and release the OpenCode sidebar plugin with Brindley](../47-package-and-release-the-opencode-sidebar-plugin-with-brindle.md)
- [52 Bring the brindley-sidebar Claude Code mod into the project](52-bring-the-brindley-sidebar-claude-code-mod-into-the-project.md)

## Background

All deployment material sits in step 1 of `site/guide/getting-started.md` ("1. Connect your agent",
lines 7–110):

- "Claude Code: the plugin" (lines 9–41): install, what it brings, version pinning, and the
  `mcp__plugin_brindley_core` permission rule.
- "Claude Code: the sidebar (optional)" (lines 43–63): the `brindley-sidebar` plugin, its
  commands and its `server` option.
- "Any MCP client" (lines 65–110): a code-group with tabs for Claude Code without the plugin,
  OpenCode (`~/.config/opencode/opencode.jsonc`) and other MCP clients, then checking the
  connection (`opencode mcp list`).

There is no OpenCode plugin yet (#47 packages the OpenCode sidebar), and nothing in the site nav
(`site/.vitepress/config.mts`, "Guide" items) names a tool. #47 documents the OpenCode sidebar on
the OpenCode page when it ships.

## Outcome

`site/guide/claude-code.md` covers the `brindley` plugin (install, what it brings, the
`mcp__plugin_brindley_core` permission rule, updates), the optional `brindley-sidebar` plugin
(install, commands, updating both together, options) and running the server without the plugin
(`claude mcp add`, a committed `.mcp.json`, the `mcp__brindley` rule and prompts).
`site/guide/opencode.md` covers the `opencode.jsonc` server entry, `opencode mcp list` and the
workflows as MCP prompts. Both sit in the "Guide" nav after "Getting started", whose step 1 keeps
one install snippet per tool with a link, plus the generic MCP snippet. `README.md` links to both
pages. The site builds with no dead links.

## Decisions

- **Q1** Two pages in the "Guide" nav group, straight after "Getting started" (`site/.vitepress/config.mts:27`): `site/guide/claude-code.md` ("Claude Code") and `site/guide/opencode.md` ("OpenCode"). The generic "Other MCP clients" setup stays in getting-started.
- **Q2** Getting-started's step 1 keeps one install snippet per tool plus a link to its page. For Claude Code that's `claude plugin install brindley --marketplace duckAsteroid/brindley` and a link to the Claude Code page for permissions, the sidebar, setup without the plugin and updates. For OpenCode it's the `opencode.jsonc` block and a link to the OpenCode page. The generic "Other MCP clients" snippet follows. Everything beyond the install snippet lives only on the tool pages.

## Open questions

_None._

## Acceptance criteria

- The site has a Claude Code page covering the core plugin (install, what it brings, version
  updates, permissions) and connecting without the plugin.
- The site has an OpenCode page covering the MCP server config and checking it with `opencode mcp list`.
- Neither page contains the other tool's steps; getting-started links to both.
- The site nav lists both pages.

## Appendix: Rejected alternatives

- **Q1** A new "Connect your agent" nav group with a third "Other MCP clients" page. It would be a group of mostly short pages, and the pages can move into a group later by changing only the nav.
- **Q2** Links only, which sends most readers away from getting-started before step 2.
