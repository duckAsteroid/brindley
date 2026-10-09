---
type: spike
status: done
updated: 2026-10-09
docs_impact: "none: spike — findings recorded in the initiative"
---
# Spike: progress dashboard designs from git history

## Goal

Before building initiatives#30, find out what the one-page dashboard should look like and whether replaying git history is fast enough: build a throwaway prototype that replays this repository's default-branch history and renders the same data as several alternative designs, for review.

## Dependencies

_None._

## Related

- [30 One-page HTML progress dashboard](30-one-page-html-progress-dashboard.md)

## Measures

- **Question:** which layout tells someone outside the team, in under a minute, how much is done, what changed in scope this period, and what needs attention; and is replaying the default branch's first-parent history fast enough to run on every build?
- **Hypothesis:** a headline-first one-pager (numbers, then a burn-up with the scope line, then lists) reads fastest; replay is cheap because only commits touching collection files need a `git show`.
- **Measure:** render this repository's history as at least three alternative designs from one replay, in light and dark, and review them side by side; time the cold replay of this repository and extrapolate per commit.
- **Answer criteria:** one design (or a merge of two) is picked for initiatives#30; cold replay of this repository under 2 seconds, and per-commit cost low enough that 5,000 commits stays under 30 seconds (cached runs only replay new commits).
- **Time-box:** 1 day

## Findings

**Method.** `spike/dashboard/replay.mjs` replays `git log --first-parent --name-status -- initiatives` and reads every changed initiative through one `git cat-file --batch`; `spike/dashboard/render.mjs` turns one replay into three self-contained pages in `build/spike-dashboard/`: **A** headline one-pager (tiles, burn-up, delivered / added / out this period, workstream bars, needs attention), **B** release by release (percent-complete sparkline, then each release's delivered, added and out work), **C** workstream small multiples (one burn-up per workstream on a shared scale, remaining work under each). Colours: one blue ordinal ramp for Not started / In progress / Complete, validated for light and dark; scope as an ink line; parked as a dashed band above it. No scripts: tooltips are SVG `<title>`s with a CSS crosshair, dark mode follows the OS.

**Replay speed: yes.** This repository (43 commits touching the collection, 134 blobs) replays in 126–176 ms; a `git show` per file took 782 ms, so batching matters. A synthetic history of 5,000 commits (1,597 that change something, 400 initiatives) replays cold in 2.3 s, most of it copying a full snapshot per commit — store changes, not snapshots, and it drops further. Well inside the criteria.

**What the designs showed:**

- "Since the latest release" was empty here: nothing in the collection changed after v2.3.0. With frequent releases the default period will often show nothing (the samples use `--since v2.0.0`).
- This history is two days long with 14 releases: a weekly axis can't work. The axis has to pick its unit from the span, and release markers need thinning (only `x.y.0` labelled; patches as plain ticks).
- **In progress never appears.** Work here went from planned to done in one commit on the default branch; the in-progress state lived on branches. A first-parent replay will rarely see it, so the band is empty unless the report also looks at branches the way initiatives#25 does.
- Workstreams by tag: 17 of 27 work items are untagged, so "Not in a workstream" is the biggest workstream.
- Long abandon reasons make the "out of scope" list heavy; the first sentence is enough there.
- C's per-commit hover columns, six charts over, make it the largest page (128 KB against 42 KB for A); small multiples should bucket by day.

**Also tried:** release labels placed by priority in two rows, with the period's start as a solid label that nothing overlaps; six named palettes (sea, plum, forest, fire, teal, slate — three steps of one hue per mode, each passing the ordinal contrast and step checks, plum and slate after re-stepping) plus a palette from a JSON or CSS file; and an Auto / Light / Dark switch in the page, done in CSS by rewriting `prefers-color-scheme: dark` blocks to follow it.

**Conclusion:** A and C combined (**D**), with the chart key as switches that show or hide each layer on every chart — checkboxes and CSS `:has()`, still no scripts — named palettes or a palette file, and the in-page light/dark switch. Recorded as decisions in initiatives#30. Adapt, don't adopt: the replay (first-parent log + one `cat-file --batch`), the burn-up and axis drawing, `darkAware` and the palettes are worth carrying into initiatives#30; the page assembly is throwaway. The code is on branch `spike/initiatives-31` (`spike/dashboard/`).

## Open questions

_None._

## Acceptance criteria

- [x] The measures are answered in `## Findings`: replay speed against the criteria, and the alternative designs rendered from this repository's history.
- [x] A design is chosen for initiatives#30 and recorded there.
