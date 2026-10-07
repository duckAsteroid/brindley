---
type: feature
status: draft
updated: 2026-10-07
---
# Write and keep the agent rules in AGENTS.md / CLAUDE.md

## Goal

`create_collection` returns the agent-rules snippet (FORMAT §9) for a repo's `AGENTS.md` / `CLAUDE.md` but doesn't write it, so it is pasted by hand — and goes stale when the rules change, as they did in 1.1.1 (stop and ask on an unsettled decision mid-build), leaving existing repos with old rules. Let Brindley write the snippet, as a marked block it can find again, and keep it current: refresh it when the rules change, and have `validate` notice a stale copy.

## Dependencies

_None._

## Open questions

- Which file and when: `AGENTS.md`, `CLAUDE.md`, or whichever exists (both if both)? Written by `create_collection` by default, or only when asked? And how is a stale copy recognised — a version in the block's marker (`<!-- brindley:agent-rules v2.0 -->`) compared by `validate`, with a tool (or `readmes`) to refresh it?

## Acceptance criteria

_What must be true when this is done._
