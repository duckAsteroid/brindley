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
| `docs` | Globs of what counts as project documentation. |
| `types`, `tags` | Declared values; others are flagged as likely typos. |
| `statuses` | This collection's own status words, mapped to core statuses. |
| `ignore` | `.gitignore`-style patterns for numbered files that aren't initiatives. |

## Theme doc

```yaml
---
theme: notifications
summary: How captains hear about changes
---
```

Any non-numbered `.md` in a collection folder with `theme:` is that theme's overview.
