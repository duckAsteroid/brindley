---
type: feature
status: draft
updated: 2026-10-06
tags: [adoption]
---
# Name the base folder in path errors

## Goal

Every error or finding that rejects a path (`broken-link`, `status-not-in-folder`, path lookups in tools) states the folder it resolved against, as `complete`'s `docs_impact` check now does — in worktree setups the base is often not the one the caller expects.

## Dependencies

_None._

## Related

- [GitHub #5](https://github.com/duckAsteroid/brindley/issues/5) — the request this came from
- [GitHub #2](https://github.com/duckAsteroid/brindley/issues/2) — the `docs_impact` bug that prompted this, fixed there

## Open questions

- (implementation) Base folder in every message, or only when it differs from the expected one (the collection folder, or another worktree has the file)? Repeating the repo root on every `broken-link` finding is noisy.

## Acceptance criteria

_What must be true when this is done._
