---
type: feature
status: designed
updated: 2026-10-07
---
# rename_collection tool

## Goal

Implement the `rename_collection` tool specified in MCP-SERVER.md §3 (Setup), which moves a collection folder and rewrites `<collection>#<n>` references and relative links that point into it.

## Dependencies

_None._

## Open questions

_None._

## Acceptance criteria

- `rename_collection` takes a collection and a new folder path, and moves the folder.
- It rewrites every relative link into the moved folder from anywhere in the repo, and every relative link out of it from inside.
- `"<collection>#<n>"` references are rewritten when the collection's name changes (the name comes from the folder unless `name:` is set). Explicit aliases are kept.
- It refuses a destination that exists or is inside another collection, and a new name already used by another collection.
- After it runs, `validate` reports no broken links or dangling references caused by the move.
- Documented in MCP-SERVER.md and the site's MCP reference; tested with links in both directions and a cross-collection reference.
