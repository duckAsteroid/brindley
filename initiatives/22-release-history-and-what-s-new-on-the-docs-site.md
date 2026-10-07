---
type: docs
status: designed
updated: 2026-10-07
---
# Release history and what's new on the docs site

## Goal

There is no readable release history: GitHub Releases are created with `--generate-notes`, which without pull requests gives only a compare link (e.g. v1.1.0's notes are just `…/compare/v1.0.4...v1.1.0`), and the docs site says nothing about what changed. Add a Releases page to the site and a "what's new" pointer to the latest release, and give each GitHub Release real notes — all generated from the Conventional Commits between tags, the same commits `scripts/version.mjs` already reads to compute versions.

## Dependencies

- [23 Exclusions in docs globs](23-exclusions-in-docs-globs.md) — keeps the Releases page out of the collection's `docs:` globs

## Decisions

- The changelog's details are generated from the commits between release tags, never hand-written, so they can't drift: `feat`, `fix` and `perf` commits and breaking changes (`!` / `BREAKING CHANGE:`), grouped per release; `docs`, `chore`, `test`, `ci`, `build`, `style` and `refactor` commits are left out.
- The Releases page is history by nature, a deliberate exception to "project docs describe the code as it is now". It is excluded from the collection's `docs:` globs, so `check_docs` and `complete`'s doc checks don't treat it as project documentation; every other page stays current-state.
- With a `!` exclusion in the collection's `docs:` globs (e.g. `"!site/releases.md"`), read with the same in-order, last-match-wins rules as `ignore:`. Exclusions are their own initiative, initiatives#23, which this depends on.
- Each release shows optional hand-written highlights, then the generated details. The highlights come from the annotated tag's message (`git tag -a v1.2.0 -m "…"`), written once at release time and versioned with the release; a lightweight tag, or an empty message, shows just the details. "What's new" is the latest release's entry — highlights if any, then details — at the top of the Releases page, linked from the home page or nav.
- Generated at site build time, never committed: a VitePress data loader reads the release tags, their messages and the commits between them. The Pages workflow (which already fetches full history, tags included) also runs on `v*` tag pushes, so each release rebuilds the site. One shared script (e.g. `scripts/changelog.mjs`) does the reading and formatting: the site's loader uses it for every release, and the release workflow runs it for the new tag and passes the result to `gh release create --notes-file` instead of `--generate-notes`, so each GitHub Release says the same as the site.

## Open questions

_None._

## Acceptance criteria

- A script (e.g. `scripts/changelog.mjs`) produces, for one release tag or for all of them, newest first: the tag's version and date, the annotated tag's message as highlights when there is one, then details grouped as Breaking, Features, Fixes and Performance from the `feat`, `fix`, `perf` and breaking (`!` / `BREAKING CHANGE:`) commits since the previous release tag. Other commit types are left out; a release with none says so. It reads the same Conventional Commits rules as `scripts/version.mjs`.
- The docs site has a Releases page built from it at site build time by a VitePress data loader; nothing generated is committed.
- The latest release's entry heads the page as "What's new", and the home page or nav links to it.
- The Pages workflow also runs on `v*` tag pushes, so a release appears on the site without any other change.
- The release workflow runs the script for the pushed tag and creates the GitHub Release with `--notes-file` instead of `--generate-notes`.
- This repo's `initiatives` collection excludes the page from its `docs:` globs (initiatives#23), so `check_docs` doesn't flag it.
- The release steps in the README's "Developing Brindley" section say to write highlights with an annotated tag (`git tag -a vX.Y.Z -m "…"`).
- The script is tested on a repo with tags, an annotated tag message, a breaking change, a release with no listed commits, and commit types that are left out.
