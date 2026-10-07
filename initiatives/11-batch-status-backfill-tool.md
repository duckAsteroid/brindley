---
type: feature
status: designed
tags: [status-recording, adoption]
updated: 2026-10-07
---
# batch_update tool

## Goal

A `batch_update` tool that applies `update`-style changes — `status`, `type`, `owner`, `tags`, `status_note`, and so on — to many initiatives in one call, with each initiative's changes given separately. `status` follows the recording rule decided in initiatives#6 (unchecked only when none is in front-matter yet; otherwise it is a transition for `set_status`), and can be taken from the initiative's text as decided in initiatives#7. The motivating case is adoption: backfilling statuses across a 60-file folder becomes one call plus a review of what was written, instead of a call per file.

## Dependencies

- [6 Record status without lifecycle checks](6-record-status-without-lifecycle-checks.md) — batch_update applies the status-recording rule, and the single `update` status write, that #6 builds
- [7 Infer a missing status from the initiative's prose](7-infer-a-missing-status-from-the-initiative-s-prose.md) — taking a status from the text calls #7's inference function

## Related

- [GitHub #4](https://github.com/duckAsteroid/brindley/issues/4) — the request this came from

## Decisions

- All or nothing: every entry is checked before anything is written (unknown ref, a status that would be a transition for `set_status`, no status in the text when asked to take it from there). If any fail, nothing is written and every failure is reported, not just the first. Entries set values rather than toggle them, so the caller corrects the batch and resends the whole of it safely. `dry_run` is supported, default false — the caller states the changes, unlike `migrate` — and returns what each file would get, notably statuses taken from the text ("22 → draft, from 'Proposed'"), without writing.

## Open questions

_None._

## Acceptance criteria

- A `batch_update` tool takes a list of entries, each a ref plus any fields `update` accepts (`status`, `type`, `owner`, `tags`, `status_note`, `docs`), or `status: "from-text"` to take the status from the initiative's text (initiatives#7).
- Every entry is checked before anything is written. If any fails — unknown ref, a status that would be a transition, no status in the text — nothing is written and every failure is returned with its entry.
- Otherwise each initiative is written once and the READMEs are regenerated once, and the result lists what each file got.
- `dry_run: true` returns the same per-entry result without writing, showing statuses taken from the text with their source ("22 → draft, from 'Proposed'").
- The `status-inferable` finding (initiatives#7) mentions `batch_update` for recording many at once.
- The tool is documented in MCP-SERVER.md and the site's MCP reference, and tested for success, all-or-nothing failure and dry run.
