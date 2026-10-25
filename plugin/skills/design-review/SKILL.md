---
name: design-review
description: Work through a Brindley initiative's (ticket's, issue's) open questions with the user, one at a time, grounded in the code, until it is design-complete. Use when the user wants to design, refine or settle the questions of an initiative.
argument-hint: <collection#n>
allowed-tools: mcp__plugin_brindley_brindley__brief
---

Call the Brindley `brief` tool (`mcp__plugin_brindley_brindley__brief`) with `workflow: "design-review"` and `ref: "$ARGUMENTS"`, then run the conversation exactly as the brief it returns says. If no initiative was named, ask which one (the `list` and `questions` tools show the candidates).

In Claude Code:

- Ask every question in your normal reply text. Never use the `AskUserQuestion` tool for these questions, even when it is available: the user needs to answer in their own words, push back and redirect.
- One question per reply; end the reply with the question.
