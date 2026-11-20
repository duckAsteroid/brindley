---
type: feature
status: draft
updated: 2026-11-18
---
# Store a collection's initiatives as GitHub issues

## Goal

A collection can opt in to keeping its initiatives as GitHub issues instead of Markdown files, so design work (drafting, settling questions, status changes) happens on GitHub without adding commits to the code history. Files stay the default backend; every tool works the same against either.

## Dependencies

_None._

## Related

- [https://github.com/duckAsteroid/brindley/issues/5](https://github.com/duckAsteroid/brindley/issues/5)
- [https://github.com/duckAsteroid/brindley/issues/6](https://github.com/duckAsteroid/brindley/issues/6)
- [https://github.com/duckAsteroid/brindley/issues/7](https://github.com/duckAsteroid/brindley/issues/7)
- [26 Record the merge commit or PR when work is done](26-record-the-merge-commit-or-pr-when-work-is-done.md)
- [44 A JSON snapshot that every view renders from](44-a-json-snapshot-that-every-view-renders-from.md)
- [48 Flag commits that close an initiative that isn't done](48-flag-commits-that-close-an-initiative-that-isn-t-done.md)

## Context

Planning makes a lot of commits. Of this repo's 116 commits, 28 change only initiative files (mostly `docs(initiatives): propose…` / `settle…` from design review), and every small design edit has to be committed or left pending in the working tree. On GitHub, issues already track this kind of change: discussion, edits and status sit on the issue's timeline and stay out of `git log`. The link between code and plan survives, because a `Closes #N` commit closes the issue and shows up on its timeline.

Brindley reads and writes the filesystem directly: 13 of the modules in `src/` import `node:fs`, mainly `src/ops.ts`, `src/repo.ts` and `src/server.ts`. Collections are found by walking folders for a README with `brindley: 1` (`src/repo.ts`). The progress report and milestone dates come from `git log` over initiative files (`src/history.ts:126`, `src/report.ts`). Links between initiatives are relative Markdown paths, rewritten by `src/relink.ts`.

Known costs of an issues backend:
- The design text is not versioned with the code: checking out a commit doesn't bring back the design that was built. Issue edit history exists but is outside git.
- Reads and writes need network access and a GitHub token, with rate limits; today `check_ready`, `brief` and `validate` are local and offline.
- Only GitHub is supported, so the file backend stays for every other host.

Proposed shape: a collection opts in from its README front-matter (e.g. `backend: github`, `repo: owner/name`); the README stays a file so collections are still discovered by walking the repo. The body Markdown (Goal, Open questions, Acceptance criteria, Findings, …) moves unchanged into the issue body, so question handling, `brief`, `check_ready` and validation keep working on the same text. Issue numbers become initiative numbers.

## Open questions

- **Q1** How much of the model moves onto GitHub's own features? Either only the body plus status (other front-matter kept in a hidden block in the issue body), or everything mapped natively: type/tags/dimensions as labels or Projects v2 fields, dependencies as GitHub issue dependencies, milestones as GitHub milestones.
- **Q2** How is status represented on the issue: open/closed plus `status:*` labels, or a Projects v2 single-select field (which would need a project per collection)?
- **Q3** What is a collection on GitHub: a whole repo's issues, or the issues carrying a label (several collections per repo)? This decides how issues created outside Brindley are adopted or ignored.
- **Q4** Where do `report` and milestone "reached" dates get their history for an issue-backed collection: the issue timeline events API, or a reduced report without the scope-over-time chart?
- **Q5.1** For an issue-backed initiative, where are the docs update and `docs_impact` recorded: the docs change in the same commit as the code with `docs_impact` written on the issue, or something else?
- **Q5.2** Does `complete` close the issue itself through the API, or leave closing to the `Closes #N` commit when it merges to the default branch?
- **Q6** Can an issue-backed initiative link to (and depend on) a file-backed one and vice versa, and how is the link written in each direction — `owner/repo#N` / issue URL from a file, relative path or blob URL from an issue?
- **Q7** Is there a migration tool that moves an existing file collection into issues (and back), or is the backend chosen only when a collection is created?
- **Q8** (implementation) How the GitHub client authenticates (`GITHUB_TOKEN` env, `gh auth token`, or both) and whether reads are cached per server session.
- **Q9** (implementation) The shape of the store interface and how the ~13 fs-touching modules are moved behind it (one refactor commit before the GitHub backend, or alongside).

## Acceptance criteria

- File storage goes through a store interface; the file implementation behaves exactly as today and the existing tests pass unchanged.
- A collection whose README declares the GitHub backend lists, reads, creates and updates its initiatives as issues in the named repo, through the same MCP tools and CLI.
- Question tools, `brief`, `check_ready` and `validate` give the same results for an initiative whether it is a file or an issue with the same body.
- `complete` on an issue-backed initiative gives the implementer a `Closes #N` line for the commit.
- When the token is missing or GitHub can't be reached, tools say so plainly instead of reporting an empty collection.
- The docs describe how to set up an issue-backed collection and what it doesn't support.
