---
name: implement
description: Implement one Brindley initiative (ticket, issue) that is designed and ready, following its hand-off brief through to `complete`. Use when the user asks to implement, build or close a specific initiative.
argument-hint: <collection#n>
allowed-tools: mcp__plugin_brindley_brindley__brief
---

Call the Brindley `brief` tool (`mcp__plugin_brindley_brindley__brief`) with `workflow: "implement"` and `ref: "$ARGUMENTS"`, then follow the brief it returns: its readiness check first, and stop if it fails. If no initiative was named, ask which one (the `ready` tool lists what can start).

In Claude Code:

- If you work in a git worktree, including one made with `EnterWorktree` or `claude --worktree`, call Brindley's `use_worktree` with its path as soon as it exists, so the initiative edits land on that branch.
- To hand the work to a sub-agent instead, use the `brindley:implementer` agent with the initiative's reference.
- Ask the user about unsettled product, data or API choices in your reply text, not with the `AskUserQuestion` tool.
