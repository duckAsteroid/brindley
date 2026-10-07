---
type: feature
status: draft
updated: 2026-10-07
---
# Opt-in status folders that Brindley keeps in step

## Goal

Brindley never moves files: status lives in front-matter, closed work stays in the collection folder, and status folders (`completed/`, `deferred/`, …) are only read, so links never break (FORMAT §2). Some teams want closed work out of the folder listing. Let a collection opt in, in its README front-matter, to organising initiatives into status folders as well as front-matter: when an initiative's status changes (`set_status`, `complete`), Brindley moves the file — and its asset folder — into the folder for that status and rewrites every link to it, in the same way the other sanctioned rewrites do (`repad`, `rename_collection`). Front-matter stays the source of truth; the folder follows it. Collections that don't opt in keep today's behaviour.

## Dependencies

_None._

## Related

- [13 Consistent zero-padded numbering](13-consistent-zero-padded-numbering.md) — `repad`'s shared rename-and-relink function does the moving
- [3 rename_collection tool](3-rename-collection-tool.md) — the other sanctioned move with link rewriting
- [1 migrate tool for numbered + completed/ collections](1-migrate-tool-for-numbered-completed-collections.md) — reads adopted status folders; an opted-in collection might keep them

## Open questions

- What does opting in look like, and which statuses get a folder? E.g. `folders: { done: completed, deferred: deferred, abandoned: closed, superseded: closed }` in the README — only the statuses listed move, active work stays at the top — or a single switch with fixed folder names?
- When does the move happen — inside `set_status`/`complete` as part of the same call, or only when asked (a `tidy` tool, dry run by default, like `repad`)? And how are files already in the wrong folder (opted in late, or edited by hand) brought into line — `validate` points to the tool, and the tool fixes them all?
- Links into the moved file from outside the repo (other repos, tracker tickets, bookmarks) will break, which is why Brindley doesn't move files today. Is that acceptable for collections that opt in, given the trade-off is theirs to make — and should the README opt-in say so?

## Acceptance criteria

_What must be true when this is done._
