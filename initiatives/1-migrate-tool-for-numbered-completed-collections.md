---
type: feature
status: draft
updated: 2026-10-06
tags: [adoption]
---
# migrate tool for numbered + completed/ collections

## Goal

Implement the `migrate` tool specified in MCP-SERVER.md §3 (Setup), so an existing numbered + `completed/` folder can be converted to a Brindley collection in one commit, following FORMAT.md §11. It also removes zero-padding from numbers (`01-foo.md` → `1-foo.md`), rewriting links to the renamed files — fix mode (initiatives#8) deliberately leaves renames to it — and records statuses inferred from the text as decided in initiatives#7.

## Dependencies

_None._

## Related

- [8 Fix mode for mechanical validate findings](8-fix-mode-for-mechanical-validate-findings.md) — fix mode makes in-place text repairs; renames such as removing zero-padding are left to migrate

## Decisions

- `migrate` does only mechanical, unambiguous changes: front-matter from explicit `**Status:**` lines or `## Status` sections (inference as decided in initiatives#7); removing zero-padding and rewriting links to the renamed files (initiatives#8); the generated README index; and turning a bare "`30`" into a link only when it is under `## Dependencies` and exactly one initiative has that number. Anything needing judgement — a dependency it cannot tie to one initiative, an unmappable status word, a cycle — is listed, not guessed; no wording detection ("relates to", "informed by"), consistent with initiatives#4. The agent or person resolves the list, using the advice from initiatives#4/#5. `completed/` stays where it is: status folders are read as-is and links into them resolve, so migrate no longer moves files back and has no `completed/` links to rewrite. Implementing this includes rewriting FORMAT §11 (steps 2, 4, 5) and MCP-SERVER.md's `migrate` row to match.

## Open questions

_None._

## Acceptance criteria

_What must be true when this is done._
