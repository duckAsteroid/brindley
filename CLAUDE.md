## Initiatives (tickets / issues)
Planned work lives in Brindley collections — "initiative", "ticket" and "issue" all mean the same
thing: folders whose `README.md` front-matter contains
`brindley: 1`, holding one Markdown file per initiative, named `<number>-<slug>.md`
(format: https://github.com/duckAsteroid/brindley/blob/main/FORMAT.md).
- Never rename or move initiative files or their asset directories. Status is the `status`
  front-matter field.
- Dependencies are the links under an initiative's `## Dependencies` heading (non-blocking
  links go under `## Related`). Implement only an initiative that is `designed` and whose
  linked initiatives are all `done`. Confirm external (http) dependencies yourself; report any
  you cannot confirm.
- Ask about open questions before implementing; `(implementation)` questions are yours to
  settle — record the decision in the initiative.
- When discussing open questions with the user: one at a time, in open chat (no form or
  multiple-choice prompts), grounded in the actual code (cite `path:line`; say "unclear from
  code" rather than guess), with concrete examples from the real domain. Record each decision
  in the initiative as it is made.
- On completion, in the same commit as the code: update the project docs to describe the code
  as it now is — present tense, no history, no rejected alternatives, no links to initiatives —
  and record `docs_impact` (files updated, or `none: <reason>`); settle the initiative's
  wording, moving rejected alternatives into `## Appendix: Rejected alternatives`; set
  `status: done` and `updated`.
- A spike (`type: spike`) measures what its `## Measures` section asks and records
  `## Findings`; its code stays on its own branch and may become the basis of the real
  implementation, so write it to be built on.
- New initiative: next number in the collection, filename `<number>-<slug>.md`,
  `status: draft`, and a `type` (e.g. `feature`, `bug`, `refactor`).
