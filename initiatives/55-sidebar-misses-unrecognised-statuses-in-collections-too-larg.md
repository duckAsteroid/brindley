---
type: bug
status: superseded
updated: 2026-11-25
superseded_by: sidebar#1
status_note: Sidebar issues live in their own collection, sidebar (sidebar/initiatives/).
---
# Sidebar misses unrecognised statuses in collections too large for one list result

> [!NOTE]
> **Superseded** by [sidebar#1 Sidebar misses unrecognised statuses in collections too large for one list result](../sidebar/initiatives/01-sidebar-misses-unrecognised-statuses-in-collections-too-larg.md) (2026-11-25): Sidebar issues live in their own collection, sidebar (sidebar/initiatives/).

## Goal

An initiative whose status Brindley does not recognise shows in the Claude Code sidebar pane, marked `?`, even in a collection too large for one MCP `list` result.

## Dependencies

- [52 Bring the brindley-sidebar Claude Code mod into the project](done/52-bring-the-brindley-sidebar-claude-code-mod-into-the-project.md) — the sidebar code lives in this repo once #52 is done

## Related

- [https://github.com/dcsmiff/claudecode-brindley-sidebar/blob/main/docs/initiatives/02-unrecognised-statuses-in-collections-too-large-for-one-mcp-r.md](https://github.com/dcsmiff/claudecode-brindley-sidebar/blob/main/docs/initiatives/02-unrecognised-statuses-in-collections-too-large-for-one-mcp-r.md)

## Background

This came from the sidebar's own collection upstream (cbs#2, linked under Related). When a
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
