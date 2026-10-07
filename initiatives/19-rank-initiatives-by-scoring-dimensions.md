---
type: feature
status: designed
updated: 2026-10-07
---
# Scoring dimensions on initiatives

## Goal

Nothing in Brindley records how important, valuable or hard an initiative is: there is no field for priority, impact or complexity (unknown front-matter fields are ignored, not read), and `list` orders by number. Let initiatives carry scoring dimensions in front-matter — sensible defaults such as `priority`, `impact` and `complexity`, plus any a collection declares — validate them, and let `list` filter and order by them. Computed scores such as WSJF, and using a ranking elsewhere, follow in initiatives#21.

## Dependencies

_None._

## Decisions

- Both: Brindley ships sensible default dimensions, and a collection README can declare its own fields in front-matter (like `tags:` and `statuses:`) and override the defaults — a declared field with a default's name replaces it. Every dimension is optional by default; the README declaration can make one required, and `validate` then flags initiatives without a value.
- Each dimension's permitted values are a declared set, listed in ranking order from highest to lowest: the first value ranks first (e.g. `priority: [critical, high, medium, low]`). A value outside the set is a `validate` finding.
- The `list` MCP tool filters and orders by dimensions. Filtering takes a set of permitted values per field, e.g. `where: { priority: [critical, high], complexity: [low] }`, combined with the existing filters (status, tag, owner, type, ready). Ordering takes a list of fields, e.g. `order_by: [priority, impact]`, sorting by each field's declared order (first value first), later fields breaking ties, then by number. Initiatives without a value sort last, or at their dimension's `default` (below).
- Moved out: computed scores (WSJF or otherwise) and using a ranking elsewhere — ordering `ready` results, "next to pick up" suggestions — belong to initiatives#21, which depends on this one. Here, ranking is `list`'s `order_by` over dimensions, and the README keeps number order (initiatives#20).
- Missing values sort last by default, per field: with `order_by: [priority, impact]`, an initiative with a priority but no impact sorts after the others at the same priority. A dimension's declaration can name a `default` (one of its values, e.g. `priority: { values: [critical, high, medium, low], default: medium }`), which an initiative without a value is treated as having — for ordering, `where` filtering and README columns — without being written to its file, so changing the default changes every unset initiative at once. A required dimension is still flagged by `validate` when unset; its default only decides where it sorts meanwhile. Values are set through `update`, which accepts any declared dimension and checks the value against its set; `batch_update` (initiatives#11) accepts whatever `update` does, so it gets them for free.
- Not now: a collection can replace a default dimension but not remove one. An unused optional default does no harm — it appears only when an initiative sets it, and `validate` only checks it if required. If being offered as a column (initiatives#20) or accepted by `update` proves a nuisance, add `<name>: false` under `dimensions:` later.

## Open questions

_None._

## Acceptance criteria

- Brindley ships default dimensions, all optional: `priority: [critical, high, medium, low]`, `impact: [high, medium, low]`, `complexity: [low, medium, high]` (listed first-ranks-first, so simpler work ranks ahead).
- A collection README declares dimensions under `dimensions:`, each with `values` (an ordered set of strings or numbers, first ranks first), and optionally `required: true` and `default: <one of its values>`. Declaring a default's name replaces that default.
- An initiative stores a dimension as a plain front-matter field (`priority: high`). `get` and `list` return each declared dimension's value, marking whether it was set or taken from the `default`.
- `validate` reports: a value outside the dimension's set; a required dimension left unset (even when it has a default); a declaration whose `default` isn't one of its values, or with an empty or duplicated `values` list.
- `update` accepts any declared dimension and refuses a value outside its set; `batch_update` (initiatives#11) accepts them through the same path.
- `list` takes `where` — permitted values per dimension, e.g. `{ priority: [critical, high] }` — combined with its existing filters, and `order_by` — a list of dimensions, sorting by declared order, later fields breaking ties, then by number. An unset value counts as the dimension's `default` if it has one, else sorts last.
- Both work across collections that declare a dimension differently, using each initiative's own collection's declaration.
- FORMAT §4 documents the dimension fields and §2 the `dimensions:` declaration; FORMAT §10, MCP-SERVER.md and the site's front-matter, validation and MCP references are updated. Tests cover defaults, a declared and an overriding dimension, numeric values, `required`, `default`, every new finding, `update` refusals, and `where`/`order_by` including unset values and ties.
