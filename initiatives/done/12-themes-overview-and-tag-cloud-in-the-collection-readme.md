---
type: feature
status: done
updated: 2026-10-07
docs_impact:
  - FORMAT.md
  - site/guide/themes.md
  - site/guide/concepts.md
---
# Themes section in the collection README

## Goal

The collection README's generated block lists initiatives but says nothing about themes, so a reader can't see what the work is about or find the theme overview docs. Add a "Themes" section: each tag used in the collection, linked to its theme doc (§4.2) when there is one, with its declared description and open / closed counts — like the repo-wide overview's Themes section, which is only served as an MCP resource today. Deterministic, as FORMAT §8 requires. A tag cloud is initiatives#29.

## Dependencies

_None._

## Related

- [29 Tag cloud in the collection README](../29-tag-cloud-in-the-collection-readme.md) — the tag cloud, split out of this initiative

## Decisions

- The tags used by this collection's initiatives — the README describes this collection; a theme's own doc lists its initiatives across collections. Each shows open and closed counts, worded as the theme docs already do ("3 open, 6 closed or deferred"). No section when no initiative is tagged.

## Open questions

_None._

## Acceptance criteria

- A collection README's generated block has a "Themes" section listing each tag used by its initiatives, in tag order: the tag, linked to its theme doc when there is one; its description (from `tags:` declarations or the theme doc's summary); and how many of this collection's initiatives carry it, open and closed or deferred.
- No Themes section when no initiative in the collection is tagged.
- Output stays deterministic (FORMAT §8).
- FORMAT §8.1 and the site's themes guide describe it. Tests cover a tag with a theme doc, one without, the counts, and a collection with no tags.
