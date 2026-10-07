---
type: feature
status: draft
updated: 2026-10-06
---
# renumber tool for post-merge number collisions

## Goal

Implement the `renumber` tool specified in MCP-SERVER.md, which fixes a post-merge number collision by renaming the file and asset directory and rewriting the few references to it.

## Dependencies

_None._

## Open questions

_None._

## Acceptance criteria

- `renumber` takes a ref and an optional new number (default: the next number, coined as `create` does — scanning other worktrees, branches and history).
- It renames the file and its asset folder (`<n>-…/`), keeping the slug, and rewrites every relative link to them across all collections, and every `"<collection>#<n>"` reference.
- It refuses a number already in use, and works on either file of a `duplicate-number` pair by path.
- After it runs, `validate` reports no `duplicate-number` or broken links for that initiative.
- Documented in MCP-SERVER.md and the site's MCP reference; tested on a collision with links from the same and another collection.
