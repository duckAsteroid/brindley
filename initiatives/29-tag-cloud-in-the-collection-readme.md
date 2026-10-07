---
type: feature
status: draft
updated: 2026-10-07
---
# Tag cloud in the collection README

## Goal

Show a collection's themes at a glance as a tag cloud in its README: each tag sized by how many initiatives use it, linking to its theme doc where there is one. It must stay deterministic, as FORMAT §8 requires — same inputs, byte-identical output — and render acceptably on GitHub, in the docs site and in an IDE's preview.

## Dependencies

_None._

## Related

- [12 Themes overview and tag cloud in the collection README](done/12-themes-overview-and-tag-cloud-in-the-collection-readme.md)

## Open questions

- How is the cloud drawn so it renders on GitHub, in VitePress and in a plain editor? GitHub strips inline styles, so CSS font sizes are out. Options: size buckets with HTML GitHub keeps (`<sub>`, `<b>`, heading levels — needs checking which survive); a generated SVG file next to the README (renders everywhere, but a second generated file outside the markers); or a Mermaid chart (renders on GitHub, but Mermaid has no word cloud — a pie or bar of tag counts instead).
- What counts toward a tag's size: every initiative tagged with it, or only open ones (so finished themes shrink)?
- Is the cloud on by default, or opt-in per collection (a README front-matter setting, e.g. alongside `graph:`)? A collection with one or two tags gets little from it.

## Acceptance criteria

_What must be true when this is done._
