---
type: feature
status: draft
tags: []
updated: 2026-10-07
---
# Show where in-progress work is being built

## Goal

Nothing records which branch or worktree an initiative is being implemented in, so two agents can pick up the same one (FORMAT.md's open question: "Record who/what is implementing an in-progress item … to stop two agents picking up the same one?"). With `use_worktree` (initiatives#18), the move to `in-progress` is written in the worktree's branch, so the main checkout can't see it until that branch merges — recording alone isn't enough. Record the branch when work starts, show it, and look across worktrees and branches — as number coining already does — so `check_ready`, `ready` and `list` report work already in progress elsewhere and refuse to let it be started twice.

## Dependencies

_None._

## Related

- [18 Work on the worktree the agent is implementing in](done/18-work-on-the-worktree-the-agent-is-implementing-in.md) — knows the worktree an agent builds in, and writes the status change there
- [13 Consistent zero-padded numbering](done/13-consistent-zero-padded-numbering.md) — number coining already scans other worktrees, branches and history; this reuses that scan for status

## Open questions

- What is recorded, and when? Proposal: `set_status` → in-progress writes `branch: <name>` (a branch means something to everyone; a worktree path is one machine's), and `complete` or a reopen clears it. Is it recorded when work starts in the main checkout on the default branch too, or only on another branch? And can the agent pass a branch, for one it hasn't created yet?
- How far does the cross-checkout look go, and what does it do? Proposal: other worktrees (working files, so uncommitted starts count) and local and remote-tracking branches, as number coining scans; when another has the initiative in-progress, `check_ready` fails ("being built on feature/lock-gates, worktree ../brindley-wt") and `ready` leaves it out, with `force` to start anyway. Is reading every branch's copy of each initiative fast enough on a big repo, or should it be limited (e.g. branches with commits in the last N days)?
- Where is it shown? Proposal: under the status in the README's Status cell (`in-progress` with `on feature/lock-gates` beneath, as `status_note` is shown), in `get` / `list`, and in the dependency graph label? And should `validate` warn about a `branch:` that no longer exists (merged and deleted while the initiative stayed in-progress)?

## Acceptance criteria

_What must be true when this is done._
