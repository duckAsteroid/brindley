---
type: feature
status: draft
updated: 2026-10-07
---
# Computed scores such as WSJF

## Goal

With scoring dimensions in place (initiatives#19), let a collection declare a score computed from them — first and foremost WSJF (https://framework.scaledagile.com/wsjf): cost of delay (user/business value + time criticality + risk reduction/opportunity enablement) divided by job size, each on a relative scale such as 1, 2, 3, 5, 8, 13, 20. A score is derived when read, never stored, so it can't go stale and generated READMEs stay deterministic; an initiative missing an input has no score. Scores can be used wherever a dimension can — `list`'s `order_by`, and as a README column (initiatives#20) — and give Brindley a ranking to use elsewhere: ordering `ready` results and suggesting the next initiative to pick up in prompts.

## Dependencies

- [19 Scoring dimensions on initiatives](19-rank-initiatives-by-scoring-dimensions.md) — scores are computed from the dimensions #19 adds

## Open questions

- WSJF only, or a general formula? Proposal: one built-in form, declared in the collection README, e.g. `scores: { wsjf: { cost_of_delay: [value, criticality, risk], job_size: job_size } }`, with the inputs being dimensions whose values are numbers — no formula language until someone needs one.
- Which ranking do `ready` results and the "next to pick up" suggestion use — the collection's first declared score, a ranking the collection names (e.g. `rank_by: [wsjf, priority]`), or number order unless the caller asks? And should the `implement` prompt suggest the next highest-ranked ready initiative when it finishes?

## Acceptance criteria

_What must be true when this is done._
