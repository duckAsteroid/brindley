---
type: feature
status: draft
updated: 2026-10-06
tags: [dependency-links]
---
# set_dependencies removes links inside prose

## Goal

`set_dependencies(remove=…)` only removes a bullet that is just a link. When the dependency is linked inside a sentence ("Depends on 23: that proposal's event is…", with 23 linked) it reports "not linked" and the edge stays, forcing a hand edit. Make `remove` (and moving a link to `## Related`) handle links embedded in prose, or state plainly that it manages bullet links only.

## Dependencies

_None._

## Related

- [GitHub #3](https://github.com/duckAsteroid/brindley/issues/3) — the request this came from
- [4 Flag reverse-direction links under Dependencies](4-flag-reverse-direction-links-under-dependencies.md) — flagged reverse links are the ones you'll want to move or remove

## Open questions

- When the link is inside a sentence, does `remove` delete just the link (leaving the text, e.g. "Depends on 23: that proposal's event…"), the whole sentence, or refuse and say where it is? And should there be a `move to Related` operation that carries the sentence across?

## Acceptance criteria
