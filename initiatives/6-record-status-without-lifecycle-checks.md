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

## Open questions

- Letting `update` write `status` makes `set_status`'s lifecycle checks easy to sidestep. Is that acceptable, or should the unchecked write be limited — e.g. only when no status is recorded yet, or a separate "backfill" tool — and editing a done initiative's body simply allowed by `update`?

## Acceptance criteria
