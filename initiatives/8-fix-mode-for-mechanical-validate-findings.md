---
type: feature
status: designed
updated: 2026-10-07
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
- [1 migrate tool for numbered + completed/ collections](1-migrate-tool-for-numbered-completed-collections.md) — making padding consistent renames files, so migrate does it

## Decisions

- Fix mode only edits text inside files; it never renames or moves one (FORMAT.md:576; `migrate` stays the one sanctioned mass-rewrite). Repairs: a `broken-link` whose filename matches exactly one moved file is rewritten with the right relative path (two or more candidates are reported, not fixed); `front-matter-dependencies` become links under `## Dependencies` and the field is dropped. `readme-stale` needs nothing new (regenerated on every tool call). Making padding consistent moves to `migrate` (initiatives#1) and the padding tools of initiatives#13, which rename and rewrite links; padding findings point there. (Padding is kept, not removed — see initiatives#13.) Dry run by default, like `migrate` and `ignore`: returns each planned edit (file, line, before/after) and writes only with `dry_run: false`.

## Open questions

_None._

## Acceptance criteria

- A `fix` tool and `brindley validate --fix` plan repairs for two findings: a `broken-link` whose filename matches exactly one file in the collection (rewritten with the correct relative path), and `front-matter-dependencies` (turned into links under `## Dependencies`, field removed).
- A broken link with two or more candidate files is reported, not fixed.
- No file is renamed or moved.
- `dry_run` defaults to true and returns each planned edit (file, line, before, after); with `dry_run: false` the edits are written and the same list is returned.
- Padding findings (initiatives#13) point to the tools that rename files, not to fix mode.
- Documented in MCP-SERVER.md, the site's CLI and MCP references; tests cover both repairs, the ambiguous case and dry run.
