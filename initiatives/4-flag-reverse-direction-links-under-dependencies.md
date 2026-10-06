---
type: feature
status: draft
updated: 2026-10-06
tags: [dependency-links, adoption]
---
# Flag reverse-direction links under Dependencies

## Goal

Stop reverse or sideways cross-references ("depended on by 19", "precedes 57", "interacts with 24") written under `## Dependencies` from being read as blocking edges without comment. `validate` warns when a Dependencies link sits in such wording and suggests `## Related`; a `cycle` error names the edge in the loop most likely to be the mistake, e.g. "the B → A edge in B's ## Dependencies is phrased as 'depended on by'". The data model does not change. In one adopted collection all 17 reported cycles were this pattern.

## Dependencies

_None._

## Related

- [GitHub #3](https://github.com/duckAsteroid/brindley/issues/3) — the request this came from

## Open questions

- Which wording counts as reverse or sideways ("depended on by", "prerequisite for", "precedes", "unblocks", "used by", "interacts with", "relates to")? A fixed English list, or configurable per collection — the same question `check_docs` has open in MCP-SERVER.md.

## Acceptance criteria
