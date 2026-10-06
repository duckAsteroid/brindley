---
type: feature
status: draft
tags: [status-recording, adoption]
updated: 2026-10-06
---
# batch_update tool

## Goal

A `batch_update` tool that applies `update`-style changes — `status`, `type`, `owner`, `tags`, `status_note`, and so on — to many initiatives in one call, with each initiative's changes given separately. `status` follows the recording rule decided in initiatives#6 (unchecked only when none is in front-matter yet; otherwise it is a transition for `set_status`), and can be taken from the initiative's text as decided in initiatives#7. The motivating case is adoption: backfilling statuses across a 60-file folder becomes one call plus a review of what was written, instead of a call per file.

## Dependencies

_None._

## Related

- [6 Record status without lifecycle checks](6-record-status-without-lifecycle-checks.md) — decides when a status may be written without lifecycle checks
- [7 Infer a missing status from the initiative's prose](7-infer-a-missing-status-from-the-initiative-s-prose.md) — how a status is taken from the text
- [GitHub #4](https://github.com/duckAsteroid/brindley/issues/4) — the request this came from

## Decisions

- All or nothing: every entry is checked before anything is written (unknown ref, a status that would be a transition for `set_status`, no status in the text when asked to take it from there). If any fail, nothing is written and every failure is reported, not just the first. Entries set values rather than toggle them, so the caller corrects the batch and resends the whole of it safely. `dry_run` is supported, default false — the caller states the changes, unlike `migrate` — and returns what each file would get, notably statuses taken from the text ("22 → draft, from 'Proposed'"), without writing.

## Open questions

_None._

## Acceptance criteria

_What must be true when this is done._
