---
type: feature
status: draft
updated: 2026-10-07
---
# README front-matter controls what the dependency graph shows

## Goal

The generated Mermaid graph (FORMAT §8.3, src/readme.ts:78) always shows active initiatives plus whatever they depend on; completed, deferred and closed work appears only as a dependency, `## Related` edges only between nodes already shown, and the graph is omitted when nothing is active. That stays the default. Add an optional field in the collection README's front-matter to change what is included — e.g. show all completed work for a finished changeset, hide related edges or external nodes on a busy graph, or turn the graph off for a large collection — while keeping the output deterministic (FORMAT §8).

## Dependencies

_None._

## Related

- [12 Themes overview and tag cloud in the collection README](12-themes-overview-and-tag-cloud-in-the-collection-readme.md) — also adds a front-matter-controlled section to the generated README

## Open questions

- What shape is the field? A single preset (`graph: active | all | none`, with today's behaviour as `active`), or separate settings, e.g. `graph: { statuses: [done, deferred], related: false, external: false }`? Presets are easy to read and hard to get wrong; settings cover cases presets don't.
- Does the setting reach beyond the collection — e.g. hide other collections' initiatives that this one depends on, or apply to the repo-wide overview's cross-collection graph — or only this collection's README graph?

## Acceptance criteria

_What must be true when this is done._
