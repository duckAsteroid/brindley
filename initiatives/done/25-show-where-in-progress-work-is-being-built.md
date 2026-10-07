---
type: feature
status: done
tags: []
updated: 2026-10-07
docs_impact:
  - FORMAT.md
  - MCP-SERVER.md
  - site/reference/front-matter.md
  - site/reference/validation.md
  - site/reference/mcp.md
  - site/guide/workflow.md
---
# Show where in-progress work is being built

## Goal

Nothing records which branch or worktree an initiative is being implemented in, so two agents can pick up the same one (FORMAT.md's open question: "Record who/what is implementing an in-progress item … to stop two agents picking up the same one?"). With `use_worktree` (initiatives#18), the move to `in-progress` is written in the worktree's branch, so the main checkout can't see it until that branch merges — recording alone isn't enough. Record the branch when work starts, show it, and look across worktrees and branches — as number coining already does — so `check_ready`, `ready` and `list` report work already in progress elsewhere and refuse to let it be started twice.

## Dependencies

_None._

## Related

- [18 Work on the worktree the agent is implementing in](18-work-on-the-worktree-the-agent-is-implementing-in.md) — knows the worktree an agent builds in, and writes the status change there
- [13 Consistent zero-padded numbering](13-consistent-zero-padded-numbering.md) — number coining already scans other worktrees, branches and history; this reuses that scan for status

## Decisions

- `set_status` → in-progress writes `branch:` — the branch checked out where the server is working (main included: it says the work is happening there), or one the caller names with a `branch` argument, e.g. before creating it. Leaving in-progress for any other status (`complete`, a reopen, deferring) removes it.
- Work in progress elsewhere is found with one `git grep` per collection over every other worktree's working files (so an uncommitted start counts) and every local and remote-tracking branch other than the current one and its upstream — no age limit. A match is the same collection and number (whatever its padding or folder there) with `status: in-progress`, while it isn't in-progress in this checkout. Then `check_ready` fails ("being built on feature/x, in worktree ../repo-wt"), `ready` and `list(ready: true)` leave it out, and `set_status` → in-progress refuses unless `force`.
- Shown in the README's Status cell (`on feature/x` under in-progress, beside any `status_note`) and in `get` / `list` (`branch`, and `elsewhere` for work found in another checkout) — not in the dependency graph, to keep node labels short. `validate` warns `branch-missing` about an in-progress initiative whose `branch:` no longer exists locally or as a remote-tracking branch.
- Implementation: src/elsewhere.ts. Work in other worktrees is found with `git grep --untracked` in each (so an uncommitted start counts), branches with one `git grep` across them, both with an extended-regex match on `status: in-progress`; a branch checked out in a worktree is read from that worktree, not its last commit. The result is cached per loaded repo, so `list` and `ready` look once per collection. Starting work on an initiative already in progress elsewhere is refused like the other lifecycle checks, so `force` overrides it.

## Open questions

_None._

## Acceptance criteria

- `set_status` to in-progress writes `branch:` — the current checkout's branch, or `branch` if given; moving to any other status (including through `complete`) removes it.
- A `git grep` per collection finds the initiative in-progress in another worktree's working files or on another local or remote-tracking branch (not the current branch or its upstream), matching collection and number regardless of padding or folder; nothing is reported when it is in-progress in this checkout too.
- When found elsewhere: `check_ready` fails, naming the branch and worktree; `ready` and `list(ready: true)` leave it out; `set_status` → in-progress refuses unless `force`.
- `get` and `list` return `branch` and `elsewhere` (a list of `{ branch, worktree? }`).
- The README's Status cell shows `on <branch>` under in-progress, with any `status_note`.
- `validate` warns `branch-missing` when an in-progress initiative's `branch:` doesn't exist locally or remotely.
- FORMAT §4 (the `branch` field), MCP-SERVER.md, the site's front-matter, validation and MCP references and the workflow guide describe it; FORMAT's open question is ticked. Tests cover recording and clearing the branch, finding work in another worktree and on another branch, the refusals, and the warning.
