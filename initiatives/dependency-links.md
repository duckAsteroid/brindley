---
theme: dependency-links
---
# Dependency links

From [GitHub #3](https://github.com/duckAsteroid/brindley/issues/3), reported while adopting a
collection of about 60 hand-written initiatives.

Authors naturally write reverse or sideways cross-references under `## Dependencies` ("depended on
by 19", "precedes 57", "interacts with 24"). Brindley reads every link there as a blocking edge, so
these turned into false `cycle` errors: 17 in that collection, none of them genuine. Fixing them
meant moving sentences to `## Related` by hand, because `set_dependencies` can't remove a link that
sits inside a sentence.

<!-- brindley:generated:begin — do not edit by hand; regenerate instead -->

### Initiatives in this theme

Tagged `dependency-links`: 1 open, 1 closed or deferred.

| Ref | Initiative | Type | Status | Ready / blocked by |
|-----|------------|------|--------|--------------------|
| `initiatives#5` | [set_dependencies explains links it cannot remove](5-set-dependencies-removes-links-inside-prose.md) | feature | designed | ✅ ready |
| `initiatives#4` | [Cycle errors advise where back-references belong](4-flag-reverse-direction-links-under-dependencies.md) | feature | done | — |

<!-- brindley:generated:end -->
