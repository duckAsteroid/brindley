---
type: feature
status: draft
updated: 2026-10-06
tags: [status-recording]
---
# Record status without lifecycle checks

## Goal

Give agents a way to write the `status` an initiative already has (backfilling front-matter on an adopted collection) without `set_status`'s lifecycle checks, which are for transitions. Also let a `done` initiative's body (e.g. `## Findings`, an appendix) be edited without forcing it to in-progress and back.

## Dependencies

_None._

## Related

- [GitHub #4](https://github.com/duckAsteroid/brindley/issues/4) — the request this came from

## Decisions

- Recording vs transitioning is decided by whether front-matter already has a `status:`. With none, writing one records a fact and is unchecked — including `done`, which is written with `docs_impact: "none: completed before Brindley"` so `validate`'s docs-impact check (src/validate.ts:161, which only exempts status taken from a folder) stays satisfied without a new exception. With one recorded, any change is a transition through `set_status` and its lifecycle checks, `force` remaining the escape hatch. Editing a done initiative's body needs no change: `update` has no status check (src/ops.ts:355); document that it is the way to refine settled work, so agents stop forcing status round-trips.

## Open questions

## Acceptance criteria
