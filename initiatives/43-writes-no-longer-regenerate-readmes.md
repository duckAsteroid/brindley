---
type: feature
status: designed
updated: 2026-11-04
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
  still regenerated, since a conflicted block is unusable and either side is disposable. The
  `--no-auto-readme` serve flag is removed.
- This applies to every collection; there is no switch to keep the old behaviour. It ships as a
  breaking change.
- `regenerate_readmes` is the only thing that refreshes generated blocks. It is run deliberately —
  by a person, by an agent before pushing to a shared remote, or in CI on `main`.
- The agent guidance Brindley serves (server instructions and the implement workflow's commit
  step) says: run `regenerate_readmes` and commit the result before pushing to a shared remote
  such as GitHub; don't regenerate on local branches or worktrees.
- `validate` no longer reports `readme-stale`. Staleness is checked with `regenerate_readmes`'s
  `check` argument (`brindley readmes --check` on the CLI, for CI); there is no separate tool.
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

## Decisions

- **Q1** Every collection, with no opt-in or opt-out switch. Released as a breaking change (next major version): an opt-in switch would leave the parallel-agent conflicts in place for anyone who hadn't found it, and would mean keeping and testing both paths.
- **Q2** `readme-stale` is dropped from `validate`: after this change a stale README is the expected state on a working branch. Freshness is kept at the point of sharing instead. The agent guidance Brindley serves (server instructions, `src/server.ts:57`, and the implement workflow's commit step, `src/server.ts:287`) tells agents to run `regenerate_readmes` and commit the result before pushing to a shared remote (e.g. GitHub), and not to regenerate on local branches or worktrees. `brindley readmes --check` stays available for CI.
- **Q3** `--no-auto-readme` is removed in the same breaking release. Its only remaining effect would be leaving conflict markers in generated blocks, which nobody needs (either side is disposable, and the server already heals conflicted blocks during merges), and its documented purpose — leaving staleness to `validate` — goes with Q2. The CLI ignores unrecognised flags (`flag()`, `src/cli.ts:44-49`), so existing `serve --no-auto-readme` configs keep working.

## Open questions

_None._

## Acceptance criteria

- `create`, `update`, `set_status`, `complete` and every other write leave collection READMEs,
  theme docs and milestone docs unchanged; their `touched` lists show it.
- A tool call no longer rewrites a stale generated block; it still regenerates a conflicted one.
- `brindley serve` no longer documents `--no-auto-readme`; MCP-SERVER.md no longer mentions it.
- `regenerate_readmes` brings every generated block up to date, as now.
- `validate` reports no `readme-stale` finding; `brindley readmes --check` still exits 1 when a
  block is stale.
- The server instructions and implement prompt tell agents to regenerate and commit READMEs before
  pushing to a shared remote, and not on local branches.
- MCP-SERVER.md §6.1 and FORMAT §8 describe when generated blocks are refreshed; FORMAT §1
  "Readable on GitHub" reflects the change.
- Tests cover two writes in sequence leaving the README untouched, and a conflicted block being
  healed.
