---
type: feature
status: draft
tags: [questions]
updated: 2026-10-07
---
# Show in-progress work blocked on an open question

## Goal

An implementer who hits a load-bearing decision mid-build should halt, record it, and not build past a guess. Brindley already supports this: a blocking question added to an `in-progress` initiative keeps it `in-progress` (design is not reopened — only a `designed` one goes back to draft), fails the "Open questions" check in `check_ready` and the `implement` preflight, and is settled with `resolve_question`. What's missing is that nobody can see it or knows to do it. Show a derived "blocked on question N" state for in-progress initiatives with unresolved blocking questions — in the README's "Ready / blocked by" column, `list`, `get` and the dependency graph — and document the pattern in the tool descriptions, prompts and site, distinguishing it from `(implementation)` questions, which stay as the non-blocking "implementer's judgement" kind. No new section and no new status word.

## Dependencies

_None._

## Related

- [GitHub #7](https://github.com/duckAsteroid/brindley/issues/7) — the request this came from

## Open questions

- How is "blocked" shown? Options: in the README's "Ready / blocked by" column (e.g. "⛔ question 2"), a separate `blocked` class/colour in the Mermaid graph, and a `blockedOnQuestions` field in `list`/`get`. All of them, or only some? And should a dependency that turns out to be unfinished mid-build (a blocker added after work started) show the same way?
- Should the `(implementation)` label be renamed to make its non-blocking meaning obvious (e.g. `(implementer's call)`), given the agent in GitHub #7 read it as "the kind of question for implementation time"? Renaming means still reading the old label in existing files.

## Acceptance criteria

_What must be true when this is done._
