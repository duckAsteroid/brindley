---
type: feature
status: draft
updated: 2026-10-06
---
# Themes overview and tag cloud in the collection README

## Goal

The collection README's generated block lists initiatives but says nothing about themes, so a reader can't see what the work is about at a glance or find the theme overview docs. Add a "Themes" section: each tag used in the collection, linked to its theme doc (§4.2) when there is one, with its declared description and open/closed counts — like the repo-wide overview's Themes section (src/readme.ts:202), which is only served as an MCP resource today. Add a tag cloud where a tag's size grows with how many initiatives use it. Both stay deterministic, as FORMAT §8 requires: same inputs, byte-identical output.

## Dependencies

_None._

## Open questions

- How is the cloud drawn so it renders on GitHub, in VitePress and in a plain editor? GitHub strips inline styles, so CSS font sizes are out. Options: size buckets with HTML GitHub keeps (`<sub>`, `<b>`, heading levels — needs checking which survive); a generated SVG file next to the README (renders everywhere, but a second generated file outside the markers); or a Mermaid chart (renders on GitHub, but Mermaid has no word cloud — a pie or bar of tag counts instead).
- What counts toward a tag's size: every initiative tagged with it, or only open ones (so finished themes shrink)? And which tags appear: only those used in this collection, or every tag in the repo — theme docs and tag declarations can live in other collections?
- Is the cloud on by default, or opt-in per collection (a README front-matter setting)? A collection with one or two tags gets little from it.

## Acceptance criteria

_What must be true when this is done._
