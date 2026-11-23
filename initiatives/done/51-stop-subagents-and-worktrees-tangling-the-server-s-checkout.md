---
type: bug
status: done
updated: 2026-11-23
docs_impact:
  - MCP-SERVER.md
  - site/reference/mcp.md
  - site/reference/validation.md
  - site/guide/workflow.md
  - site/guide/getting-started.md
---
# Stop subagents and worktrees tangling the server's checkout

## Goal

Initiative 18 gave the server a single checkout switch (`use_worktree`), on the premise that each client session starts its own server. Subagents don't: in Claude Code a session and the subagents it spawns share one MCP server process. So one agent's `use_worktree` moved every other agent — the parent's `create` landed on a feature branch, two parallel implementers wrote into each other's worktrees, and a forgotten switch-back stranded the session in a worktree that was later removed. A second registration of the server (the repo's `.mcp.json` beside the plugin's) had its own switch, adding to the confusion. The `Checkout:` line and a post-write warning only reported a misplaced write after it had happened.

Each call now names its own checkout, the server holds no switch, and a write that doesn't say where it's going is refused while other worktrees exist.

## Dependencies

_None._

## Related

- [18 Work on the worktree the agent is implementing in](18-work-on-the-worktree-the-agent-is-implementing-in.md) — introduced the shared switch replaced here
- [25 Show where in-progress work is being built](25-show-where-in-progress-work-is-being-built.md)

## Decisions

- **Q1** Every tool takes an optional `worktree` argument: the path of a live worktree of this repository, absolute or relative to the checkout the server started in, checked against `git worktree list`; any other path is refused, listing the worktrees that exist. Omitted, or `"."`, means the starting checkout. Paths only. MCP gives the server no per-caller identity (no agent ID; roots and `Mcp-Session-Id` are per connection, and a session and its subagents share one connection), so the target has to travel with each call; a path is what an agent already knows, survives server restarts and is readable in results.
- **Q2** `use_worktree` and the server-held switch behind it are removed (breaking: `feat!`). A removed worktree now affects only calls that name it.
- **Q3** While other live worktrees exist, a write without `worktree` is refused; with none, writes work without it. Reads are never refused. The refusal lists each other worktree with its branch, marks one whose branch is contained in the starting checkout's `HEAD` and has no uncommitted changes as removable if finished (`git worktree remove`), names worktrees whose folder is gone as prunable (`git worktree prune`) — they don't trigger the refusal — and says how to pass `worktree`, including `"."`.
- **Q4** No code change for double registration: with no switch, two servers can't misdirect writes. This repo's root `.mcp.json` is removed, and the getting-started guide says a repo using the plugin doesn't register Brindley itself.
- **Q5** The server instructions, the `implement` brief, the plugin's implement and spike skills and the implementer agent tell an agent in a worktree to pass `worktree` on every call, reads included (the server doesn't enforce it on reads, but the main checkout's copy is stale), that `"."` is the starting checkout, and to remove the worktree once merged. While other worktrees exist, every result's JSON carries `worktree` — the checkout used, `"."` or its path relative to the starting checkout; otherwise it is absent. The `Checkout:` line stays.
- **(implementation)** What counts as a write: any tool not marked read-only, unless the call is a dry run (`dry_run`, honouring each tool's default; `regenerate_readmes` with `check`). `report` writes its HTML file, so it is a write. `version` takes no `worktree` (it reads no checkout).
- **(implementation)** A result that isn't a JSON object (e.g. `list`'s array) is wrapped as `{ result, worktree }` when `worktree` is added — the same wrapping already used for `notes`. `brief`, which returns Markdown, adds a `Worktree:` line instead. Resources and prompts read the starting checkout.
- **(implementation)** "Finished" can't be told from "not started": a fresh worktree whose branch has no commits of its own and no edits is also contained in `HEAD`, so the refusal words it as "if its work is finished, remove it" rather than asserting it is.

## Open questions

_None._

## Acceptance criteria

- Every tool takes an optional `worktree` argument: a path, absolute or relative to the checkout the server started in, that must name a live worktree of the repository (`git worktree list`); any other path is refused, listing the worktrees that exist. Omitted, or `"."`, means the starting checkout.
- `use_worktree` and the server-held checkout switch are gone; no call changes which checkout another call reads or writes.
- While other live worktrees exist, a write without `worktree` is refused. The message lists each other worktree with its branch, marks those whose branch is merged into the starting checkout's branch as removable (`git worktree remove <path>`), names those whose folder is gone as prunable (`git worktree prune`), and says how to pass `worktree` (including `"."`). Worktrees whose folder is gone don't trigger the refusal. With no other worktrees, writes work without `worktree`.
- Reads are never refused. While other worktrees exist, every result (read or write) has a `worktree` field in its JSON naming the checkout used (`"."` or the worktree's path relative to the starting checkout); otherwise the field is absent. The `Checkout:` line stays.
- A removed worktree affects only calls that target it.
- Tests cover: two worktrees and the starting checkout written to in interleaved calls on one server, each write landing where its `worktree` says; refusing a non-worktree path; refusing a write without `worktree` while worktrees exist, with the removable/prunable listing; writes without `worktree` when none exist; the `worktree` field on reads and writes.
- The server instructions, the `implement` brief, plugin/skills/implement/SKILL.md and plugin/agents/implementer.md tell agents in a worktree to pass `worktree` on every call, reads included, that `"."` is the starting checkout, and to remove their worktree once merged; none mention `use_worktree`.
- This repo has no root `.mcp.json`; the getting-started guide says a repo using the plugin should not also register Brindley itself.
- MCP-SERVER.md (runtime, §2, tool table) and the site's MCP reference and workflow guide describe the `worktree` argument, the refusal and the `worktree` result field.

## Appendix: Rejected alternatives

- **A handle returned by `use_worktree`** — every call would still pass it, like a path, but it is opaque, can't be checked against `git worktree list` and dies with the server process.
- **Inferring the checkout from paths** — most calls take refs (`initiatives#49`) that carry no path.
- **Keeping the switch but refusing writes when several callers share it** — the server can't count callers.
- **MCP roots** — per connection, so a session and its subagents share one list; they can't say which worktree a given call is for.
- **An agent ID in `_meta`** — not in the protocol; at most an undocumented client detail, and it still wouldn't say which worktree the agent is in.
- **Branch names, folder-name shorthand or server-issued short tokens** as `worktree` values — extra resolution rules or server state for a saving of a few tokens per call.
- **Refusing only when the initiative is in progress elsewhere** — misses a forgetful implementer: its first `set_status(…, in-progress)` has nothing elsewhere to match, and afterwards the initiative is in progress in the main checkout, which `inProgressElsewhere` skips.
- **Keeping the post-write warning** — it reports a misplaced write after it has happened, in a trailing text item agents tend to ignore.
