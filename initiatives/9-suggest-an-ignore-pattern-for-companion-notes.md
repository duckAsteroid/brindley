---
type: feature
status: designed
updated: 2026-10-07
tags: [adoption]
---
# Suggest a home for companion notes

## Goal

When `duplicate-number` fires and one of the files looks like a companion note rather than an initiative (a `-rationale`, `-notes` or `-design` suffix, say), the finding says what to do with it: move it into the initiative's asset folder (FORMAT §3), or add the exact `ignore` pattern — instead of only pointing at the `ignore` tool.

## Dependencies

_None._

## Related

- [GitHub #5](https://github.com/duckAsteroid/brindley/issues/5) — the request this came from

## Decisions

- Name only: a file is a likely companion when it shares its number with another file and its name is the other's name plus a suffix (`24-booking-window.md` / `24-booking-window-rationale.md`). Not shape — mid-adoption, real initiatives also lack a front-matter status and `## Dependencies`. No configuration: it is only a suggestion, and `ignore:` already holds collection-specific patterns. The `duplicate-number` finding then offers two remedies in this order: (1) move the companion into the initiative's asset folder (FORMAT §3), e.g. `24-booking-window/rationale.md`, and link it from the initiative — the format's own home for companion material, never counted as an initiative; (2) to leave it in place, add an `ignore` pattern: `*-<suffix>.md` for common suffixes (`rationale`, `notes`, `design`), else the exact filename. Brindley does not move the file itself; the hint says links to it need updating. A lone companion with no same-numbered initiative (it does not trigger `duplicate-number`) is out of scope.

## Open questions

_None._

## Acceptance criteria

- When `duplicate-number` fires and one file's name is the other's plus a suffix (`24-booking-window.md` / `24-booking-window-rationale.md`), the finding names it as a likely companion and offers, in order: move it into the initiative's asset folder (e.g. `24-booking-window/rationale.md`) and link it from the initiative; or add an `ignore` pattern.
- The suggested pattern is `*-<suffix>.md` for `rationale`, `notes` and `design`, and the exact filename otherwise.
- The finding says links to a moved file need updating; Brindley moves nothing.
- Duplicates with no suffix relationship keep today's message.
- No configuration is added. Tests cover a common suffix, an unusual suffix and an unrelated duplicate.
