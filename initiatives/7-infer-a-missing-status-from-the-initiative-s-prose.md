---
type: feature
status: draft
updated: 2026-10-06
tags: [status-recording, adoption]
---
# Infer a missing status from the initiative's prose

## Goal

When an initiative has no front-matter `status` and no status folder, but its text states one ("Proposed", "Draft", "Exploratory", "Completed"), offer the matching front-matter value — singly or for every such file in a collection — so adopting a hand-written folder needs no file-by-file status stamping.

## Dependencies

_None._

## Related

- [GitHub #4](https://github.com/duckAsteroid/brindley/issues/4) — the request this came from
- [1 migrate tool for numbered + completed/ collections](1-migrate-tool-for-numbered-completed-collections.md) — migrate also maps status wording to the enum
- [6 Record status without lifecycle checks](6-record-status-without-lifecycle-checks.md) — writing the inferred status needs a non-lifecycle write

## Open questions

- The `status-prose-mismatch` check already reads status from the text — reuse its parsing? And is this a tool of its own, part of `migrate` (initiatives#1), or one of fix mode's (initiatives#8) repairs?

## Acceptance criteria
