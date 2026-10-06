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

## Decisions

- Inference is a shared function, not a tool: `proseStatus()` (src/markdown.ts:292) for the two explicit forms — a `**Status:**` lead-in line or the first line under `## Status` — mapped with `normaliseStatus()` (core names, the collection's `statuses:`, then aliases). No free-text detection: an agent reading a sentence like "still exploratory" decides and passes the status explicitly. Used by `batch_update` (initiatives#11) when asked to take the status from the text, by `migrate` (initiatives#1), and by a new `validate` finding `status-inferable` ("No status recorded; the body says Proposed (draft) — record it with batch_update") so adopters discover the tool. A missing or unmappable status line is listed for a person or agent to decide, never guessed. Fix mode (initiatives#8) does not write statuses.

## Open questions

## Acceptance criteria
