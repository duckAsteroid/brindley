# Front-matter

## Initiative

```yaml
---
type: feature
status: designed
status_note: waiting on the sensor vendor
tags: [notifications]
owner: locks/core
docs: ["services/locks/docs/LOCKS.md"]
updated: 2026-10-06
---
# Lock sensor CSV import
```

| Field | Notes |
|-------|-------|
| `status` | Required. See [Statuses](/reference/statuses). Without it, a file in a status folder takes the folder's status. |
| `type` | `feature`, `bug`, `refactor`, `perf`, `docs`, `chore`, `spike` — or your own words. `raconiter` means spike. |
| `status_note` | A one-line qualifier shown beside the status. |
| `tags` | Themes, lowercase kebab-case. |
| `owner` | Owning team, module or person. |
| `docs` | Project docs this initiative is expected to change. |
| `docs_impact` | Set on completion: the docs changed, or `none: <reason>`. |
| `superseded_by` | Required when `status: superseded` — a reference like `sb#30`. |
| `updated` | ISO date, maintained by the tools. |
| `priority`, `impact`, `complexity`, … | [Scoring dimensions](#scoring-dimensions). |

The title is the H1. Dependencies are links under `## Dependencies`, not front-matter.

## Collection README

```yaml
---
brindley: 1
name: slot-booking
aliases: [locks]
title: LOCK-42 lock slot booking
summary: Let captains book ascending and descending lock slots online
status: active
owner: locks team
link: https://tracker.example.com/LOCK-42
agent: .github/agents/slot-booking.agent.md
docs: ["services/locks/docs/*.md"]
types: [feature, bug, refactor, perf, docs, chore, spike]
tags:
  notifications: Telling captains about changes to their slots
statuses:
  spiked: designed
ignore:
  - "*-rationale.md"
dimensions:
  priority: { values: [now, soon, later], default: soon, required: true }
  job_size: [1, 2, 3, 5, 8, 13]
---
```

| Field | Notes |
|-------|-------|
| `brindley` | Required: marks the folder as a collection. |
| `name` | Name used in references; defaults to the folder name. |
| `aliases` | Extra short names for references. |
| `title`, `summary`, `owner`, `link` | Descriptive. |
| `status` | `active`, `done` or `abandoned` — the changeset as a whole. |
| `agent` | Your repo's implementing-agent instructions; the implement brief points to them. |
| `docs` | Globs of what counts as project documentation, in order; `!` excludes (`["site/**/*.md", "!site/releases.md"]`), and the last match wins. |
| `types`, `tags` | Declared values; others are flagged as likely typos. |
| `statuses` | This collection's own status words, mapped to core statuses. |
| `ignore` | `.gitignore`-style patterns for numbered files that aren't initiatives. |
| `dimensions` | This collection's [scoring dimensions](#scoring-dimensions). |
| `graph` | What the README's dependency graph shows — see [Graph settings](#graph-settings). |
| `columns` | The README tables' columns: `active` and/or `completed`, each an ordered list replacing that table's defaults — from `number`, `title`, `type`, `status`, `ready`, `questions`, `owner`, `tags`, `updated` and the collection's scoring dimensions. |

## Graph settings

The README's dependency graph has do-first work on the left, each edge pointing from an initiative
to what it depends on, and only blocking dependencies drawn. A collection changes that under
`graph:`:

```yaml
graph:
  direction: left-to-right   # where the do-first work goes: left-to-right, right-to-left, top-to-bottom, bottom-to-top
  arrows: from               # from: edges point at what an initiative needs; to: the reverse ("Y unblocks X")
  related: true              # also draw ## Related links, dotted (default: false)
  show: [done]               # also include initiatives in these statuses (default: none)
  external: false            # leave out external dependencies and other collections' work (default: true)
  themes: [box, icon]        # box: group by first theme; icon or label: mark each node's themes (default: off)
  enabled: true              # false: no graph in this README (default: true)
```

A theme's icon comes from `icon:` in its [theme doc](#theme-doc); a theme without one shows as
`[name]`. The settings also apply to the `graph` tool for this collection, which can override each
one. Unknown settings and unusable values are `graph-setting` warnings.

## Scoring dimensions

Scoring dimensions say how important, valuable or hard an initiative is. Each is an ordinary
front-matter field (`priority: high`) whose value comes from an ordered set, first value ranking
first. Every collection has three, all optional:

| Dimension | Values, first ranks first |
|-----------|---------------------------|
| `priority` | `critical`, `high`, `medium`, `low` |
| `impact` | `high`, `medium`, `low` |
| `complexity` | `low`, `medium`, `high` (simpler work ranks ahead) |

A collection README adds its own, or replaces a default by using its name, under `dimensions:`:
`values` (strings or numbers, in ranking order), and optionally `required: true` and a `default`
that unset initiatives are treated as having. A bare list is shorthand for `values`. Set values
with `update`'s `dimensions`; filter and order with `list`'s `where` and `order_by`.

## Theme doc

```yaml
---
theme: notifications
summary: How captains hear about changes
icon: 🔔
---
```

Any non-numbered `.md` in a collection folder with `theme:` is that theme's overview. Its optional
`icon` marks the theme's initiatives in graphs that set `themes: icon`.
