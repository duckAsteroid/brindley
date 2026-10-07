---
type: feature
status: done
updated: 2026-10-07
tags: [status-recording, adoption]
docs_impact:
  - FORMAT.md
  - site/reference/validation.md
---
# Infer a missing status from the initiative's prose

## Goal

When an initiative has no front-matter `status` and no status folder, but its text states one ("Proposed", "Draft", "Exploratory", "Completed"), offer the matching front-matter value — singly or for every such file in a collection — so adopting a hand-written folder needs no file-by-file status stamping.

## Dependencies

_None._

## Related

- [GitHub #4](https://github.com/duckAsteroid/brindley/issues/4) — the request this came from
- [6 Record status without lifecycle checks](6-record-status-without-lifecycle-checks.md) — writing the inferred status needs a non-lifecycle write

## Decisions

- Inference is a shared function, not a tool: `proseStatus()` (src/markdown.ts:292) for the two explicit forms — a `**Status:**` lead-in line or the first line under `## Status` — mapped with `normaliseStatus()` (core names, the collection's `statuses:`, then aliases). No free-text detection: an agent reading a sentence like "still exploratory" decides and passes the status explicitly. Used by `batch_update` (initiatives#11) when asked to take the status from the text, by `migrate` (initiatives#1), and by a new `validate` finding `status-inferable` ("No status recorded; the body says Proposed (draft) — record it with batch_update") so adopters discover the tool. A missing or unmappable status line is listed for a person or agent to decide, never guessed. Fix mode (initiatives#8) does not write statuses.
- Implementation: the function is `statusFromText` in src/repo.ts. An initiative with no status still gets the `status-missing` error (FORMAT requires a status), now shortened to point at `status-inferable` when the text states one, so each can be filtered on its own. `status-inferable` isn't reported for a file in an unknown status folder — its `status-missing` message covers that case.

## Open questions

_None._

## Acceptance criteria

- One exported function returns the status stated in an initiative's text — from a `**Status:**` lead-in line or the first line under `## Status` — mapped with `normaliseStatus` (core names, the collection's `statuses:`, then aliases), or says why there is none (no status line / word it can't map, quoting the word).
- It reads only those two forms: a sentence such as "This proposal is still exploratory." gives no status.
- `validate` reports a `status-inferable` warning for an initiative with no recorded status (no front-matter `status:`, not in a status folder) whose text states one, e.g. "No status recorded; the body says Proposed (draft). Record it with `update`."
- `status-prose-mismatch` uses the same function, and its current behaviour is unchanged.
- The rule is listed in the site's validation reference and FORMAT §10.
- Tests cover both forms, aliases, a collection's own `statuses:` word, an unmappable word and free text.
