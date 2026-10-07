---
type: feature
status: done
updated: 2026-10-07
docs_impact:
  - MCP-SERVER.md
  - site/reference/mcp.md
  - site/guide/workflow.md
---
# Work on the worktree the agent is implementing in

## Goal

The server works on the git checkout it was started in (MCP-SERVER.md §2), usually the main checkout. An implementing agent that creates a git worktree and builds there gets its `update`, `set_status`, `resolve_question` and `complete` calls applied to the main checkout's copy of the initiative — so the initiative edits miss the worktree commit the `implement` prompt says they belong in, and `complete`'s `docs_impact` check looks for docs in the wrong place (GitHub #2; only its error message was fixed). Add a `use_worktree` tool that switches the server, for the rest of the session, to another worktree of the same repository; have every tool result state which checkout it worked on; and have the `implement` prompt tell an agent that works in a worktree to call it first.

## Dependencies

_None._

## Related

- [GitHub #2](https://github.com/duckAsteroid/brindley/issues/2) — the bug report where this surfaced
- [10 Name the base folder in path errors](10-name-the-base-folder-in-path-errors.md) — makes path errors say which checkout they looked in

## Decisions

- Switching back: `use_worktree()` with no argument returns the server to the checkout it was started in; passing that checkout's path does the same. Every `use_worktree` call returns the checkout now in use.
- If the current worktree has been removed (`git worktree remove` after merging), the next call is refused rather than silently falling back — e.g. "the worktree ../brindley-wt-18 no longer exists; call `use_worktree()` to return to /…/brindley, or name another worktree" — since a silent fallback would write to the wrong checkout, the bug this initiative fixes.
- The switch lasts only for the server process, i.e. the client session: a new session starts on the original checkout.
- The `implement` prompt describes the sequence for worktree-based workflows: create the worktree, `use_worktree("<path>")`; build and `complete`, so the initiative edits land in the worktree's commit; after merging, `use_worktree()` before removing the worktree.
- A `use_worktree` switch held by the server, and no per-call `worktree` parameter. The switch lives in the server process, and each client session starts its own server, so agents in different sessions never share it. A per-call path would have to be passed to every tool, and forgetting it once would silently write to the main checkout — the bug this initiative fixes. Every result names the checkout it worked on.
- No automatic following: MCP workspace roots aren't used. A session's roots are normally the checkout it started in and don't change when an agent moves into a worktree, and switching on them would be the unasked-for checkout change this initiative avoids. Switching is explicit (`use_worktree`), prompted by the `implement` brief. A server started inside a worktree already works there (the nearest git root of its start directory).
- Implementation: the server keeps the checkout in use (src/server.ts); `use_worktree` is registered outside the usual tool wrapper so it still works after the current worktree is removed, when every other call is refused. Each result's checkout is a second text item after the JSON (`Checkout: …`), so clients that parse the first item are unaffected. Prompts and resources follow the switch too.

## Open questions

_None._

## Acceptance criteria

- A `use_worktree` MCP tool takes a path to another worktree of the same repository (`git worktree list`) and switches the server to it for the rest of its process: every later tool call reads and writes that checkout. It refuses a path that isn't a worktree of this repository.
- `use_worktree()` with no argument, or with the original checkout's path, switches back. Every call returns the checkout now in use.
- Every tool result names the checkout it worked on.
- If the current worktree has been removed, the next tool call is refused with a message naming the missing worktree and saying to call `use_worktree()` to return, or to name another — never a silent fallback.
- A new server process starts on the checkout it was started in; nothing persists between sessions. No per-call `worktree` parameter, and MCP roots aren't used.
- The `implement` prompt describes the sequence for worktree workflows: create the worktree and `use_worktree("<path>")`; build and `complete`; after merging, `use_worktree()` before removing the worktree.
- MCP-SERVER.md (runtime, §2, and the tool table) and the site's MCP reference and workflow guide describe it. Tests cover switching, writing to the worktree, switching back, refusing a non-worktree path, and a removed worktree.
