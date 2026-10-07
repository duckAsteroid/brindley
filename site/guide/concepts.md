# Concepts

## Initiatives

The unit of work is an **initiative**. People and agents may call them **tickets** or
**issues** — Brindley treats the three words as the same thing.

An initiative is a Markdown file named `<number>-<slug>.md`:

```
docs/initiatives/LOCK-42/slot-booking/
  README.md                         ← marks the collection
  21-lock-sensor-import.md          ← initiative 21
  21-sensor-readings/               ← assets for 21 (fixtures, diagrams)
  22-opening-hours-change-impact.md
```

- The **number** is unique within its collection and never reused. Brindley picks the next one
  for you, checking other branches, worktrees and history so parallel work doesn't collide.
- The **filename never changes**. Retitle by editing the H1; the file stays put, so links to it
  never break.
- A sibling folder starting with the same number holds the initiative's **assets**.

## Collections

A **collection** is a folder marked by its README:

```yaml
---
brindley: 1
title: LOCK-42 lock slot booking
aliases: [locks]
---
```

Collections can live anywhere in the repo, and there is no repo-level file above them. Each has a
**name** (the folder name, or `name:`), and short **aliases** for references.

## Referring to initiatives

| You write | Means |
|-----------|-------|
| `22` | initiative 22, when it's unambiguous |
| `slot-booking#22` | 22 in the `slot-booking` collection |
| `sb#22` | the same, via the automatic alias — the initials of `slot-booking` |
| `locks#22` | the same, via an explicit alias |

Automatic aliases are the initials of a multi-word folder name (`lock-gate-maintenance` →
`lgm`) and apply only when no other collection uses the same short name. Matching ignores case.

Inside initiative files, references to other initiatives are ordinary relative Markdown links, so
they work in any viewer.

## Status

Status is the `status:` field in front-matter. The core statuses are **draft**, **designed**,
**in-progress**, **deferred**, **done**, **abandoned** and **superseded**; common words like
*proposed* or *completed* are understood too. See [Statuses](/reference/statuses).

## Dependencies

Dependencies are the links under an initiative's `## Dependencies` heading:

```markdown
## Dependencies

- [19 Boat identity](19-boat-identity.md) — readings are keyed by boat.
- Needs [LOCK-7](https://tracker.example.com/LOCK-7) upstream.
```

- A link to an **initiative** (any collection) is a dependency: it blocks until that initiative is done.
- An **http(s)** link is an external dependency: shown, but you confirm it yourself.
- Other links (design docs, code) are just links.

Non-blocking links ("relates to", "informed by") go under `## Related`. An initiative is
**ready** when it is designed and every linked initiative is done.

## Open questions

Undecided points are list items under `## Open questions`. A designed initiative has none left,
except questions marked `(implementation)`, which are deliberately left to whoever builds it.

## Scoring dimensions

Initiatives can say how important, valuable or hard they are with fields like `priority: high` or
`complexity: low`. Each takes a value from an ordered set — the first ranks first — and `list` can
filter and order by them. Every collection has `priority`, `impact` and `complexity`; a README can
declare its own, make one required, or give it a default. See
[Scoring dimensions](/reference/front-matter#scoring-dimensions).

## Generated READMEs

Each collection's README keeps its own introduction, plus a block Brindley regenerates on every
change: a table of active work, a Mermaid dependency graph, and completed work. You never edit
that block by hand; on a merge conflict it is simply regenerated.
