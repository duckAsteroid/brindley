# Reporting progress

Engineers see progress in the repository. People outside the team need a page instead: how much is
done, how the plan changed, and what needs attention. `brindley report` writes one — a single
self-contained HTML file with no scripts — from your collections and their git history.

```sh
npx -y brindley@latest report
# build/brindley-report.html
```

Open it, attach it, or publish it anywhere a static file can go. The `report` MCP tool writes the
same file and returns the figures, so an agent can answer "how are we doing?" too.

## An example

These pages come from a made-up canal team's repository: a `lock-gate-maintenance` collection with
six months of sized, tagged work — gate repairs, paddle replacement, slot booking, water level
sensors — five releases, work added part-way through, one item dropped and one parked. They're
rebuilt every time this site is.

<iframe src="/brindley/examples/canal-progress.html" title="Example progress report" style="width:100%;height:720px;border:1px solid var(--vp-c-divider);border-radius:8px"></iframe>

- <a href="/brindley/examples/canal-progress.html" target="_blank">The default report</a>
- <a href="/brindley/examples/canal-since-v1.2.0-forest.html" target="_blank">Since v1.2.0, in the forest palette</a> — `--since v1.2.0 --palette forest`
- <a href="/brindley/examples/canal-own-palette.html" target="_blank">The team's own colours, dark</a> — `--palette towpath-green.json --mode dark`
- <a href="/brindley/progress.html" target="_blank">Brindley's own progress</a>, from this repository

## What's on the page

- **Headline** — percent complete, what was delivered this period, how scope changed, and what's in
  progress.
- **Work complete against scope** — a burn-up over the whole history: Complete, In progress and Not
  started stacked up to the total scope line, parked work as a dashed band above it, and this
  period shaded. Release tags are marked on the time axis, and the start of the period always
  stands out. Point at the chart for the figures at that moment — Complete, In progress, Not
  started, scope and parked — and the change that made them. The key doubles as switches: select
  an entry to hide or show it on every chart.
- **This period** — what was delivered, what was added and what was taken out (parked, dropped,
  replaced or removed), with reasons. Each list's title gives its count (and points, when work is
  sized); the latest ten show, and "+ N more…" opens the rest.
- **Workstreams** — one small burn-up per theme (tag), on a shared scale, with the work still to do
  under each. With several collections, the page starts with a combined headline and a chart per
  collection, then a section for each.
- **Needs attention** — work waiting on open questions or on its dependencies, work in progress for
  a long time or on a branch, and parked work.

A switch in the corner picks Auto, Light or Dark; Auto follows the viewer's setting. Every chart has
its data as a table underneath.

## Progress over time comes from git

The report replays the checked-out branch's first-parent history — normally your default branch —
and reads each initiative as each commit left it. Nothing extra is recorded in the initiatives, so
it works on an existing repository straight away. Work counts when it is merged; in CI, check out
the full history (`fetch-depth: 0`). The replay is cached in `build/`, so later runs read only new
commits.

Work in progress lives on branches, so the current figures also count initiatives marked
`in-progress` on other branches — the page notes them as "on branches". `--branches feature/*`
narrows where it looks (repeatable; `!wip/*` excludes, and `feature/*` matches
`origin/feature/x` too), `--no-branches` looks nowhere, and `--worktrees` also counts other
worktrees' uncommitted files. The footer names what was counted.

## This period

By default the period runs from the latest release tag (`vX.Y.Z`). If nothing has changed since it —
common right after a release — it starts at the latest release after which something did, and the
page says so. Without release tags, it's the last 4 weeks.

```sh
brindley report --since v1.2.0        # a tag
brindley report --since 2026-09-01    # a date
brindley report --since 6w            # a window: 30d, 6w, 3m
brindley report --until v1.3.0        # the report as it stood then
```

The time axis picks its unit from the span: hours for a few days, then days, weeks and months.
"Now" is the latest commit, so the same commits and options always give the same file.

## Sizing

A count of work items is a crude measure, so the report weighs work by its size when it can: the
`size` [scoring dimension](/reference/front-matter#scoring-dimensions) if the collection has one,
or the one named in the README:

```yaml
dimensions:
  complexity: [low, medium, high]
report:
  size: complexity
  points: { low: 1, medium: 3, high: 8 }
```

Unsized work counts at the median size of the sized work and is drawn hatched as estimated; the
page says how much of the scope that is. With nothing sized, it counts work items and says so.

## Words

The page uses plain words — "work item" rather than initiative, Planning, Ready to start,
Delivered, Parked, Dropped. Each can be renamed under `report: { labels: … }`; see
[Report settings](/reference/front-matter#report-settings).

## Colours

`--palette` picks the chart colours: `sea` (the default), `plum`, `forest`, `fire`, `teal` or
`slate` — each three shades of one colour for light and for dark. Or bring your own as a file,
copied into the page:

```json
{
  "light": { "not_started": "#b2ddb5", "in_progress": "#46a758", "complete": "#203c25" },
  "dark": { "not_started": "#2d5736", "in_progress": "#46a758", "complete": "#94ce9a" }
}
```

`dark` is optional. A CSS file works too: it can set `--not-started`, `--in-progress`, `--complete`
or any other custom property, with its dark colours in the usual
`@media (prefers-color-scheme: dark) { :root { … } }`, which then follows the page's switch.
`--mode light` or `--mode dark` sets where that switch starts.

## Publishing it

Anything that serves a static file will do. This site publishes Brindley's own report from its
Pages workflow:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- run: npx -y brindley@latest report --out site/public/progress.html
```
