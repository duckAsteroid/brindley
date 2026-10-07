---
type: feature
status: draft
updated: 2026-10-07
---
# Rank initiatives by scoring dimensions

## Goal

Nothing in Brindley says which ready initiative to do first: `list` and the README order by number, and there is no field for priority, value or effort (unknown front-matter fields are ignored, not read). Let initiatives carry scoring dimensions in front-matter — e.g. `priority`, `impact`, `complexity` — and let Brindley rank by them: sort and filter `list`, order the README's Active table, and suggest what to pick up next. Done well this can support a weighted model such as WSJF (https://framework.scaledagile.com/wsjf): cost of delay — user/business value + time criticality + risk reduction/opportunity enablement — divided by job size, each scored on a relative scale. Any score is derived from the stored dimensions and never stored itself, so it can't go stale, and the generated README stays deterministic (FORMAT §8).

## Dependencies

_None._

## Open questions

- Built-in dimensions or declared ones? A fixed set (`priority`, `impact`, `complexity`) is simple and the same in every repo; dimensions declared in the collection README's front-matter — like `tags:` and `statuses:` — let one team use WSJF's four inputs and another just `priority`, at the cost of a little configuration.
- What scale does a dimension use: words (`low` / `medium` / `high`), plain numbers, or a relative sequence like WSJF's modified Fibonacci (1, 2, 3, 5, 8, 13, 20)? Fixed per dimension, or declared alongside it? `validate` would flag values off the scale.
- How is a ranking computed: sort by a single dimension, a built-in WSJF formula when its inputs are present, or a formula the collection declares? And where does it show — a score column in the README's Active table, `list` sorting (`sort: "wsjf"`), ordering of `ready` results, and a "what next" suggestion in prompts?
- How do initiatives without scores rank — last, first, or flagged by `validate` once a collection uses dimensions? And can scores be set in bulk (`batch_update`, initiatives#11) as well as one at a time with `update`?

## Acceptance criteria

_What must be true when this is done._
