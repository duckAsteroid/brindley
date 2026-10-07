---
type: feature
status: done
updated: 2026-10-07
docs_impact:
  - FORMAT.md
  - MCP-SERVER.md
  - site/reference/front-matter.md
  - site/reference/mcp.md
  - site/reference/validation.md
  - site/guide/themes.md
---
# README front-matter controls what the dependency graph shows

## Goal

The generated Mermaid graph (FORMAT §8.3, src/readme.ts:78) shows active initiatives plus whatever they depend on, drawing only blocking dependencies; completed, deferred and closed work appears only as a dependency, and the graph is omitted when nothing is active. Let a collection's README front-matter change what is included, through a `graph:` settings object — e.g. draw `## Related` links (built), show all completed work for a finished changeset, hide external nodes on a busy graph, or turn the graph off for a large collection — while keeping the output deterministic (FORMAT §8).

## Dependencies

_None._

## Related

- [12 Themes overview and tag cloud in the collection README](../12-themes-overview-and-tag-cloud-in-the-collection-readme.md) — also adds a front-matter-controlled section to the generated README

## Decisions

- Separate settings under one `graph:` object in the collection README, not a single preset word. The first is built: `graph: { related: true }` draws `## Related` links as dotted edges; they are off by default, so the graph shows only blocking dependencies (the `graph` tool takes `related` too, defaulting to the collection's setting). Further settings — which statuses appear, external nodes, turning the graph off — join the same object.
- A collection's `graph:` settings govern every graph drawn for that collection and nothing else: its README graph — including how it shows other collections' initiatives it depends on, which appear there — and the `graph` tool when called with that collection or one of its initiatives (`ref:`), where the caller can override each setting. A `tag:` graph spans collections and uses the defaults. The repo-wide overview's collection-to-collection graph is not affected.
- Themes in the graph: `graph: { themes: … }` takes one value or a list of `box`, `icon`, `label`, or `true`; off by default.
  - `box` groups: one Mermaid subgraph per theme, titled with the theme's name; a node sits in the box of its **first** tag (a node can be in only one box); untagged work stays outside any box.
  - `icon` marks: each of the node's themes' icons before its title (e.g. `🟢 🧭🔗 4 Cycle errors…`), with a one-line legend under the graph ("🧭 adoption · 🔗 dependency-links").
  - `label` marks: the theme names after the title (`… · adoption, dependency-links`); needs no setup. `true` means `label`.
  - Combining: one grouping (`box`) plus one marking (`icon` or `label`) — the box shows a node's main theme, the marks show all of them, so multi-tag initiatives aren't misrepresented. `icon` with `label` is redundant: a `validate` warning, and `label` is used.
  - A theme's icon is declared in its theme doc's front-matter (`theme: adoption`, `icon: 🧭`). A theme without one (no theme doc, or no `icon:`) is shown as `[adoption]` where its icon would go, so `icon` never loses information.
- The full set of settings, each defaulting to today's behaviour: `related` (built), `themes`, `show` (statuses to include as nodes beyond active work — a list, so `show: [done]` can leave out abandoned work), `external` (`false` hides external links and other collections' initiatives, with their edges; the README's "Ready / blocked by" column still names them), and `enabled` (`false` leaves the graph out of the README; the tables stay). Unknown keys and bad values under `graph:` are a `validate` warning.
- Direction: `graph: { direction: … }` is the reading order of the work — which side the do-first work is on: `left-to-right` (do-first work on the left, the default), `right-to-left`, `top-to-bottom` or `bottom-to-top`; `LR`, `RL`, `TB`, `BT` are accepted as short forms of the same. Brindley derives Mermaid's `flowchart` direction from `direction` and `arrows` together (Mermaid places an edge's start before its end): with `arrows: to` it is the same as `direction` (`left-to-right` → `LR`), with `arrows: from` the opposite (`left-to-right` → `RL`), so the do-first work always lands on the chosen side.
- Arrows: `graph: { arrows: from | to }` sets only which way arrowheads point, defined by which initiative's file holds the link — so it means the same for every kind of edge. `from`, the default, points away from the initiative that lists the link, i.e. at what it needs: when X lists Y, the edge is `X --> Y` (a dependency: "X depends on Y"), `X -.-> Y` (a `## Related` link) or `X --> 🔗 …` (an external one). `to` points at it — `Y --> X`, "Y unblocks X" for a dependency — which is how Brindley drew edges before. The defaults (`left-to-right`, `from`) draw do-first work on the left with arrows pointing back at what each initiative needs. The repo-wide overview's collection-to-collection edges, which no collection owns, use the defaults.
- Implementation: settings are read by `parseGraph` in `src/graph.ts`, which falls back to the default for anything unusable and reports it (`graph-setting` warnings); `mermaidDirection` derives Mermaid's direction from `direction` and `arrows`. `td` is accepted for `top-to-bottom`, as Mermaid does. The `graph` tool takes every setting except `enabled` (asking the tool for a graph is the opt-in), and now resolves a collection alias to its name. The `icon` legend lists only themes that have an icon; `[name]` fallbacks explain themselves. FORMAT §8.3 no longer says large graphs may be split into connected components — nothing did that, and `enabled: false` covers large collections.

