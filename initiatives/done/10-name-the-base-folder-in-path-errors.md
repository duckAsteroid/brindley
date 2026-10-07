---
type: feature
status: done
updated: 2026-10-07
tags: [adoption, text]
docs_impact:
  - site/reference/validation.md
---
# Name the base folder in path errors

## Goal

Every error or finding that rejects a path (`broken-link`, `status-not-in-folder`, path lookups in tools) states the folder it resolved against, as `complete`'s `docs_impact` check now does — in worktree setups the base is often not the one the caller expects.

## Dependencies

_None._

## Related

- [GitHub #5](https://github.com/duckAsteroid/brindley/issues/5) — the request this came from
- [GitHub #2](https://github.com/duckAsteroid/brindley/issues/2) — the `docs_impact` bug that prompted this, fixed there

## Decisions

- Only when it helps. Errors about a path the caller gave (a tool argument: a ref by path, a collection path, docs_impact) name the repository root they looked under. Findings about links in files don't repeat the root on every line: a broken link whose text isn't already repo-relative (e.g. `../x.md`) shows the repo-relative path it resolves to instead. Whenever another worktree of the repo has the missing file, any message says so, since that is the surprising case.

## Open questions

_None._

## Acceptance criteria

- Errors and findings that reject a path — `broken-link`, `status-not-in-folder`, and path lookups in tools (`resolveRef` by path, `ignore`, `create_collection`) — say which folder they resolved against when that helps, following the decision on this initiative's implementation question.
- When another worktree has the missing file, the message names it, as `complete`'s `docs_impact` check already does.
- Tests cover a broken link and a path lookup in a repo with a second worktree.
