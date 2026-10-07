---
type: feature
status: draft
tags: [adoption]
updated: 2026-10-07
---
# Consistent zero-padded numbering

## Goal

Zero-padding (`01-`, `02-`, …) makes a collection sort correctly in `ls`, file browsers and GitHub's tree view, which unpadded numbers (`1, 10, 11, 2`) don't. Treat the padding width as the collection's own style and have Brindley keep it consistent: `create` pads new numbers to the collection's width, `validate` flags files that don't match it and warns when the numbers are nearing the end of the width's range, and a tool grows the width (renaming every file and asset folder and rewriting links) so nobody does that by hand. Replaces today's stance that padding is a mistake (FORMAT §3, the `number-padding` warning).

## Dependencies

_None._

## Related

- [1 migrate tool for numbered + completed/ collections](1-migrate-tool-for-numbered-completed-collections.md) — migrate, renumber and fix mode each touch numbering and must follow the collection's width
- [2 renumber tool for post-merge number collisions](2-renumber-tool-for-post-merge-number-collisions.md) — migrate, renumber and fix mode each touch numbering and must follow the collection's width
- [8 Fix mode for mechanical validate findings](8-fix-mode-for-mechanical-validate-findings.md) — migrate, renumber and fix mode each touch numbering and must follow the collection's width

## Decisions

- Padding is wanted, for file sorting, and is a per-collection width: unpadded numbers are width 1, `01-` is width 2, `001-` width 3. The number is still the integer value (`01` is initiative 1).
- Tools manage consistency: `create` (and `renumber`) pad new numbers to the collection's width; `validate` flags a file whose padding doesn't match it.
- `validate` warns when the highest number reaches 80% of the width's range — 8 at width 1, 80 at width 2, 800 at width 3 — advising the collection grow its padding by a digit (e.g. to three).
- Growing the width is done by a tool, not by hand: it renames every initiative file and asset folder and rewrites every link to them, like the other sanctioned rewrites (`migrate`, `rename_collection`).
- Inferred from the files, not declared: the collection's width is the padding most of its initiative files use, and any file that doesn't follow the herd gets a warning (e.g. "1-foo.md is unpadded; this collection pads to 2 digits (01-)"). A number too large for the width (`100-` in a width-2 collection) is not a mismatch — the near-end-of-range warning should have come first. A tie, or an empty collection, falls back to the default width.

## Open questions

- What width does a new collection start with — 1 (unpadded, today's behaviour, warned at 8) or 2 (room for 79 before the first warning)? And does `create_collection` take a width?
- Is growing the width its own tool (e.g. `repad`, dry run by default, returning every rename and link rewrite), or an option of `migrate` (initiatives#1), which already plans renames and link rewrites for an adopted folder?

## Acceptance criteria

_What must be true when this is done._

