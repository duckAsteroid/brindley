---
type: bug
status: designed
updated: 2026-11-23
---
# Stop subagents and worktrees tangling the server's checkout

## Goal

Initiative 18 made the server's checkout a single mutable switch (`let checkout` in `createServer`, src/server.ts:331), flipped by `use_worktree` (src/server.ts:411). Its design rested on the premise that "each client session starts its own server, so agents in different sessions never share it". That premise is false for subagents: in Claude Code, subagents spawned by a session (e.g. `brindley:implementer`, or several run in parallel) talk to the **parent's** MCP server process. So:

- A subagent that calls `use_worktree("<its worktree>")` silently moves the parent session — and every sibling subagent — onto that worktree. The parent's next `create`, `update` or `set_status` lands on a feature branch it isn't working on.
- Two parallel implementers in two worktrees each switch the one shared server; whichever called last wins, and the other's `set_status` / `resolve_question` / `complete` writes go into the wrong worktree (and that branch's commit).
- A subagent that finishes and calls `use_worktree()` to switch back drags everyone else back to main mid-work; one that forgets (or crashes) leaves the parent stranded in a worktree, and once that worktree is removed every call is refused (src/server.ts:335) until someone notices.
- Two Brindley servers are registered in this repo — the project's `.mcp.json` (`brindley@latest`) and the plugin's (`plugin/.mcp.json`, `brindley@4.0.0 serve --cwd ${CLAUDE_PROJECT_DIR}`) — each with its own independent switch, so a `use_worktree` on one does nothing to the other, and which one an agent reaches for is arbitrary.

The `Checkout: …` line on every result (src/server.ts:361) and the "written to where this server started, but other worktrees exist" warning (src/server.ts:392) tell an agent after the fact; they don't stop the wrong write, and agents routinely ignore a trailing text item.

Make it impossible (or at least loud and refused) for a write to land in a checkout the caller didn't mean, when several agents share one server across several worktrees.

## Dependencies

_None._

## Related

- [18 Work on the worktree the agent is implementing in](done/18-work-on-the-worktree-the-agent-is-implementing-in.md) — introduced the shared switch this fixes; its "no per-call `worktree` parameter" and "no MCP roots" decisions are up for revisiting here
- [25 Show where in-progress work is being built](done/25-show-where-in-progress-work-is-being-built.md)

## Decisions

- **Q1** Every tool takes an optional `worktree` argument: the path of a live worktree of this repository, absolute or relative to the checkout the server started in. It is checked against `git worktree list` (`worktrees()`, src/git.ts:36); a path that isn't a live worktree is refused, listing the worktrees that exist. Omitted, the call works on the checkout the server started in (normally the main repo — the plugin starts it with `--cwd ${CLAUDE_PROJECT_DIR}`); passing that checkout's path names it explicitly. Each call resolves its own target, so no call changes where another goes; each result still names the checkout it used (`Checkout: …`). Paths only — no branch names, folder-name shorthand or server-issued tokens. Reason: MCP gives the server no per-caller identity (no agent ID; roots and `Mcp-Session-Id` are per connection, and the parent and its subagents share one connection), so the target has to travel with each call, and a path is what an agent already knows, survives server restarts and is readable in results.
- **Q2** `use_worktree` is removed, along with the server-held switch behind it (`let checkout`, src/server.ts:331) and the removed-worktree refusal that only existed because of it (src/server.ts:335). A shared switch is the bug: any caller flipping it moves every other caller sharing the server. The per-call `worktree` argument (Q1) replaces it entirely. Removing a tool is a breaking change (`feat!`, major version).
- **Q3** While other live worktrees exist, every write without `worktree` is refused; with none, writes work without it as today. `worktree: "."` names the checkout the server started in (relative paths resolve against it, Q1), so the parent passes that while implementers run. Reads are never refused; they keep the `Checkout:` line and the note naming other worktrees (src/server.ts:365). The refusal replaces the after-the-fact warning (src/server.ts:392). A narrower rule — refuse only when the initiative is in progress elsewhere (`inProgressElsewhere`, src/elsewhere.ts) — misses a forgetful implementer entirely: its first `set_status(…, in-progress)` has nothing elsewhere to match, and afterwards the initiative is in progress in the main checkout, which `inProgressElsewhere` skips. The refusal is explicit and nudges cleanup: it lists each other worktree with its branch, marks those whose branch is already merged into the starting checkout's branch as removable (`git worktree remove <path>`), names worktrees whose folder is gone as prunable (`git worktree prune`), and says how to pass `worktree` (including `"."`). Worktrees whose folder is gone don't count towards the refusal — they can't be written to — but are still named for pruning.
- **Q4** With Q1–Q3 no server holds a switch, so two registrations can no longer misdirect writes; what remains is duplicated tools, possibly at different versions. The server can't detect a double registration, so there is no code change. This repo's root `.mcp.json` (`brindley@latest`) is removed — the plugin provides the server. The getting-started guide's plugin install says that a repo using the plugin should not also register Brindley in its own `.mcp.json` (or with `claude mcp add`).
- **Q5** The server instructions (src/server.ts:56), the `implement` brief (src/server.ts:273), plugin/skills/implement/SKILL.md:12 and plugin/agents/implementer.md:9 say, each in its own words: if you work in a git worktree, pass its path as `worktree` on every Brindley call, reads included, so you see and edit that branch's copy; while other worktrees exist, writes without `worktree` are refused, and `"."` is the checkout the server started in; when you finish, remove your worktree once merged, since a leftover worktree makes every agent's writes need `worktree`. No switch-back step. They ask for `worktree` on reads although the server doesn't enforce it (Q3): an implementer reading the main checkout's copy sees stale status and questions. implementing.agent.md doesn't mention `use_worktree` and is unchanged. Results say which checkout they used inside the JSON itself, not only in the trailing `Checkout:` text item: while other worktrees exist, every result — reads and writes — carries a `worktree` field with the checkout used, as given or defaulted (`"."` for the starting checkout, else the worktree's path relative to it). With no other worktrees the field is omitted and the `Checkout:` line is unchanged.

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
