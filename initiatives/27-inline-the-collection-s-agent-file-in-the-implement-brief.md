---
type: feature
status: draft
updated: 2026-10-07
---
# Inline the collection's agent file in the implement brief

## Goal

A collection's `agent:` field points at the repo's own implementing-agent instructions (worktrees, build commands, verification). The `implement` prompt only tells the agent to read that file, which it may skip or read late; inlining it would put the repo's rules in the brief itself, at the cost of a longer prompt and a copy that is only as fresh as the call. Decide which, as MCP-SERVER.md's open question asks.

## Dependencies

_None._

## Open questions

- Inline the `agent:` file always, only when it is short (and link it otherwise), or keep linking it and make the brief insist it is read first? Agent files can be long (the one in GitHub #7's repo was ~180 lines).

## Acceptance criteria

_What must be true when this is done._
