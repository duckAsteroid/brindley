---
type: feature
status: draft
updated: 2026-10-07
---
# Configurable columns in the generated README tables

## Goal

The collection README's tables have fixed columns — Active: # | Initiative | Type | Status | Ready / blocked by | Open Qs | Owner; Completed: # | Initiative | Type | Updated (src/readme.ts:129, :147). Once initiatives carry scoring dimensions (initiatives#19), readers should see them there. Let the collection README's front-matter choose which columns each table shows and in what order — the built-in ones plus any dimension or computed score — with today's columns as the default. Rows keep their current order; sorting and filtered views are out of scope, and interactive sorting is left to the tools (`list`).

## Dependencies

- [19 Scoring dimensions on initiatives](19-rank-initiatives-by-scoring-dimensions.md) — the dimensions these columns would show

## Related

- [12 Themes overview and tag cloud in the collection README](12-themes-overview-and-tag-cloud-in-the-collection-readme.md) — another front-matter-controlled section of the generated README
- [14 README front-matter controls what the dependency graph shows](14-readme-front-matter-controls-what-the-dependency-graph-shows.md) — the graph setting and this columns setting should look alike in front-matter
- [21 Computed scores such as WSJF](21-computed-scores-such-as-wsjf.md) — computed scores can be columns too, once they exist

## Decisions

- Descoped: no extra pre-sorted or filtered views. The README keeps one table per section, in number order; what changes is which columns it shows, chosen in front-matter.
- Out of scope: no interactive table on the docs site. Sorting and filtering stay with the tools (`list`).

## Open questions

- What does the setting look like? E.g. per table:
  ```yaml
  columns:
    active: [number, title, status, ready, priority, wsjf, owner]
    completed: [number, title, type, updated]
  ```
  — a list of column keys (built-ins plus #19's dimensions and scores), replacing the defaults. Or one list for all tables, or just "extra columns to add" on top of today's? Is a column for an arbitrary front-matter field allowed, or only built-ins and declared dimensions?

## Acceptance criteria

_What must be true when this is done._
