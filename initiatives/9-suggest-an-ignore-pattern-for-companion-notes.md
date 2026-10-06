---
type: feature
status: draft
updated: 2026-10-06
tags: [adoption]
---
# Suggest an ignore pattern for companion notes

## Goal

When `duplicate-number` fires and one of the files looks like a companion note rather than an initiative (a `-rationale`, `-notes` or `-design` suffix, say), put the exact `ignore` pattern to add in the finding, instead of only pointing at the `ignore` tool.

## Dependencies

_None._

## Related

- [GitHub #5](https://github.com/duckAsteroid/brindley/issues/5) — the request this came from

## Open questions

- What makes a file look like a companion note: only a filename suffix (`-rationale`, `-notes`, `-design`), or also its shape (no front-matter status, no `## Dependencies`)? Should the suffix list be configurable?

## Acceptance criteria
