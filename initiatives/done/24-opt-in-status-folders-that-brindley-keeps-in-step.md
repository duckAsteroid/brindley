---
type: feature
status: done
updated: 2026-10-07
docs_impact:
  - FORMAT.md
  - MCP-SERVER.md
  - site/reference/mcp.md
  - site/reference/cli.md
  - site/reference/front-matter.md
  - site/reference/statuses.md
  - site/reference/validation.md
  - site/guide/adopting.md
---
# Opt-in status folders that Brindley keeps in step

## Goal

Brindley never moves files: status lives in front-matter, closed work stays in the collection folder, and status folders (`completed/`, `deferred/`, …) are only read, so links never break (FORMAT §2). Some teams want closed work out of the folder listing. Let a collection opt in, in its README front-matter, to organising initiatives into status folders as well as front-matter: when an initiative's status changes (`set_status`, `complete`), Brindley moves the file — and its asset folder — into the folder for that status and rewrites every link to it, in the same way the other sanctioned rewrites do (`repad`, `rename_collection`). Front-matter stays the source of truth; the folder follows it. Collections that don't opt in keep today's behaviour.

## Dependencies

_None._

## Related

- [13 Consistent zero-padded numbering](13-consistent-zero-padded-numbering.md) — `repad`'s shared rename-and-relink function does the moving
- [3 rename_collection tool](03-rename-collection-tool.md) — the other sanctioned move with link rewriting
- [1 migrate tool for numbered + completed/ collections](../01-migrate-tool-for-numbered-completed-collections.md) — reads adopted status folders; an opted-in collection might keep them

## Decisions

- Opting in is an explicit status → folder map in the collection README, e.g. `folders: { done: completed, abandoned: closed, superseded: closed, deferred: deferred }`. Only listed statuses move; active work (draft, designed, in-progress) always stays at the top of the collection. Several statuses may share a folder, and teams keep their own folder names. Once declared, the map is what `status-not-in-folder` checks, replacing its guess from the folders present. A folder named in the map is read as its status(es) without a separate `statuses:` entry; front-matter still decides when a folder holds more than one.
- The move happens in the same call that changes the status — `set_status`, `complete`, and `update`'s status recording (initiatives#6) — moving the file and its asset folder and rewriting every link to them with the shared planner (initiatives#13); the result lists what moved. Reopening moves it back: a done initiative set to draft returns to the top of the collection. Files already out of place (opted in late, or edited by hand) are brought into line by a `tidy` tool, dry run by default like `repad`, which `status-not-in-folder` points to. Fix mode (initiatives#8) still never moves files.
- With `folders:` declared, every status has a home: a listed status, its folder; anything unlisted, including all active work, the top of the collection. `status-not-in-folder` warns in both directions — a done initiative still at the top, a reopened draft still in `completed/` — and points to `tidy`.
- Links from outside the repo (tickets, other repos, bookmarks) to a moved file are not a concern: moves rewrite every link inside the repo, and nothing more is needed — no warning when opting in, in `tidy`'s plan or on each move, and no stub file left at the old path.
- Implementation: src/folders.ts reads `folders:` and works out each status's home and the moves; moves use the shared planner (src/relink.ts), which now creates a missing target folder. A move is worked out before anything is written, so one that would overwrite a file is refused first. `batch_update` moves too, like the other status-changing calls. A folder that several statuses share (`closed`) doesn't give a status to a file without one — front-matter decides there. `status-not-in-folder` keeps its old guess for collections without `folders:`.

## Open questions

_None._

## Acceptance criteria

- A collection README's `folders:` maps statuses to folder names (several statuses may share one). Without it, nothing changes: Brindley never moves files.
- With it, `set_status`, `complete` and `update`'s status recording move the initiative — and its asset folder — into the folder for its new status, or back to the top of the collection for a status not listed (e.g. reopened), rewriting every link to them across the repo with the shared planner; the result lists the moves and link rewrites. A move that would overwrite an existing file is refused before anything changes.
- A folder named in `folders:` is read as its status(es) for a file without a front-matter status, with no `statuses:` entry needed.
- `status-not-in-folder` uses the map when declared: every listed status belongs in its folder and everything else at the top, so it warns both ways (a done initiative at the top, a draft in `completed/`), and points to `tidy`.
- A `tidy` tool (and `brindley tidy <collection> [--write]`) moves every initiative of a collection with `folders:` to its status's home, rewriting links; dry run by default, returning each move and link rewrite. It refuses a collection without `folders:`.
- `validate` warns about a `folders:` entry naming something that isn't a status or alias.
- FORMAT §2 and the site's front-matter and validation references describe the setting; MCP-SERVER.md and the site's MCP and CLI references describe `tidy`. Tests cover moving on done, abandon and reopen, asset folders and links moving too, `tidy` with a dry run, both directions of the warning, and the refusals.
