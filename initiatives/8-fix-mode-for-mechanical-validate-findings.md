---
type: feature
status: draft
updated: 2026-10-06
tags: [adoption]
---
# Fix mode for mechanical validate findings

## Goal

Add a `fix` tool / `brindley validate --fix` that applies the findings with one obvious repair and lists what it changed: rewrite a `broken-link` to where `validate` already knows the file now lives (recomputing `../` depth), and other safe mechanical repairs. Turns an afternoon of hand-editing on an adopted collection into one call plus review.

## Dependencies

_None._

## Related

- [GitHub #5](https://github.com/duckAsteroid/brindley/issues/5) — the request this came from
- [7 Infer a missing status from the initiative's prose](7-infer-a-missing-status-from-the-initiative-s-prose.md) — writes inferred statuses, which fix mode does not
- [1 migrate tool for numbered + completed/ collections](1-migrate-tool-for-numbered-completed-collections.md) — removing zero-padding renames files, so migrate does it

## Decisions

- Fix mode only edits text inside files; it never renames or moves one (FORMAT.md:576; `migrate` stays the one sanctioned mass-rewrite). Repairs: a `broken-link` whose filename matches exactly one moved file is rewritten with the right relative path (two or more candidates are reported, not fixed); `front-matter-dependencies` become links under `## Dependencies` and the field is dropped. `readme-stale` needs nothing new (regenerated on every tool call). Zero-padding removal moves to `migrate` (initiatives#1), which renames and rewrites links in its single migration commit; the `number-padding` finding points there. Dry run by default, like `migrate` and `ignore`: returns each planned edit (file, line, before/after) and writes only with `dry_run: false`.

## Open questions

## Acceptance criteria
