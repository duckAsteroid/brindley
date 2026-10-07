---
type: feature
status: draft
tags: [questions, adoption]
updated: 2026-10-07
---
# Resolve settled questions in bulk

## Goal

Adopted files often record settled decisions as plain bullets under `## Open questions` — in one collection 15 of 19 "open" questions on completed initiatives were already decided — so `validate`, `questions` and `next_question` report them as open. Brindley won't guess from wording (a "resolved" preamble, struck-through text), consistent with initiatives#4; instead it makes tidying them cheap: `resolve_question` settles several questions, or all of an initiative's, in one call; the `open-questions` finding lists the bullets with their indexes so they can be passed straight in; and the docs say that `remove` mode renumbers the remaining questions while `tick` keeps indexes, so `match` is the safe selector.

## Dependencies

_None._

## Related

- [GitHub #6](https://github.com/duckAsteroid/brindley/issues/6) — the request this came from
- [11 batch_update tool](11-batch-status-backfill-tool.md) — the other bulk tidy-up tool, for front-matter fields

## Open questions

- What does a bulk resolve take as answers? One shared answer for all (e.g. "settled before adoption — see the bullet text"), one per question, or none — in `tick` mode the bullet text already is the decision, so the answer could be optional? And in `remove` mode, does each bullet move to `## Decisions` as written?

## Acceptance criteria

_What must be true when this is done._
