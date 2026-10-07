---
type: feature
status: draft
updated: 2026-10-07
---
# Record the merge commit or PR when work is done

## Goal

A done initiative doesn't say which change implemented it, so going from the plan to the code means searching git history. Record it — the merge commit, or the PR — as FORMAT.md's open question asks. The catch it names: a commit can't contain its own SHA, so `complete` (which runs in the same commit as the code) can't write it directly; the merge commit could be recorded by a follow-up, or a PR URL used.

## Dependencies

_None._

## Related

- [25 Show where in-progress work is being built](done/25-show-where-in-progress-work-is-being-built.md) — records the branch while work is in progress; this records what landed

## Open questions

- What is recorded, and by whom? A PR URL passed to `complete` (`pr:`), known before merging; the merge commit, written by a follow-up after merging (e.g. a tool that finds the commit that introduced `status: done`); or either? Where does it show — front-matter, the README's Completed table (a column, initiatives#20), the Releases page?

## Acceptance criteria

_What must be true when this is done._
