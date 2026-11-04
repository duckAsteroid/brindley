---
type: feature
status: done
updated: 2026-11-04
docs_impact:
  - FORMAT.md
  - MCP-SERVER.md
  - site/guide/concepts.md
  - site/reference/cli.md
  - site/reference/mcp.md
  - site/reference/validation.md
---
# Writes no longer regenerate READMEs

## Goal

A tool write changes only the initiative files it writes, so parallel agents never conflict on a collection README, theme doc or milestone doc; generated blocks are refreshed only when someone runs `regenerate_readmes`.

## Problem

`initiatives/README.md` was changed in 49 of the repo's 104 commits. Every write regenerated every generated block in the repo, and every tool call rewrote any stale block. Generation is deterministic, so this avoided *spurious* conflicts but not real ones: two sub-agents that each add an initiative both add a row to the Active table, a node to the Mermaid graph and a count to the theme list, so their branches always conflicted there. Creating initiatives#37–42 rewrote `initiatives/security.md` six times.

## Design

- `finish()` (`src/ops.ts`) no longer regenerates; a write's `touched` lists only the files it
  wrote (plus moved files and rewritten links, for `folders:` collections). Milestone flips are
  still computed and reported.
- `create_collection`, `update_collection` and `ignore`, which write a collection README
  themselves, refresh that README's generated block and nothing else (`regenerate`'s
  `readmesOnly` option).
- At the start of every tool call the server regenerates only blocks containing conflict markers
  (a conflicted block is unusable and either side is disposable). The `--no-auto-readme` serve
  flag is removed.
- This applies to every collection, with no switch; it ships as a breaking change.
- `regenerate_readmes` is the only thing that refreshes generated blocks. It is run deliberately —
  by a person, by an agent before pushing to a shared remote, or in CI on `main`.
- The agent guidance Brindley serves (server instructions, the implement workflow's commit
  step, and the agent snippet `create_collection` returns) says: run `regenerate_readmes` and commit the result before pushing to a shared remote
  such as GitHub; don't regenerate on local branches or worktrees.
- `validate` no longer reports `readme-stale`. Staleness is checked with `regenerate_readmes`'s
  `check` argument (`brindley readmes --check` on the CLI, for CI); there is no separate tool.
- Generated blocks do not record when they were last regenerated: output stays deterministic
  (FORMAT §8).

## Principle changes

- [Readable on GitHub](../../FORMAT.md#design-principles) — collection READMEs remain useful when
  browsing the repo, but show the collection as of the last explicit regeneration, not as of the
  latest commit.

## Dependencies

_None._

## Related

- [A JSON snapshot that every view renders from](../44-a-json-snapshot-that-every-view-renders-from.md) — moves README generation onto the snapshot
- [Check initiatives against the project's design principles](../36-check-initiatives-against-the-project-s-design-principles.md) — defines `## Principle changes`

## Decisions

- **Q1** Every collection, with no opt-in or opt-out switch. Released as a breaking change (next major version): an opt-in switch would leave the parallel-agent conflicts in place for anyone who hadn't found it, and would mean keeping and testing both paths.
- **Q2** `readme-stale` is dropped from `validate`: a stale README is the expected state on a working branch. Freshness is kept at the point of sharing instead: the agent guidance tells agents to run `regenerate_readmes` and commit the result before pushing to a shared remote (e.g. GitHub), and not to regenerate on local branches or worktrees. Staleness checks stay as `regenerate_readmes`'s `check` argument (`brindley readmes --check` for CI).
- **Q3** `--no-auto-readme` is removed in the same breaking release. Its only remaining effect would be leaving conflict markers in generated blocks, which nobody needs, and its documented purpose — leaving staleness to `validate` — went with Q2. The CLI ignores unrecognised flags, so existing `serve --no-auto-readme` configs keep working.
- **Q4** Yes: `create_collection`, `update_collection` and `ignore` regenerate the generated block of the collection README they write, and nothing else (no theme or milestone docs, no other collections). They already rewrite that file, so it adds no conflict surface, and their effect (a new collection's table, a new column, newly ignored files) shows at once.

## Open questions

_None._

## Acceptance criteria

- `create`, `update`, `set_status`, `complete` and every other write leave collection READMEs,
  theme docs and milestone docs unchanged; their `touched` lists show it. `create_collection`,
  `update_collection` and `ignore` refresh only the README they write.
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

## Appendix: Rejected alternatives

- **Opt-in per collection** (`readme: manual` in the README front-matter, today's behaviour by
  default). It avoided surprising existing users, but left the conflicts in place for anyone who
  hadn't found the switch, and meant keeping and testing both paths.
- **Keeping `readme-stale` in `validate`**, everywhere or only on the default branch. Everywhere,
  it fires on almost every branch and pushes agents back into regenerating; on the default branch
  only, `validate` has to know the branch and is still wrong between a merge and the next
  regeneration.
- **A separate staleness tool** (`readmes_stale`). More discoverable than an argument, and can't
  write by accident, but it is two tools for one job; the pre-push step is just "regenerate and
  commit whatever changed".
- **Keeping `--no-auto-readme`** to mean "don't heal conflicted blocks". Nobody needs conflict
  markers left in a derived block.
- **Collection writes following the general rule.** `create_collection` would leave a README with
  no table, and `update_collection` changing `columns:` would not show until the next
  regeneration.
