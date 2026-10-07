---
type: feature
status: draft
updated: 2026-10-07
---
# Sorted and filtered views in the generated README

## Goal

Once initiatives can be ranked (initiatives#19), readers of a collection README want to see the work by score, by theme or ready-first, not only by number. GitHub renders README Markdown as static HTML with scripts stripped, so tables can't be sorted or filtered by clicking. Generate the useful views statically instead — e.g. "by score" and "ready first" orderings of the Active table, each in a collapsed `<details>` section, which GitHub keeps — so they work on GitHub, in VitePress and in a plain editor and stay deterministic (FORMAT §8). Interactive sorting and filtering is left to the tools (`list`) and, optionally, the docs site.

## Dependencies

- [19 Rank initiatives by scoring dimensions](19-rank-initiatives-by-scoring-dimensions.md) — the views are mostly orderings by score, which #19 defines

## Related

- [12 Themes overview and tag cloud in the collection README](12-themes-overview-and-tag-cloud-in-the-collection-readme.md) — another generated README section; a by-theme view overlaps its Themes section
- [14 README front-matter controls what the dependency graph shows](14-readme-front-matter-controls-what-the-dependency-graph-shows.md) — the same kind of front-matter setting could choose which views appear

## Open questions

- Which views, and who chooses? A fixed set (e.g. "by score" and "ready first"), or views declared in the collection README's front-matter — the same kind of setting as initiatives#14's graph controls? Each view repeats the table, so a long collection's README grows quickly.
- Is an interactive sortable/filterable table on the VitePress docs site in scope (a Vue component reading the collections), or only the static README views? The site only helps repos that publish one.

## Acceptance criteria

_What must be true when this is done._
