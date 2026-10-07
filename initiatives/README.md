---
brindley: 1
title: Brindley roadmap
summary: "Planned work on Brindley itself: tools specified in MCP-SERVER.md but not yet built, and other changes to the format and server."
status: active
docs: [FORMAT.md, MCP-SERVER.md, README.md, site/**/*.md]
tags:
  dependency-links: "Telling blocking dependencies from other cross-references, and editing them (GitHub #3)"
  status-recording: "Recording an initiative's status outside a lifecycle transition (GitHub #4)"
  adoption: "Bringing an existing hand-written folder under Brindley with less hand-editing (GitHub #5)"
  questions: "Open questions during design and implementation, and tidying settled ones (GitHub #6, #7)"
---
# Brindley roadmap

Planned work on Brindley itself: tools specified in MCP-SERVER.md but not yet built, and other changes to the format and server.

<!-- brindley:generated:begin — do not edit by hand; regenerate instead -->

### Active

| # | Initiative | Type | Status | Ready / blocked by | Open Qs | Owner |
|---|------------|------|--------|--------------------|---------|-------|
| 1 | [migrate tool for numbered + completed/ collections](1-migrate-tool-for-numbered-completed-collections.md) | feature | draft | ⛔ 7, 13 | 0 | — |
| 2 | [renumber tool for post-merge number collisions](2-renumber-tool-for-post-merge-number-collisions.md) | feature | draft | — | 0 | — |
| 3 | [rename_collection tool](3-rename-collection-tool.md) | feature | draft | — | 0 | — |
| 4 | [Cycle errors advise where back-references belong](4-flag-reverse-direction-links-under-dependencies.md) | feature | draft | — | 0 | — |
| 5 | [set_dependencies explains links it cannot remove](5-set-dependencies-removes-links-inside-prose.md) | feature | draft | — | 0 | — |
| 6 | [Record status without lifecycle checks](6-record-status-without-lifecycle-checks.md) | feature | draft | — | 0 | — |
| 7 | [Infer a missing status from the initiative's prose](7-infer-a-missing-status-from-the-initiative-s-prose.md) | feature | draft | — | 0 | — |
| 8 | [Fix mode for mechanical validate findings](8-fix-mode-for-mechanical-validate-findings.md) | feature | draft | — | 0 | — |
| 9 | [Suggest a home for companion notes](9-suggest-an-ignore-pattern-for-companion-notes.md) | feature | draft | — | 0 | — |
| 10 | [Name the base folder in path errors](10-name-the-base-folder-in-path-errors.md) | feature | draft | — | 0 (+1 impl.) | — |
| 11 | [batch_update tool](11-batch-status-backfill-tool.md) | feature | draft | ⛔ 6, 7 | 0 | — |
| 12 | [Themes overview and tag cloud in the collection README](12-themes-overview-and-tag-cloud-in-the-collection-readme.md) | feature | draft | — | 3 | — |
| 13 | [Consistent zero-padded numbering](13-consistent-zero-padded-numbering.md) | feature | draft | — | 2 | — |
| 14 | [README front-matter controls what the dependency graph shows](14-readme-front-matter-controls-what-the-dependency-graph-shows.md) | feature | draft | — | 2 | — |
| 15 | [Show in-progress work blocked on an open question](15-show-in-progress-work-blocked-on-an-open-question.md) | feature | draft | — | 2 | — |
| 16 | [Resolve settled questions in bulk](16-resolve-settled-questions-in-bulk.md) | feature | draft | — | 1 | — |

### Dependencies

```mermaid
flowchart LR
  n1["1 migrate tool for numbered + completed/ collections"]:::draft
  n2["2 renumber tool for post-merge number collisions"]:::draft
  n3["3 rename_collection tool"]:::draft
  n4["4 Cycle errors advise where back-references belong"]:::draft
  n5["5 set_dependencies explains links it cannot remove"]:::draft
  n6["6 Record status without lifecycle checks"]:::draft
  n7["7 Infer a missing status from the initiative's prose"]:::draft
  n8["8 Fix mode for mechanical validate findings"]:::draft
  n9["9 Suggest a home for companion notes"]:::draft
  n10["10 Name the base folder in path errors"]:::draft
  n11["11 batch_update tool"]:::draft
  n12["12 Themes overview and tag cloud in the collection README"]:::draft
  n13["13 Consistent zero-padded numbering"]:::draft
  n14["14 README front-matter controls what the dependency graph shows"]:::draft
  n15["15 Show in-progress work blocked on an open question"]:::draft
  n16["16 Resolve settled questions in bulk"]:::draft
  n7 --> n1
  n13 --> n1
  n8 -.-> n1
  n4 -.-> n5
  n6 -.-> n7
  n7 -.-> n8
  n1 -.-> n8
  n6 --> n11
  n7 --> n11
  n1 -.-> n13
  n2 -.-> n13
  n8 -.-> n13
  n12 -.-> n14
  n11 -.-> n16
  classDef done fill:#e6e6e6,color:#777,stroke:#bbb
  classDef draft fill:#fff,stroke:#999,stroke-dasharray:4 3
  classDef designed fill:#e8f0fe,stroke:#4a7bd0
  classDef ready fill:#d9f2e3,stroke:#2e8b57,stroke-width:2px
  classDef inprogress fill:#fff4d6,stroke:#d49a00,stroke-width:2px
  classDef external fill:#fafafa,stroke:#999
```

### Completed

_None._

<!-- brindley:generated:end -->
