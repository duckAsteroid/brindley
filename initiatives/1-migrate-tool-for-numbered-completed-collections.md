---
type: feature
status: draft
updated: 2026-10-07
tags: [adoption]
---
# migrate tool for numbered + completed/ collections

## Goal

Implement the `migrate` tool specified in MCP-SERVER.md §3 (Setup), so an existing numbered + `completed/` folder can be converted to a Brindley collection in one commit, following FORMAT.md §11. It also makes number padding consistent with the collection's width (initiatives#13), renaming files and rewriting links to them — fix mode (initiatives#8) deliberately leaves renames to it — and records statuses inferred from the text as decided in initiatives#7.

## Dependencies

- [7 Infer a missing status from the initiative's prose](7-infer-a-missing-status-from-the-initiative-s-prose.md) — migrate writes statuses with #7's inference function
- [13 Consistent zero-padded numbering](13-consistent-zero-padded-numbering.md) — migrate pads numbers to the collection's width, which #13 defines

## Related

- [8 Fix mode for mechanical validate findings](8-fix-mode-for-mechanical-validate-findings.md) — fix mode makes in-place text repairs; renames such as making padding consistent are left to migrate

## Decisions

- `migrate` does only mechanical, unambiguous changes: front-matter from explicit `**Status:**` lines or `## Status` sections (inference as decided in initiatives#7); making number padding consistent with the collection's width and rewriting links to the renamed files (initiatives#8, initiatives#13 — padding is kept, not removed); the generated README index; and turning a bare "`30`" into a link only when it is under `## Dependencies` and exactly one initiative has that number. Anything needing judgement — a dependency it cannot tie to one initiative, an unmappable status word, a cycle — is listed, not guessed; no wording detection ("relates to", "informed by"), consistent with initiatives#4. The agent or person resolves the list, using the advice from initiatives#4/#5. `completed/` stays where it is: status folders are read as-is and links into them resolve, so migrate no longer moves files back and has no `completed/` links to rewrite. Implementing this includes rewriting FORMAT §11 (steps 2, 4, 5) and MCP-SERVER.md's `migrate` row to match.

## Open questions

_None._

## Acceptance criteria

- `migrate` (MCP tool and CLI) takes a folder, marks it as a collection if needed, and by default (`dry_run: true`) returns the full plan: front-matter to write, files to rename, links to rewrite, and a list of items needing a decision.
- It records statuses from explicit status lines (initiatives#7), with any trailing qualifier as `status_note`, and leaves existing front-matter values alone.
- It pads every number to the collection's width (initiatives#13) — e.g. `1-foo.md` → `01-foo.md` in a collection that mostly uses `01-` — renaming the matching asset folder too, and rewrites every link to the renamed files.
- Under `## Dependencies`, a bare number such as "`30`" becomes a link only when exactly one initiative in the collection has that number.
- It lists, without changing: dependencies it can't tie to one initiative, unmappable status words, and cycles.
- It does not move files out of `completed/` or other status folders.
- With `dry_run: false` it writes the plan and regenerates the README index; a second run plans nothing.
- FORMAT §11 and MCP-SERVER.md's `migrate` row are rewritten to match; tested on a fixture with mixed padding, a `completed/` folder, both status styles and an ambiguous bare number.
