---
type: feature
status: draft
updated: 2026-11-03
---
# Flag commits that close an initiative that isn't done

## Goal

A commit message on main that says it closes an initiative (`Closes initiatives#26`) and a file
that says it is still open must not both stand. Brindley warns when they disagree, so the commit
and the ticket's status are reconciled.

## Background

On GitHub, `Closes #12` in a commit or PR merged to the default branch closes the issue. The
issue's state lives outside the repo, so the commit message is the only link between the change
and the issue, and GitHub acts on it.

Brindley is different: an initiative's status is in the repo (`status:` front-matter, or the
status folder, FORMAT §5), and the project workflow sets `status: done` in the same commit as the
code (FORMAT §7). That commit already closes the ticket, and the file change records it. A
closing keyword adds nothing there. It matters when the two part company:

- someone writes `Closes #26` in a commit but doesn't run `complete` or edit the file, so the
  ticket still says `draft` or `in-progress`;
- the commit is reverted, or the status edit is lost in a merge, so the message says closed and
  the file doesn't.

Acting on the keyword the way GitHub does would mean setting `status: done` from a commit
message. That skips what completion requires (FORMAT §7): settled wording, `docs_impact`, rejected
alternatives moved to the appendix. So the proposal is to **report** the mismatch, not apply it:
a warning naming the commit and the ticket, for a person or agent to settle by completing the
ticket or correcting the record.

Brindley already reads first-parent history on main for the progress report (`src/history.ts`,
one `git log` cached by HEAD), which is where a scan of commit messages would sit.

## Dependencies

_None._

## Related

- [26 Record the merge commit or PR when work is done](26-record-the-merge-commit-or-pr-when-work-is-done.md) — the other direction: from a done ticket to the commit that did it
- [43 Writes no longer regenerate READMEs](done/43-writes-no-longer-regenerate-readmes.md) — another case of git and the files drifting apart

## Open questions

- **Q1** Which commit messages count as closing: GitHub's keywords (`close`, `closes`, `closed`,
  `fix`, `fixes`, `fixed`, `resolve`, `resolves`, `resolved`) followed by an initiative reference,
  a git trailer only (`Closes: initiatives#26`), or both?
- **Q2** How is a bare `#26` read, given GitHub will also act on it as a GitHub issue number: only
  as an initiative when the repo has one collection, never (require `initiatives#26`), or always
  as an initiative?
- **Q3** Which history is scanned: first-parent commits on the default branch only (as the report
  reads), every commit reachable from HEAD, or since a starting point so old messages don't warn
  forever?
- **Q4** Which statuses satisfy a closing commit: only `done`, or any closed status (`abandoned`,
  `superseded`) too, since "fixes" may close a ticket by dropping it?
- **Q5** Where does the warning appear: in `validate` (so CI catches it), in a separate tool, or
  both, and is it ever an error?
- **Q6** Should Brindley also flag the reverse, a ticket that is `done` with no commit naming it,
  or is the commit that set `status: done` record enough?
- **Q7** Do the agent instructions tell agents to write `Closes <collection>#<n>` in the commit
  that completes an initiative, so the message and the file agree from the start?

## Acceptance criteria

- A commit on main whose message closes an initiative that is not in a satisfying status produces
  a warning naming the commit (short SHA and subject) and the initiative.
- Completing the initiative clears the warning; nothing sets a status from a commit message.
- The scan reuses the cached history read, so `validate` on a repo with long history stays fast.
- FORMAT.md, MCP-SERVER.md and the validation reference describe the rule.
