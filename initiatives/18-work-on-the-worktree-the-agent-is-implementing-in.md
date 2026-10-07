---
type: feature
status: draft
updated: 2026-10-07
---
# Work on the worktree the agent is implementing in

## Goal

The server works on the git checkout it was started in (MCP-SERVER.md §2), usually the main checkout. An implementing agent that creates a git worktree and builds there gets its `update`, `set_status`, `resolve_question` and `complete` calls applied to the main checkout's copy of the initiative — so the initiative edits miss the worktree commit the `implement` prompt says they belong in, and `complete`'s `docs_impact` check looks for docs in the wrong place (GitHub #2; only its error message was fixed). Add a `use_worktree` tool that switches the server, for the rest of the session, to another worktree of the same repository; have every tool result state which checkout it worked on; and have the `implement` prompt tell an agent that works in a worktree to call it first.

## Dependencies

_None._

## Related

- [GitHub #2](https://github.com/duckAsteroid/brindley/issues/2) — the bug report where this surfaced
- [10 Name the base folder in path errors](10-name-the-base-folder-in-path-errors.md) — makes path errors say which checkout they looked in

## Open questions

- Is a `use_worktree` switch (session state on the server) right, or should each tool take an optional `worktree` path instead? A switch is one call and can't be forgotten on a later call, but it is hidden state: a second agent sharing the same server would be switched too.
- Can the server follow the agent without being told? MCP clients can report their workspace "roots", but an agent that `cd`s into a worktree mid-session doesn't change them. Worth using roots when they point inside a worktree, with `use_worktree` as the explicit fallback?

## Acceptance criteria

_What must be true when this is done._
