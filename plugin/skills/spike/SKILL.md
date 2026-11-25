---
name: spike
description: Run a Brindley spike (an initiative with type spike) — build just enough to measure what its Measures section asks, record the Findings, and keep the code on its own branch. Use when the user asks to run or start a spike.
argument-hint: <collection#n>
allowed-tools: mcp__plugin_brindley_core__brief
---

Call the Brindley `brief` tool (`mcp__plugin_brindley_core__brief`) with `workflow: "spike"` and `ref: "$ARGUMENTS"`, then follow the brief it returns: its readiness check first, and stop if it fails. If no spike was named, ask which one (`list` with `type: spike` shows them).

In Claude Code:

- If you work in a git worktree, including one made with `EnterWorktree` or `claude --worktree`, pass its path as `worktree` on every Brindley call, reads included. While other worktrees exist, Brindley refuses writes without `worktree` (`"."` is the main checkout).
- Leave the spike's branch in place when you finish; it may become the basis of the real implementation.
