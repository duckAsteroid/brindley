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
- [7 Infer a missing status from the initiative's prose](7-infer-a-missing-status-from-the-initiative-s-prose.md) — inferred statuses are a candidate repair
- [2 renumber tool for post-merge number collisions](2-renumber-tool-for-post-merge-number-collisions.md) — removing zero-padding is a rename, which renumber already does

## Open questions

- Which repairs are safe enough? Rewriting a broken link edits text in place; removing zero-padding (`01-foo.md` → `1-foo.md`) renames a file, against "Brindley never moves files itself". Include renames, leave them to `renumber` (initiatives#2), or require an explicit opt-in?

## Acceptance criteria
