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
| cancelled, canceled, rejected, dropped | `abandoned` |
| replaced | `superseded` |

The word you wrote is kept for display — *draft (Proposed)* — and behaviour follows the core
status. Map anything else per collection:

```yaml
statuses:
  spiked: designed
  archive: done
```

## Status folders

In an existing layout, a file without a `status` takes it from the sub-folder it's in:
`completed/` → done, `deferred/` → deferred, `superseded/` → superseded, plus any word mapped
above. Front-matter always wins. Brindley never moves files between folders.
