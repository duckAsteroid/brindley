---
type: feature
status: draft
docs: [README.md, site/reference/cli.md, site/reference/mcp.md, site/guide/reporting.md, site/.vitepress/config.mts]
updated: 2026-10-09
---
# One-page HTML progress dashboard

## Goal

Engineers see progress in the repository; leadership can't. Generate a management-friendly, one-page progress dashboard as a single self-contained HTML file (inline CSS and SVG charts, no scripts or external assets) written to a build folder, so it can be opened, attached or published anywhere. It reads the collections and their git history — every initiative file and status change is a commit — to show:

- **Headline**: done, in progress, ready, still in design, parked — overall and per collection.
- **Burn-up**: total scope and done over time, so scope growing faster than delivery is visible at a glance.
- **Scope change in the period**: initiatives added, abandoned (with reason), superseded, deferred or resumed, re-sized, and acceptance criteria changed after design.
- **Work done in the period**: initiatives completed, with their merge or PR once initiatives#26 records it.
- **Workstreams**: progress per theme or collection.
- **Needs attention**: long-running in-progress work, blocked dependencies, open questions, work already in progress elsewhere (initiatives#25).

Work is weighed by planned size rather than counted: a `size` scoring dimension when the collection has one, otherwise a stated fallback (e.g. acceptance criteria), with the unsized share shown rather than hidden. Elapsed time from history (in-progress → done) is shown as context, not as a headline. Wording avoids Brindley's internal terms. Deterministic: the same repository state and period give the same file. Automatic distribution (chat, wiki, hosting) is out of scope here and follows separately.

## Dependencies

_None._

## Related

- [26 Record the merge commit or PR when work is done](26-record-the-merge-commit-or-pr-when-work-is-done.md) — gives "work done" its merge commit or PR
- [25 Show where in-progress work is being built](done/25-show-where-in-progress-work-is-being-built.md) — work in progress elsewhere, for "needs attention"
- [21 Computed scores such as WSJF](21-computed-scores-such-as-wsjf.md) — a ranking for "what's next", if wanted

## Decisions

- Git is the source of truth for progress over time: the report replays the default branch's first-parent history and reads each collection's initiatives at each point — scope, sizes and statuses as merged, so work counts when it lands. Nothing extra is written into initiatives (no `started` / `completed` dates or status history in front-matter). Consequences: it works retroactively on an existing repo; CI needs full history (e.g. `fetch-depth: 0`); squash merges date a branch's changes at its merge; a rewritten default branch moves dates. The replay is cached in the build folder so later runs read only new commits.
- `brindley report [--since <date|tag>] [--until <date|tag>] [--collection <name>] [--out <file>]`, writing `build/brindley-report.html` at the repo root by default (creating `build/`; ignoring it is the repo's choice) and printing the path. One file for the whole repo — a combined headline, then a section per collection — narrowed by `--collection`. A `report` MCP tool takes the same options, writes the same file and returns the figures as JSON. Read-only, and byte-identical for the same commit and options.
- The burn-up covers the whole history (clipped by `--since` if given); the "this period" sections (scope change, work done) default to since the latest release tag (`vX.Y.Z`), or the last 4 weeks when there are none, and the period is shaded on the chart. The time axis is weeks. The start of the period is always marked clearly: a dashed line through the chart and a solid "since v2.0.0" (or date) label on the time axis that nothing else may overlap. Every release tag gets a tick on the axis, named on hover; release labels are placed after the period's, by priority — `x.0.0`, then `x.y.0`, then patches — in two staggered rows, leaving out any label that would overlap one already placed. `--since` and `--until` each take a tag, a date (`2026-09-01`) or an elapsed window (`4w`, `30d`, `3m`, counted back from `--until`). "Now" is the date of the branch's latest commit, not today, so the same commit and options always give the same file.
- The collection README names the field to size by — `report: { size: job_size }` — defaulting to a dimension called `size` if there is one. A dimension with word values maps them to points in the same block (`report: { size: complexity, points: { low: 1, medium: 3, high: 8 } }`). Unsized work counts at the median size of the sized work, drawn hatched as "estimated", with the page stating the share ("23% of scope is unsized, counted at the median 3 points"). With nothing sized, it counts initiatives and says so at the top. Once computed scores exist (initiatives#21), `size` may name one too, so teams can size by a formula over several dimensions.
- Plain labels by default — initiative → "work item", collection → "area", and statuses draft → Planning, designed → Ready to start, in-progress → In progress, done → Delivered, deferred → Parked, abandoned → Dropped, superseded → Replaced — each renameable in the README's `report: { labels: { … } }`. Workstreams default to themes (tags) if any initiative is tagged, else collections; `report: { workstreams: tags | collections }` overrides. No internal jargon, file paths or `name#n` refs: items show by title, linked to their file on the repo host where useful. Charts have three bands — Not started (draft, designed), In progress, Complete (done). Deferred work leaves the current scope while parked — the scope line drops by its size, rises again if resumed, both reported as scope changes — and is drawn as a faint dotted band above the scope line and counted in the headline ("+8 points parked"). Abandoned and superseded work leaves scope for good, listed with its reason and not drawn afterwards.
- Layout (from the designs in initiatives#31): headline tiles; the whole-repo burn-up; delivered, added and parked-or-dropped this period side by side; then workstreams as small multiples — one small burn-up per workstream on a shared scale, with its remaining work listed under it; then needs attention. The chart key doubles as switches: each entry shows or hides its layer (Complete, In progress, Not started, total scope, parked, this period) on every chart at once, done with checkboxes and CSS so the page stays script-free, and it starts with everything shown.
- Colours: `--palette <name|file>` on `brindley report` (`palette` on the MCP tool) picks the chart colours. Names are built-in palettes — sea (default), plum, forest, fire, teal, slate — each three steps of one hue (not started, in progress, complete) for light and for dark, checked for contrast and step separation. A file brings a team's own colours and is copied into the page: JSON as `{ "light": { "not_started": "#…", "in_progress": "#…", "complete": "#…" }, "dark": { … } }` (dark optional, light used for both; anything not a hex colour is refused), or CSS that sets the page's custom properties (`--not-started`, `--in-progress`, `--complete`, and any other). Text, gridlines and backgrounds stay neutral in every palette; "this period" shading is tinted from the in-progress colour. The page has its own Auto / Light / Dark switch (radio buttons and CSS, no script); `--mode auto|light|dark` (MCP `mode`) sets which it starts on, auto by default — following the viewer's setting. A CSS palette file writes its dark colours the usual way, in `@media (prefers-color-scheme: dark) { :root { … } }`, and the page makes them follow the switch.
- The docs site shows it two ways. A guide page, `site/guide/reporting.md` ("Reporting progress"), explains the report, its options, sizing, labels and palettes, with worked examples from the made-up canal collection (`lock-gate-maintenance`): a script (`scripts/canal-history.mjs`) builds a throwaway repository whose scripted history has sized, tagged canal work items (gate repairs, paddle replacement, slot booking…), releases, scope added mid-way, work parked and dropped, then runs `brindley report` over it during the site build. The page embeds and links the results — the default report, a period and palette variation (e.g. `--since v1.2.0 --palette forest`), and a JSON palette file — so readers see sizing, estimated (unsized) work and scope change that Brindley's own history doesn't show. Nothing from the canal repository is committed; it is rebuilt each time. And the site publishes Brindley's own report, built from this repository: the Pages workflow (which already fetches full history) runs `brindley report --out site/public/progress.html` before building the site, the nav links "Progress" to it, and the workflow also runs when `initiatives/**` changes so the page stays current.

## Open questions

- Time axis unit: the spike's history is two days with 14 releases, where a weekly axis shows nothing. Proposal: pick the unit from the span shown — hours under 3 days, days under ~10 weeks, weeks under ~2 years, else months — instead of always weeks.
- Empty default period: "since the latest release" was empty in the spike (nothing changed in the collection after v2.3.0), which will be common with frequent releases. Proposal: when nothing changed since the latest release, the period starts at the latest release after which something did change, and the page says so ("since v2.2.0 — nothing has changed since v2.3.0").
- In progress is invisible in first-parent history: work here went planned → done in one commit on main, because in-progress lives on branches. Proposal: the history stays default-branch only, but the current In progress figure (tile, chart end, workstreams) also counts work in progress on other branches and worktrees, using initiatives#25's lookup, labelled "in progress on a branch".

## Acceptance criteria

_What must be true when this is done._
