---
type: feature
status: done
docs: [README.md, site/reference/cli.md, site/reference/mcp.md, site/guide/reporting.md, site/.vitepress/config.mts]
updated: 2026-10-09
docs_impact:
  - FORMAT.md
  - MCP-SERVER.md
  - README.md
  - site/guide/reporting.md
  - site/reference/cli.md
  - site/reference/mcp.md
  - site/reference/front-matter.md
  - site/reference/validation.md
---
# One-page HTML progress dashboard

## Goal

Engineers see progress in the repository; leadership can't. Generate a management-friendly, one-page progress dashboard as a single self-contained HTML file (inline CSS and SVG charts, no scripts or external assets) written to a build folder, so it can be opened, attached or published anywhere. It reads the collections and their git history — every initiative file and status change is a commit — to show:

- **Headline**: done, in progress, ready, still in design, parked — overall and per collection.
- **Burn-up**: total scope and done over time, so scope growing faster than delivery is visible at a glance.
- **Scope change in the period**: initiatives added, abandoned (with reason), superseded, deferred, removed or resumed, and re-sized.
- **Work done in the period**: initiatives completed, with their merge or PR once initiatives#26 records it.
- **Workstreams**: progress per theme or collection.
- **Needs attention**: long-running in-progress work, work waiting on its dependencies or open questions, work in progress on other branches (initiatives#25), and parked work.

Work is weighed by planned size rather than counted: a `size` scoring dimension when the collection has one, otherwise a stated fallback (e.g. acceptance criteria), with the unsized share shown rather than hidden. Wording avoids Brindley's internal terms. Deterministic: the same repository state and period give the same file. Automatic distribution (chat, wiki, hosting) is out of scope here and follows separately.

## Dependencies

_None._

## Related

- [26 Record the merge commit or PR when work is done](../26-record-the-merge-commit-or-pr-when-work-is-done.md) — gives "work done" its merge commit or PR
- [25 Show where in-progress work is being built](25-show-where-in-progress-work-is-being-built.md) — work in progress elsewhere, for "needs attention"
- [21 Computed scores such as WSJF](../21-computed-scores-such-as-wsjf.md) — a ranking for "what's next", if wanted

## Decisions

- Git is the source of truth for progress over time: the report replays the checked-out branch's first-parent history — the default branch when run there, as in CI — and reads each collection's initiatives at each point — scope, sizes and statuses as merged, so work counts when it lands. Nothing extra is written into initiatives (no `started` / `completed` dates or status history in front-matter). Consequences: it works retroactively on an existing repo; CI needs full history (e.g. `fetch-depth: 0`); squash merges date a branch's changes at its merge; a rewritten default branch moves dates. The replay is cached in the build folder so later runs read only new commits.
- `brindley report [--since <date|tag>] [--until <date|tag>] [--collection <name>] [--out <file>]`, writing `build/brindley-report.html` at the repo root by default (creating `build/`; ignoring it is the repo's choice) and printing the path. One file for the whole repo — a combined headline, then a section per collection — narrowed by `--collection`. A `report` MCP tool takes the same options, writes the same file and returns the figures as JSON. Read-only, and byte-identical for the same commits and options (see branches below).
- The burn-up covers the whole history (clipped by `--since` if given); the "this period" sections (scope change, work done) default to since the latest release tag (`vX.Y.Z`), or the last 4 weeks when there are none, and the period is shaded on the chart. The start of the period is always marked clearly: a dashed line through the chart and a solid "since v2.0.0" (or date) label on the time axis that nothing else may overlap. Every release tag gets a tick on the axis, named on hover; release labels are placed after the period's, by priority — `x.0.0`, then `x.y.0`, then patches — in two staggered rows, leaving out any label that would overlap one already placed. `--since` and `--until` each take a tag, a date (`2026-09-01`) or an elapsed window (`4w`, `30d`, `3m`, counted back from `--until`). "Now" is the date of the branch's latest commit, not today, so the same commit and options always give the same file.
- The collection README names the field to size by — `report: { size: job_size }` — defaulting to a dimension called `size` if there is one. A dimension with word values maps them to points in the same block (`report: { size: complexity, points: { low: 1, medium: 3, high: 8 } }`). Unsized work counts at the median size of the sized work, drawn hatched as "estimated", with the page stating the share ("23% of scope is unsized, counted at the median 3 points"). With nothing sized, it counts initiatives and says so at the top. Once computed scores exist (initiatives#21), `size` may name one too, so teams can size by a formula over several dimensions.
- Plain labels by default — initiative → "work item", collection → "area", and statuses draft → Planning, designed → Ready to start, in-progress → In progress, done → Delivered, deferred → Parked, abandoned → Dropped, superseded → Replaced — each renameable in the README's `report: { labels: { … } }`. Workstreams default to themes (tags) if any initiative is tagged, else collections; `report: { workstreams: tags | collections }` overrides. No internal jargon, file paths or `name#n` refs: items show by title, linked to their file on the repo host where useful. Charts have three bands — Not started (draft, designed), In progress, Complete (done). Deferred work leaves the current scope while parked — the scope line drops by its size, rises again if resumed, both reported as scope changes — and is drawn as a faint dotted band above the scope line and counted in the headline ("+8 points parked"). Abandoned and superseded work leaves scope for good, listed with its reason and not drawn afterwards.
- Layout (from the designs in initiatives#31): headline tiles; the whole-repo burn-up; delivered, added and parked-or-dropped this period side by side; then workstreams as small multiples — one small burn-up per workstream on a shared scale, with its remaining work listed under it; then needs attention. The chart key doubles as switches: each entry shows or hides its layer (Complete, In progress, Not started, total scope, parked, this period) on every chart at once, done with checkboxes and CSS so the page stays script-free, and it starts with everything shown.
- Colours: `--palette <name|file>` on `brindley report` (`palette` on the MCP tool) picks the chart colours. Names are built-in palettes — sea (default), plum, forest, fire, teal, slate — each three steps of one hue (not started, in progress, complete) for light and for dark, checked for contrast and step separation. A file brings a team's own colours and is copied into the page: JSON as `{ "light": { "not_started": "#…", "in_progress": "#…", "complete": "#…" }, "dark": { … } }` (dark optional, light used for both; anything not a hex colour is refused), or CSS that sets the page's custom properties (`--not-started`, `--in-progress`, `--complete`, and any other). Text, gridlines and backgrounds stay neutral in every palette; "this period" shading is tinted from the in-progress colour. The page has its own Auto / Light / Dark switch (radio buttons and CSS, no script); `--mode auto|light|dark` (MCP `mode`) sets which it starts on, auto by default — following the viewer's setting. A CSS palette file writes its dark colours the usual way, in `@media (prefers-color-scheme: dark) { :root { … } }`, and the page makes them follow the switch.
- The docs site shows it two ways. A guide page, `site/guide/reporting.md` ("Reporting progress"), explains the report, its options, sizing, labels and palettes, with worked examples from the made-up canal collection (`lock-gate-maintenance`): a script (`scripts/canal-history.mjs`) builds a throwaway repository whose scripted history has sized, tagged canal work items (gate repairs, paddle replacement, slot booking…), releases, scope added mid-way, work parked and dropped, then runs `brindley report` over it during the site build. The page embeds and links the results — the default report, a period and palette variation (e.g. `--since v1.2.0 --palette forest`), and a JSON palette file — so readers see sizing, estimated (unsized) work and scope change that Brindley's own history doesn't show. Nothing from the canal repository is committed; it is rebuilt each time. And the site publishes Brindley's own report, built from this repository: the Pages workflow (which already fetches full history) runs `brindley report --out site/public/progress.html` before building the site, the nav links "Progress" to it, and the workflow also runs when `initiatives/**` changes so the page stays current.
- The time axis picks its unit from the span shown, aiming at roughly 4–12 labels: under 3 days, 6-hourly gridlines with days labelled; under ~10 weeks, days labelled every few days or at Mondays; under ~2 years, weeks labelled at the first Monday of each month; longer, months labelled by quarter. Release markers and the period's start sit on top unchanged; the span ends at the latest commit, so the same commit gives the same axis.
- When the default period (since the latest release) has no changes — nothing delivered, added, parked, dropped or resumed; wording edits don't count — it steps back to the most recent release after which something did change, and the subtitle says so ("this period: since v2.2.0 (7 Oct, 22:30) — nothing has changed since v2.3.0"). An explicit `--since` is always taken as given, empty or not (the lists then say e.g. "Nothing delivered yet this period"); without release tags the default stays the last 4 weeks and is not stepped back.
- The history stays default-branch only; the current figures (In progress tile, the chart's right-hand end, each workstream's end, the lists and needs attention) also count work in progress on other branches, found with initiatives#25's lookup: an item not started on the default branch but in progress on a branch counts as In progress now, noted ("2 in progress on branches"; "in progress on feature/slot-booking"). Which are looked at: `--branches <glob>` (repeatable; MCP `branches: string[]`) names local or remote-tracking branches to include, `!<glob>` excludes (as in docs globs), a glob matching with or without the remote prefix (`feature/*` matches `origin/feature/x`); default all branches; `--no-branches` (MCP `branches: false`) looks at none. Other worktrees' uncommitted files are left out by default — a report reflects committed work — and `--worktrees [<glob>]` (MCP `worktrees: true | string[]`) includes them, the glob matching a worktree's path or its branch, `!` excluding. Determinism becomes: the same commits on the default branch and on the included branches (and worktree files, if included) give the same file; the footer lists the branches and worktrees whose work was counted.

## Open questions

_None._

## Acceptance criteria

- [x] `brindley report` writes one self-contained HTML file (inline CSS and SVG, no scripts, no external assets) to `build/brindley-report.html` by default, or `--out`, and prints the path; a `report` MCP tool takes the same options, writes the same file and returns the figures as JSON.
- [x] Progress over time comes from replaying the default branch's first-parent history of each collection, read through one `git cat-file --batch`; the replay is cached in the build folder and a later run reads only new commits; a repo without git history reports the current state only, and says so.
- [x] The page has headline tiles, the burn-up (three bands, scope line, parked band, shaded period), delivered / added / parked-or-dropped this period, workstream small multiples on a shared scale with remaining work, and needs attention; with more than one collection, a combined headline first and then a section per collection; `--collection` narrows it to one.
- [x] The chart key shows and hides each layer on every chart, and the page has an Auto / Light / Dark switch, both by CSS alone; `--mode` sets the switch's starting point.
- [x] `--since` / `--until` take a tag, a date or an elapsed window; the default period is since the latest release, stepping back to the last release after which something changed (and saying so), or the last 4 weeks without releases; "now" is the latest commit.
- [x] The time axis picks its unit from the span shown; the period's start is a dashed line and a label nothing overlaps; release labels are placed by priority in two rows, every release a tick named on hover.
- [x] Sizing follows `report: { size, points }` (default the `size` dimension); unsized work counts at the median and is drawn hatched as estimated, with its share stated; with nothing sized, work items are counted and the page says so.
- [x] Plain labels, renameable in `report: { labels }`; workstreams are tags if any, else collections, or `report: { workstreams }`; titles link to their file on the repo host when the remote is a known host.
- [x] Work in progress on other branches counts in the current figures and is noted; `--branches` (with `!` exclusions), `--no-branches` and `--worktrees` choose what is looked at; the footer names them.
- [x] `--palette` takes sea, plum, forest, fire, teal or slate, or a JSON or CSS palette file; bad JSON colours are refused with the key named; CSS dark blocks follow the switch.
- [x] `validate` checks the README's `report:` block (unknown keys, a `size` that is not a dimension, `points` for a word that is not a value).
- [x] The same commits, branches and options give a byte-identical file.
- [x] The docs site has a "Reporting progress" guide with canal examples built at site-build time by `scripts/canal-history.mjs`, and publishes Brindley's own report as "Progress", rebuilt when initiatives change.
- [x] FORMAT.md, MCP-SERVER.md, README.md and the CLI / MCP / front-matter reference pages describe the report.
