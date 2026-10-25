---
type: feature
status: draft
updated: 2026-10-24
---
# Writes no longer regenerate READMEs

## Goal

A tool write changes only the initiative files it writes, so parallel agents never conflict on a collection README, theme doc or milestone doc; generated blocks are refreshed only when someone runs `regenerate_readmes`.

## Problem

`initiatives/README.md` is changed in 49 of the repo's 104 commits. Two paths keep generated blocks current, and both rewrite shared files on every call:

- **After every write**, `finish()` regenerates every generated block in the repo (`src/ops.ts:80-82`; MCP-SERVER.md §6.1 "After every write"). Creating initiatives#37–42 rewrote `initiatives/security.md` six times.
- **At the start of every call**, the server compares each block with what it would generate and rewrites stale ones (`src/server.ts:232-235`; §6.1 "After edits the server didn't make"), unless started with `--no-auto-readme` (`src/cli.ts:76`).

Generation is deterministic, so this avoids *spurious* conflicts, but not real ones: two sub-agents that each add an initiative both add a row to the Active table, a node to the Mermaid graph and a count to the theme list, so their branches always conflict there.

## Design

- `finish()` no longer calls `regenerate()`; a write's `touched` lists only the files it wrote
  (plus moved files and rewritten links, for `folders:` collections). Milestone flips are still
  computed and reported.
- The start-of-call self-heal is removed, except for blocks containing conflict markers: those are
  still regenerated, since a conflicted block is unusable and either side is disposable.
- `regenerate_readmes` is the only thing that refreshes generated blocks. It is run deliberately —
  by a person, by an agent asked to, or in CI on `main`.
- Generated blocks do not record when they were last regenerated: output stays deterministic
  (FORMAT §8).

## Principle changes

- [Readable on GitHub](../FORMAT.md#design-principles) — collection READMEs remain useful when
  browsing the repo, but show the collection as of the last explicit regeneration, not as of the
  latest commit.

## Dependencies

_None._

## Related

- [A JSON snapshot that every view renders from](44-a-json-snapshot-that-every-view-renders-from.md) — moves README generation onto the snapshot
- [Check initiatives against the project's design principles](36-check-initiatives-against-the-project-s-design-principles.md) — defines `## Principle changes`

## Open questions

- Is this the behaviour for every collection, or opt-in per collection (e.g. `readme: manual` in
  the README front-matter) with today's behaviour as the default? Changing it for everyone is
  simpler; opt-in avoids surprising existing users whose READMEs would quietly go stale.
- What does `validate` do with `readme-stale` (`src/validate.ts:157-158`)? Keep it as a warning
  everywhere (it would fire on most branches), drop it from `validate` and leave staleness to
  `regenerate_readmes check=true` in CI, or report it only on `main`?
- Does `--no-auto-readme` go away, or does it come to mean "don't even heal conflicted blocks"?

## Acceptance criteria

- `create`, `update`, `set_status`, `complete` and every other write leave collection READMEs,
  theme docs and milestone docs unchanged; their `touched` lists show it.
- A tool call no longer rewrites a stale generated block; it still regenerates a conflicted one.
- `regenerate_readmes` brings every generated block up to date, as now.
- MCP-SERVER.md §6.1 and FORMAT §8 describe when generated blocks are refreshed; FORMAT §1
  "Readable on GitHub" reflects the change.
- Tests cover two writes in sequence leaving the README untouched, and a conflicted block being
  healed.
