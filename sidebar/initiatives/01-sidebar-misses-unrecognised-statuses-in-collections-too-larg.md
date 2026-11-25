---
type: bug
status: draft
updated: 2026-11-25
---
# Sidebar misses unrecognised statuses in collections too large for one list result

## Goal

An initiative whose status Brindley does not recognise shows in the Claude Code sidebar pane, marked `?`, even in a collection too large for one MCP `list` result.

## Dependencies

_None._

## Related

- [initiatives#52 Bring the brindley-sidebar Claude Code mod into the project](../../initiatives/done/52-bring-the-brindley-sidebar-claude-code-mod-into-the-project.md)
- [https://github.com/dcsmiff/claudecode-brindley-sidebar/blob/main/docs/initiatives/02-unrecognised-statuses-in-collections-too-large-for-one-mcp-r.md](https://github.com/dcsmiff/claudecode-brindley-sidebar/blob/main/docs/initiatives/02-unrecognised-statuses-in-collections-too-large-for-one-mcp-r.md)

## Background

This came from the sidebar's first repository (cbs#2 there, linked under Related). When a
collection is too large for one MCP result, the sidebar lists it one status at a time
(upstream commit `1e55dc6`, "List per collection, by status when over the MCP output cap").
`list`'s `status` filter only matches exact statuses, so an initiative with an unrecognised
`status:` value comes back in none of those calls. It is missing from the pane instead of
showing as `?`.

## Open questions

- **Q1** Where is it fixed: in the sidebar (e.g. one more unfiltered call, keeping only the
  statuses it didn't recognise), or in Brindley's `list` (a way to ask for initiatives whose
  status is unrecognised)?

## Acceptance criteria

_What must be true when this is done._
