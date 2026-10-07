---
type: feature
status: done
updated: 2026-10-07
docs_impact:
  - FORMAT.md
  - site/reference/front-matter.md
---
# Exclusions in docs globs

## Goal

A collection's `docs:` globs say which files are project documentation, held to the current-state rules by `check_docs` and `complete` (FORMAT §7.2). They can't exclude anything: `isProjectDoc` (src/docs.ts:22) counts a file if any glob matches, so a page under a docs folder that is legitimately historical — a changelog, a release history — is always checked as current-state docs. Support `!` patterns, read in order with the last match winning, the same rules as `ignore:` (`.gitignore` semantics), e.g. `docs: ["site/**/*.md", "!site/releases.md"]`.

## Dependencies

_None._

## Open questions

_None._

## Acceptance criteria

- A `docs:` pattern starting with `!` excludes the files it matches. Patterns are applied in order and the last match wins, so `["site/**/*.md", "!site/releases.md"]` covers every site page but the release history, and a later positive pattern can re-include a file.
- The same matching is used everywhere `docs:` is read: `check_docs` (including its default "every matching doc"), `complete`'s `docs_impact` check, and finding docs that link into collections.
- A `docs:` list with only `!` patterns matches nothing.
- FORMAT §7.2 and the site's front-matter reference describe the `!` syntax. Tests cover exclusion, re-inclusion, order and an exclusion-only list.
