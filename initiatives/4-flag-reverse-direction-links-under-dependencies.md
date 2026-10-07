---
type: feature
status: designed
updated: 2026-10-07
tags: [dependency-links, adoption]
---
# Cycle errors advise where back-references belong

## Goal

Authors naturally write back-references ("depended on by 19", "precedes 57") under `## Dependencies`, where Brindley reads every link as a blocking edge; in one adopted collection all 17 reported cycles were this. Make the `cycle` error say how to fix it: move a back-reference to `## Related` to keep the link and its non-blocking graph edge (cycles are fine there), or to a section such as `## See also` for an ordinary link with no Brindley meaning. Advice only — no attempt to detect reverse wording, and no file edits.

## Dependencies

_None._

## Related

- [GitHub #3](https://github.com/duckAsteroid/brindley/issues/3) — the request this came from

## Decisions

- No wording detection: Brindley does not try to recognise reverse or sideways phrasing. Instead the `cycle` error advises the fix for any back-reference in the loop: move it to `## Related` to keep the link and its (non-blocking) graph edge — cycles there are fine — or to a section such as `## See also`, where it is an ordinary link with no Brindley meaning. Brindley does not edit the files; the author or agent moves the link.

## Open questions

_None._

## Acceptance criteria

- Every `cycle` error, after naming the loop, advises the fix: move a back-reference in the loop to `## Related` (keeps the link and a non-blocking graph edge) or to a section such as `## See also` (an ordinary link with no Brindley meaning).
- No reverse or sideways wording is detected, and no file is changed.
- A link under `## See also` is confirmed by a test to create no dependency, related edge or cycle.
- The site's validation reference and FORMAT §6 mention `## See also` as the place for plain cross-references.
