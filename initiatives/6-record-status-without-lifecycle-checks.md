---
type: feature
status: designed
updated: 2026-10-07
tags: [status-recording]
---
# Record status without lifecycle checks

## Goal

Give agents a way to write the `status` an initiative already has (backfilling front-matter on an adopted collection) without `set_status`'s lifecycle checks, which are for transitions. Editing a `done` initiative's body (e.g. `## Findings`, an appendix) already works with `update` — no status change needed — but nothing says so, so agents force it to in-progress and back; document it.

## Dependencies

_None._

## Related

- [GitHub #4](https://github.com/duckAsteroid/brindley/issues/4) — the request this came from

## Decisions

- Recording vs transitioning is decided by whether front-matter already has a `status:`. With none, writing one records a fact and is unchecked — including `done`, which is written with `docs_impact: "none: completed before Brindley"` so `validate`'s docs-impact check (src/validate.ts:161, which only exempts status taken from a folder) stays satisfied without a new exception. With one recorded, any change is a transition through `set_status` and its lifecycle checks, `force` remaining the escape hatch. Editing a done initiative's body needs no change: `update` has no status check (src/ops.ts:355); document that it is the way to refine settled work, so agents stop forcing status round-trips.

## Open questions

_None._

## Acceptance criteria

- `update` accepts `status`. On an initiative with no `status:` in front-matter it writes the status with no lifecycle checks, mapping aliases ("Proposed" → `draft`) through the collection's `statuses:` as `set_status` does.
- On an initiative that already has a front-matter `status:`, `update` with `status` is refused, saying to use `set_status` (the change is a transition).
- Recording `done` this way also writes `docs_impact: "none: completed before Brindley"`, and `validate` reports no `docs-impact` warning for it.
- An initiative whose status came from a status folder (e.g. `completed/`) has no front-matter `status:`, so it can be recorded; the front-matter value then takes precedence, as `set_status` already warns.
- `update` on a `done` initiative's body (e.g. `section: "Findings"`) keeps working without a status change, and the `update` tool description, MCP-SERVER.md and the site's MCP reference say it is the way to refine settled work.
- Tests cover each case above.
