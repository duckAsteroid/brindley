# Statuses

| Status | Meaning |
|--------|---------|
| `draft` | Being designed; open questions remain. |
| `designed` | Design complete — ready to implement once its dependencies are done. |
| `in-progress` | Being built. |
| `deferred` | Parked: not abandoned, not being worked on. Never ready. |
| `done` | Built, merged, and the docs describe it. |
| `abandoned` | Won't be done. |
| `superseded` | Replaced by another initiative (`superseded_by`). |

**Ready** isn't stored: an initiative is ready when it is `designed` and every initiative linked
under its `## Dependencies` is `done`.

## Other words that work

| You write | Means |
|-----------|-------|
| proposed, proposal, exploratory, unresolved, idea, design, designing, in-design | `draft` |
| ready, design complete, design settled | `designed` |
| in-review, wip | `in-progress` |
| parked, on-hold, backlog, future | `deferred` |
| complete, completed, implemented | `done` |
| cancelled, canceled, rejected, dropped, won't do (wont-do), wontfix | `abandoned` |
| replaced | `superseded` |

The word you wrote is kept for display — *draft (Proposed)* — and behaviour follows the core
status. Map anything else per collection:

```yaml
statuses:
  spiked: designed
  archive: done
```

## Why work stopped

Abandoned, superseded and deferred initiatives say so at the top, in a callout under their title
that Brindley keeps in step and removes when the work is reopened:

```markdown
> [!WARNING]
> **Abandoned** (2026-10-07): Mermaid can't draw a word cloud.
```

Give the reason with `set_status`'s `reason` — required to abandon, optional to supersede (the
callout links the replacement) or defer. It is also kept as `status_note` and shown in the
README's Closed list. Put the fuller story in `outcome`, which becomes an `## Outcome` section.

## Status folders

In an existing layout, a file without a `status` takes it from the sub-folder it's in:
`completed/` → done, `deferred/` → deferred, `superseded/` → superseded, plus any word mapped
above. Front-matter always wins. Brindley moves files between folders only for a collection that
opts in with `folders:` (see [Front-matter](/reference/front-matter)).
