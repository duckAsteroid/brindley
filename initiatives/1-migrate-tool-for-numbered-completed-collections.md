---
type: feature
status: draft
updated: 2026-10-06
---
# migrate tool for numbered + completed/ collections

## Goal

Implement the `migrate` tool specified in MCP-SERVER.md §3 (Setup), so an existing numbered + `completed/` folder can be converted to a Brindley collection in one commit, following FORMAT.md §11.

## Dependencies

_None._

## Open questions

- Dependency extraction will be heuristic (links to `completed/NN-…`, bare "`30`" mentions, module names like `lib:geo-coords`). Is an agent-assisted migration (the tool proposes, the agent confirms each file) acceptable?

## Acceptance criteria
