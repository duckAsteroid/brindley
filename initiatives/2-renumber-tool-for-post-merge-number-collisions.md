---
type: feature
status: done
updated: 2026-10-07
docs_impact:
  - MCP-SERVER.md
  - site/reference/mcp.md
---
# renumber tool for post-merge number collisions

## Goal

Implement the `renumber` tool specified in MCP-SERVER.md, which fixes a post-merge number collision by renaming the file and asset directory and rewriting the few references to it.

## Dependencies

_None._

## Decisions

- Implementation: `renumber` uses the shared planner in src/relink.ts, extended with `planRefs` for `"<collection>#<n>"` references (by name or alias, outside code) and a bare `superseded_by: <n>` in the initiative's own collection. When the number is shared by a `duplicate-number` pair, its references are ambiguous, so they are left alone with a warning; links, which name a specific file, are still rewritten. It applies by default, with an optional `dry_run`, and pads the new number to the collection's width.

## Open questions

_None._

## Acceptance criteria

- `renumber` takes a ref and an optional new number (default: the next number, coined as `create` does — scanning other worktrees, branches and history).
- It renames the file and its asset folder (`<n>-…/`), keeping the slug, and rewrites every relative link to them across all collections, and every `"<collection>#<n>"` reference.
- It refuses a number already in use, and works on either file of a `duplicate-number` pair by path.
- After it runs, `validate` reports no `duplicate-number` or broken links for that initiative.
- Documented in MCP-SERVER.md and the site's MCP reference; tested on a collision with links from the same and another collection.

