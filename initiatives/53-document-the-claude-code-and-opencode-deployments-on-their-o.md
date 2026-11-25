---
type: docs
status: draft
updated: 2026-11-25
---
# Document the Claude Code and OpenCode deployments on their own site pages

## Goal

Someone using Claude Code, or someone using OpenCode, finds one site page covering everything Brindley offers for their tool: how to connect the server, the plugins available (core plugin and, once shipped, the sidebar), permissions, and keeping versions current. Neither page should mix in the other tool's steps.

## Dependencies

_None._

## Related

- [45 Install Brindley as a Claude Code plugin](done/45-install-brindley-as-a-claude-code-plugin.md)
- [47 Package and release the OpenCode sidebar plugin with Brindley](47-package-and-release-the-opencode-sidebar-plugin-with-brindle.md)
- [52 Bring the brindley-sidebar Claude Code mod into the project](52-bring-the-brindley-sidebar-claude-code-mod-into-the-project.md)

## Background

Today all deployment material sits in step 1 of `site/guide/getting-started.md`:

- "Claude Code: the plugin" (lines 9–40): installing it, what it brings, version pinning, and the
  `mcp__plugin_brindley_brindley` permission rule.
- "Any MCP client" (lines 42–80): a code-group with tabs for Claude Code without the plugin,
  OpenCode (`~/.config/opencode/opencode.jsonc`), and other MCP clients.

There's no OpenCode plugin yet (#47 packages the OpenCode sidebar), and nothing in the site nav
(`site/.vitepress/config`, "Guide" items) names a tool. The Claude Code sidebar (#52) is going to
ship as a separate opt-in plugin, `brindley-sidebar`, next to the core plugin. These pages are where
#47 and #52 will document their sidebars once they ship.

## Open questions

- **Q1** Page layout: one page per tool (`guide/claude-code.md`, `guide/opencode.md`) under
  "Guide", or a new "Deployment" nav group holding those two plus "Other MCP clients"?
- **Q2** What remains in getting-started step 1: a short "pick your tool" list linking to each
  page, or the generic `npx brindley@latest` MCP setup plus links?

## Acceptance criteria

- The site has a Claude Code page covering the core plugin (install, what it brings, version
  updates, permissions) and connecting without the plugin.
- The site has an OpenCode page covering the MCP server config and checking it with `opencode mcp list`.
- Neither page contains the other tool's steps; getting-started links to both.
- The site nav lists both pages.
