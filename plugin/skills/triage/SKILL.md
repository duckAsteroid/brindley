---
name: triage
description: Review the Brindley initiatives (tickets, issues) — stale drafts, unresolved questions, blocked chains, unconfirmed external dependencies — and suggest what to pick next. Use when the user asks what to work on, what is blocked or for a planning review.
argument-hint: "[collection]"
allowed-tools: mcp__plugin_brindley_brindley__brief
---

Call the Brindley `brief` tool (`mcp__plugin_brindley_brindley__brief`) with `workflow: "triage"`, and `collection: "$ARGUMENTS"` if a collection was named, then report as the brief it returns says.

In Claude Code:

- Discuss the findings in your reply text, not with the `AskUserQuestion` tool, and change nothing until the user asks.
