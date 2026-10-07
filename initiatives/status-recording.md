---
theme: status-recording
---
# Status recording

From [GitHub #4](https://github.com/duckAsteroid/brindley/issues/4).

`set_status` enforces the lifecycle, which is right for transitions but gets in the way of
recording the status a document already has, such as backfilling front-matter on an adopted
collection. The report also described forcing a `done` initiative to in-progress and back to edit
its findings; that turned out to be unnecessary, since `update` already edits a done initiative's
body (initiatives#6).

<!-- brindley:generated:begin — do not edit by hand; regenerate instead -->

### Initiatives in this theme

Tagged `status-recording`: 3 open, 0 closed or deferred.

| Ref | Initiative | Type | Status | Ready / blocked by |
|-----|------------|------|--------|--------------------|
| `initiatives#6` | [Record status without lifecycle checks](6-record-status-without-lifecycle-checks.md) | feature | designed | ✅ ready |
| `initiatives#7` | [Infer a missing status from the initiative's prose](7-infer-a-missing-status-from-the-initiative-s-prose.md) | feature | designed | ✅ ready |
| `initiatives#11` | [batch_update tool](11-batch-status-backfill-tool.md) | feature | designed | ⛔ 6, 7 |

<!-- brindley:generated:end -->
