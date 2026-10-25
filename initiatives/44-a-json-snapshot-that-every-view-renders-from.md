---
type: feature
status: draft
updated: 2026-10-24
---
# A JSON snapshot that every view renders from

## Goal

One build step writes a versioned, gitignored JSON snapshot of every collection, and the views — the README generator, an interactive HTML page and the progress report — render from that snapshot alone.

## Background

Each view currently derives its own data from the parsed repo: the README generator (`src/readme.ts`), the progress report (`buildReport`, `src/report.ts:353`, rendered by `renderReport`), and the MCP tools (`list`, `get`, `graph`, `tags`, `milestones`). The report already separates building figures from rendering them; this applies that split to everything.

The snapshot is a build output, not a store. The Markdown files stay the only source of truth, and the snapshot can be deleted and rebuilt at any time. A database (SQLite in `.brindley/`) was considered and is not needed: a full parse of this repo's 48 initiatives takes about 80 ms, every view reads the whole thing anyway, and the snapshot has a single writer — the build.

## Design

- **Build.** A `build` CLI command and MCP tool writes `.brindley/index.json` in the checkout it
  runs on (each worktree has its own). It holds collections (front-matter, title, summary, declared
  tags, dimensions, columns), initiatives (ref, path, title, front-matter, status, readiness and
  what blocks it, open questions, acceptance criteria), dependency and related edges, themes and
  milestones with where they stand.
- **Ignored.** `.brindley/` is gitignored; Brindley adds the entry when it first writes there if
  the repo's `.gitignore` lacks it.
- **Versioned.** The snapshot carries a `schema` version, and its shape is documented, because
  other tools and pages will read it.
- **Views read only the snapshot:**
  - `regenerate_readmes` renders generated blocks from it (building it first if missing or stale);
  - an interactive HTML page renders it — filterable tables, a clickable dependency graph, open
    questions — with the JSON inlined so the page works from `file://`;
  - the progress report reads its per-initiative data from it (git-history figures stay the
    report's own).
- **Deterministic.** Same repo state, byte-identical snapshot: stable ordering, no timestamps.

## Dependencies

_None._

## Related

- [Writes no longer regenerate READMEs](43-writes-no-longer-regenerate-readmes.md) — makes README regeneration an explicit step, which this feeds
- [Serve the progress report live over local HTTP](34-serve-the-progress-report-live-over-local-http.md) — could serve the snapshot and the HTML page too

## Open questions

- Does the interactive HTML grow out of the progress report — one page, written by `report` and
  served by initiatives#34, gaining index views (tables, graph, questions) — or is it a separate
  index page sharing the snapshot and styling? The report is aimed at managers, the index at
  people doing the work.
- Is the snapshot's schema part of FORMAT.md (a public, versioned format alongside `brindley: 1`)
  or of MCP-SERVER.md (an output of this implementation, free to change between major versions)?
- Do the MCP read tools (`list`, `get`, `graph`, `tags`, `milestones`) also answer from the
  snapshot, or keep parsing the repo live? From the snapshot means one code path; live means they
  are never stale.
- (implementation) Staleness: rebuild whenever a view runs (cheap at this scale), or record what
  the snapshot was built from (e.g. HEAD plus a hash of the collection files) and rebuild only
  when it changed?

## Acceptance criteria

- `brindley build` writes `.brindley/index.json`; building twice from the same state produces
  identical bytes.
- `.brindley/` is gitignored in this repo, and Brindley adds it to a repo's `.gitignore` when it
  first writes there.
- The snapshot carries a schema version, and its shape is documented.
- `regenerate_readmes` output is unchanged for this repo when rendered from the snapshot.
- An HTML page rendered from the snapshot opens from `file://` and shows every collection's
  initiatives, dependencies and open questions.
- The progress report's per-initiative data comes from the snapshot.
- A settled decision on how staleness is detected.
