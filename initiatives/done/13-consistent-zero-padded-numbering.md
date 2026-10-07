---
type: feature
status: done
tags: [adoption]
updated: 2026-10-07
docs_impact:
  - FORMAT.md
  - MCP-SERVER.md
  - site/reference/validation.md
  - site/reference/cli.md
  - site/reference/mcp.md
  - site/guide/getting-started.md
  - site/guide/adopting.md
---
# Consistent zero-padded numbering

## Goal

Zero-padding (`01-`, `02-`, …) makes a collection sort correctly in `ls`, file browsers and GitHub's tree view, which unpadded numbers (`1, 10, 11, 2`) don't. Treat the padding width as the collection's own style and have Brindley keep it consistent: `create` pads new numbers to the collection's width, `validate` flags files that don't match it and warns when the numbers are nearing the end of the width's range, and a tool grows the width (renaming every file and asset folder and rewriting links) so nobody does that by hand. Replaces today's stance that padding is a mistake (FORMAT §3, the `number-padding` warning).

## Dependencies

_None._

## Related

- [1 migrate tool for numbered + completed/ collections](../01-migrate-tool-for-numbered-completed-collections.md) — migrate, renumber and fix mode each touch numbering and must follow the collection's width
- [2 renumber tool for post-merge number collisions](02-renumber-tool-for-post-merge-number-collisions.md) — migrate, renumber and fix mode each touch numbering and must follow the collection's width
- [8 Fix mode for mechanical validate findings](08-fix-mode-for-mechanical-validate-findings.md) — migrate, renumber and fix mode each touch numbering and must follow the collection's width

## Decisions

- Padding is wanted, for file sorting, and is a per-collection width: unpadded numbers are width 1, `01-` is width 2, `001-` width 3. The number is still the integer value (`01` is initiative 1).
- Tools manage consistency: `create` (and `renumber`) pad new numbers to the collection's width; `validate` flags a file whose padding doesn't match it.
- `validate` warns when the highest number reaches 80% of the width's range — 8 at width 1, 80 at width 2, 800 at width 3 — advising the collection grow its padding by a digit (e.g. to three).
- Growing the width is done by a tool, not by hand: it renames every initiative file and asset folder and rewrites every link to them, like the other sanctioned rewrites (`migrate`, `rename_collection`).
- Inferred from the files, not declared: the collection's width is the padding most of its initiative files use, and any file that doesn't follow the herd gets a warning (e.g. "1-foo.md is unpadded; this collection pads to 2 digits (01-)"). A number too large for the width (`100-` in a width-2 collection) is not a mismatch — the near-end-of-range warning should have come first. A tie, or an empty collection, falls back to the default width.
- A new (empty) collection starts at width 2: its first initiative is `01-…`, files sort correctly from the start, and the near-full warning doesn't fire until 80. The default only applies while a collection has no initiatives; after that the herd rule decides. `create_collection` takes no width for now — a collection wanting width 3 from day one gets it by its first file being `001-…`; add a parameter only if someone asks.
- Its own tool, `repad(collection, width?)`, dry run by default, returning every file and asset-folder rename and every link rewrite (including links from other collections). With `width` it changes the collection to that width — growing, or shrinking — e.g. `repad("initiatives", 2)` turns `1-…`–`9-…` into `01-…`–`09-…`; without `width` it pads stray files to the herd's width, the fix the mismatch warning points to. A width too small for the population (the highest number has more digits than the width, e.g. width 2 with a `100-…`) is an error and nothing is written. A width the population already fills to the warning threshold (e.g. width 2 when the highest number is 80 or more — the highest number, not the count, since numbers are never reused) is allowed but warns, the same 80% rule `validate` uses — in the dry run as well as the real run. `migrate` (initiatives#1) reuses it for its padding step; one shared rename-and-relink function sits underneath it, `renumber` (initiatives#2) and `rename_collection` (initiatives#3) alike.
- Implementation: width rules are in src/numbering.ts, the shared move-and-relink planner in src/relink.ts (`planRelink`/`applyRelink`, rewriting only the planned link occurrence, never one inside inline code or a code block). A tie goes to the wider width rather than "the default": the same answer for `1-` against `02-`, and the right one for a collection whose numbers are all naturally two or three digits (`12-`, `13-` fit both 1 and 2, so they read as width 2). The findings are `number-padding` (a file off the herd) and `number-width` (80% full). `repad` also takes ignored numbered files into account when checking the highest number. CLI: `brindley repad <collection> [<width>] [--write]`.

## Open questions

_None._

## Acceptance criteria

- A collection's width is computed from its initiative files: the padding most of them use (unpadded = 1, `01-` = 2, `001-` = 3). A number wider than the width (`100-` at width 2) doesn't count against it. An empty collection, or a tie, uses width 2.
- `create` writes new numbers at the collection's width; the first initiative in an empty collection is `01-…`. A shared function gives the padded filename for a number, so `renumber` (initiatives#2) uses the width whichever is built first.
- `validate` warns about each file whose padding differs from the width, naming the width (e.g. "1-foo.md is unpadded; this collection pads to 2 digits (01-)") and pointing to `repad`. The old `number-padding` warning is gone.
- `validate` warns when the highest number reaches 80% of the width's range (8, 80, 800 …), advising `repad` to the next width.
- A `repad(collection, width?)` tool (MCP and CLI), dry run by default, returns every file and asset-folder rename and every link rewrite, including links from other collections and `"<collection>#<n>"` references; with `dry_run: false` it applies them and regenerates the READMEs.
- With `width` it grows or shrinks the collection to it; without, it pads only the files that don't match the herd.
- A width too small for the highest number is an error and nothing changes. A width the highest number already fills to 80% or more is allowed but warns, in the dry run and the real run.
- After a real run, `validate` reports no padding findings or broken links for the collection, and a second `repad` plans nothing.
- The rename-and-relink logic is one shared function, used by `repad` and available to `migrate` (initiatives#1), `renumber` and `rename_collection` (initiatives#3).
- FORMAT §3 says numbers may be zero-padded to a consistent per-collection width (the number is the integer value); FORMAT §10, MCP-SERVER.md and the site's validation, CLI and MCP references describe the findings and `repad`. Tests cover herd inference, a tie, an empty collection, mismatch and near-full warnings, grow, shrink, too-small and threshold cases, cross-collection links and the dry run.
