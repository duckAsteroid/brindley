# Milestones

A milestone names something significant the work delivers — *the lock reopens to boats*, *ready
for the season* — and says what delivers it, from any collection or theme. It isn't a piece of
work: nobody starts or completes it. It is **reached** when what delivers it is done.

## Writing a milestone

A milestone is a non-numbered Markdown file in any collection folder, named in its front-matter,
with its members as links under `## Delivered by`:

```markdown
---
milestone: reopening
summary: Boats can use the lock again after the winter stoppage
icon: 🚤
---
# Lock reopens to boats

Reopening means both gates swing and seal, and the towpath is safe to walk a horse along.

## Delivered by

- [Gates](gates.md)
- [Resurface towpath](../towpath/01-resurface-towpath.md)
- [Ready for the season](season.md)
- [Gate sensors release](https://github.com/example/canal/releases/tag/v2.0)
```

A member can be:

- **an initiative**, in any collection;
- **a theme doc** — every initiative tagged with the theme, including ones tagged later;
- **another milestone** — this one is reached only when that one is, and that one's work counts
  towards this one's progress;
- **an http link** — Brindley can't see its status, so it isn't counted; it is shown as
  unconfirmed, for you to check.

The initiatives themselves say nothing about milestones: what a milestone means is all in its one
file, reviewable in one diff.

## Reached, not reached, unspecified

- **Reached** — at least one member is done, every other counted member is done, and every
  included milestone is reached. Deferred, abandoned and superseded work is left out of the count.
- **Not reached** — something counted is still to do.
- **Unspecified** — nothing counts yet: no members, only empty themes, or everything left out.

Reached is worked out, never written down, so it can stop being true: reopening a done member, or
tagging new open work into an included theme, makes the milestone not reached again. When it was
reached comes from git history. A milestone has no target date — it says what is delivered, not
when.

## Where milestones show

- **The milestone doc** gets a generated block: where it stands, what is still to do, unconfirmed
  external members, and every initiative that counts, with how it belongs. Your prose is left
  alone.
- **The `milestones` tool** lists every milestone with its progress and the date it was reached.
  Ask *"what's left for the season?"*.
- **`get`** on an initiative names the milestones it counts towards.
- **The collection README** lists the milestones its initiatives count towards, with progress.
- **The dependency graph** marks each initiative with its milestones' icons when the collection
  asks for it with `graph: { milestones: icon }` — see
  [Graph settings](/reference/front-matter#graph-settings).
- **The [progress report](/guide/reporting)** lists every milestone and marks when each was
  reached on its timeline.

## Being told

Whenever a change reaches a milestone, or un-reaches one, the tool that made it says so.
Completing the last paddle job returns:

```text
By completing lock-gate-maintenance#2 you have reached milestone "Lock reopens to boats"
(lock-gate-maintenance/reopening.md).
```

and tagging new gate work into the theme afterwards returns:

```text
This change means milestone "Lock reopens to boats" (lock-gate-maintenance/reopening.md) is no
longer reached (lock-gate-maintenance#4 is open).
```

Changes that only move progress along say nothing.