## Built in two steps

The `graph:` object and its first setting, `related`, shipped in commit 3446e99 ("feat: draw ## Related links in the graph only when a collection opts in"), ahead of the rest of this initiative because `## Related` edges cluttered the graph:

- **Default changed:** `## Related` links are no longer drawn. The README graph shows only blocking dependencies (solid edges); this repo's `initiatives` graph went from 17 dotted edges to none.
- **Opt in:** `graph: { related: true }` in the collection README draws them again as dotted edges (`-.->`), between initiatives already on the graph.
- **Model and parsing:** `CollectionMeta.graph` (`GraphSettings` in src/model.ts), read by `graphSettings()` in src/repo.ts; anything but a boolean `related` is ignored.
- **Rendering:** `mermaid(root, active, from, { related })` in src/readme.ts; the collection README block passes the collection's setting.
- **`graph` MCP tool:** takes `related?`, defaulting to the collection's `graph.related`, else off.
- **Docs:** FORMAT §2 (example) and §8.3, MCP-SERVER.md's `graph` row, and the site's front-matter and MCP references.
- **Test:** "draws ## Related links in the graph only when the README opts in" (test/ops.test.ts) — no dotted edges by default, `n3 -.-> n2` with the setting.

The rest — `themes`, `show`, `external`, `enabled`, `direction`, `arrows`, and the new defaults (do-first work on the left, edges pointing at what each initiative needs) — completed this initiative.

## Open questions

_None._

## Acceptance criteria

- A collection README's `graph:` object accepts `related`, `themes`, `show`, `external`, `enabled`, `direction` and `arrows`. With none set, the README graph shows active work plus its dependencies with do-first work on the left, solid dependency edges only, each pointing from an initiative to what it depends on.
- `related: true` draws `## Related` links as dotted edges between nodes already on the graph (built in 3446e99).
- `themes` takes `true`, `box`, `icon`, `label`, or a list of them:
  - `box` puts each tagged node in a subgraph for its first tag, titled with the theme's name; untagged nodes stay outside.
  - `icon` puts each of the node's themes' icons before its title, in tag order, and adds a one-line legend under the graph listing each icon used and its theme. A theme's icon comes from `icon:` in its theme doc's front-matter; a theme without one shows as `[name]`.
  - `label` (and `true`) puts the node's theme names after its title.
  - `box` combines with `icon` or `label`. Given both `icon` and `label`, `label` is used and `validate` warns.
- `show: [<status>, …]` adds every initiative in those statuses as a node, with its usual mark, besides the active work and its dependencies.
- `external: false` leaves out external (http) dependency nodes and other collections' initiatives, and their edges; the README's tables still list them.
- `enabled: false` leaves the dependency graph section out of the README; the tables are unchanged.
- `direction` takes `left-to-right` (the default), `right-to-left`, `top-to-bottom` or `bottom-to-top` (or `LR`, `RL`, `TB`, `BT`), naming where the do-first work goes; the Mermaid `flowchart` direction is derived from it and `arrows` so that work a collection needs first is always on that side — e.g. the defaults emit `flowchart RL` with `X --> Y` edges, putting Y left of X.
- `arrows` takes `from` (the default) or `to`. With `from`, every edge points away from the initiative whose file holds the link — `X --> Y` when X lists Y as a dependency, `X -.-> Y` for a `## Related` link, `X --> 🔗 …` for an external one; `to` reverses every edge, as Brindley drew them before. The repo-wide overview's collection edges use `from`. FORMAT §8.3's example and wording match the default.
- The `graph` MCP tool applies the settings of the collection it is drawing (`collection:`, or `ref:`'s collection), and takes each setting as an optional parameter that overrides it; a `tag:` graph uses the defaults. The repo-wide overview is unaffected.
- `validate` warns about unknown keys under `graph:`, values of the wrong type, statuses in `show` that aren't statuses or aliases, unknown `themes`, `direction` or `arrows` values, and `icon` combined with `label`.
- Output stays deterministic: the same files give a byte-identical README (FORMAT §8).
- FORMAT §2 and §8.3, §4.2 (the theme doc's `icon:`), MCP-SERVER.md's `graph` row and the site's front-matter, themes and MCP references describe the settings. Tests cover each setting (including every direction and both `arrows` values, on dependency, related and external edges), `box` with `icon`, a multi-tag node, a theme without an icon, the `graph` tool's overrides, and the warnings.
