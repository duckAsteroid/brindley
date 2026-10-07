---
type: feature
status: done
updated: 2026-10-07
docs_impact:
  - FORMAT.md
  - site/reference/front-matter.md
  - site/reference/validation.md
---
# Configurable columns in the generated README tables

## Goal

The collection README's tables have fixed columns — Active: # | Initiative | Type | Status | Ready / blocked by | Open Qs | Owner; Completed: # | Initiative | Type | Updated (src/readme.ts:129, :147). Once initiatives carry scoring dimensions (initiatives#19), readers should see them there. Let the collection README's front-matter choose which columns each table shows and in what order — the built-in ones plus any dimension or computed score — with today's columns as the default. Rows keep their current order; sorting and filtered views are out of scope, and interactive sorting is left to the tools (`list`).

## Dependencies

- [19 Scoring dimensions on initiatives](19-rank-initiatives-by-scoring-dimensions.md) — the dimensions these columns would show

## Related

- [12 Themes overview and tag cloud in the collection README](12-themes-overview-and-tag-cloud-in-the-collection-readme.md) — another front-matter-controlled section of the generated README
- [14 README front-matter controls what the dependency graph shows](14-readme-front-matter-controls-what-the-dependency-graph-shows.md) — the graph setting and this columns setting should look alike in front-matter
- [21 Computed scores such as WSJF](../21-computed-scores-such-as-wsjf.md) — computed scores can be columns too, once they exist

## Decisions

- Descoped: no extra pre-sorted or filtered views. The README keeps one table per section, in number order; what changes is which columns it shows, chosen in front-matter.
- Out of scope: no interactive table on the docs site. Sorting and filtering stay with the tools (`list`).
- `columns:` in the collection README holds one ordered list per table — `active` and `completed`, the README's two tables — each replacing that table's defaults, so columns can be dropped and reordered as well as added: e.g. `columns: { active: [number, title, status, ready, priority, impact, owner], completed: [number, title, updated] }`. Allowed: the built-ins (`number`, `title`, `type`, `status`, `ready`, `questions`, `owner`, `tags`, `updated`), any declared dimension (initiatives#19), and any score once initiatives#21 exists. No arbitrary front-matter fields: an unknown name is a `validate` warning and is left out, as with `graph:` settings. Headers are fixed per column (`Ready / blocked by`, `Priority`, …). A table not listed keeps its defaults.

## Open questions

_None._

## Acceptance criteria

- A collection README's `columns:` takes `active` and/or `completed`, each an ordered list of column keys that replaces that table's defaults; a table not listed keeps today's columns.
- Built-in keys and their headers: `number` (#), `title` (Initiative), `type` (Type), `status` (Status, with its status note), `ready` (Ready / blocked by), `questions` (Open Qs), `owner` (Owner), `tags` (Tags), `updated` (Updated).
- A declared scoring dimension (initiatives#19) can be a column, headed with its name capitalised, showing the initiative's value — or its dimension's default, in italics, when unset — or `—`.
- `validate` warns (`readme-columns`) about an unknown table name, an unknown column key, or a value that isn't a list; unknown columns are left out of the table.
- Output stays deterministic (FORMAT §8).
- FORMAT §8.1 and the site's front-matter reference describe the setting. Tests cover reordering and dropping columns, a dimension column with set, defaulted and unset values, an untouched table, and the warnings.
