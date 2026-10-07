# The workflow

**draft** → **designed** → **in-progress** → **done**
<br/><small>design it · ready once its dependencies are done · build it · docs updated</small>

## 1. Design it

Create the initiative, then work through its open questions with your agent:

> Let's work through the open questions on sb#22.

The **design-review** prompt runs the conversation the way it should go:

- **one question at a time**, in open chat — never a form or multiple-choice picker;
- **grounded in the code** — the agent reads the classes, queries and tests involved and cites
  them, and says *unclear from code* instead of guessing;
- **concrete examples** from your real domain, not `Foo` and `bar`;
- **a recommendation**, then your decision.

Each decision is written into the initiative as it is made (by default under `## Decisions` — or
any section you name, such as `## Agreed direction`), and the question is removed. When none are
left, mark it **designed**.

## 2. Pick what's next

> What's ready, highest priority first?

`list` with `ready: true` and `order_by: [priority, complexity]` puts the most important, simplest
work at the top; `where` narrows it (`{ priority: [critical, high] }`). See
[Scoring dimensions](/reference/front-matter#scoring-dimensions).

## 3. Check it's ready

> Is sb#22 ready?

`check_ready` confirms the status, that every linked dependency is done, that no blocking
questions remain, that acceptance criteria exist, and that the file has no validation errors.
The implement and spike briefs begin with the same check, and stop if it fails.

## 4. Build it

> Implement sb#21.

The **implement** brief hands the agent the initiative, its dependency report and the rules:
settle any `(implementation)` questions and record them, then finish in the **same commit** as
the code.

If the agent reaches a decision mid-build that the initiative doesn't settle and that matters to
what it builds, it doesn't guess: it adds an ordinary open question and stops to ask. The
initiative stays in-progress — design isn't reopened — and `check_ready` fails until the question
is resolved. `(implementation)` questions are only for choices that are genuinely the
implementer's.

Finishing:

1. **Update the project docs** so they describe the code *as it now is* — present tense, no
   history, no ruled-out alternatives, no links to initiatives.
2. **Settle the initiative's wording** into what was decided and built; move rejected
   alternatives to `## Appendix: Rejected alternatives`.
3. **`complete`** it, stating which docs changed — or `none: <reason>`.

If the agent builds in a git worktree, the brief tells it to call `use_worktree` with the
worktree's path once it exists — so status changes and `complete` land in that branch — and
`use_worktree()` to switch back after merging.

If your repo has its own implementing-agent instructions (worktrees, build commands), point the
collection's `agent:` field at them and the brief tells the agent to follow them.

## Docs say what is; initiatives say why

| | Initiatives | Project docs |
|-|-------------|--------------|
| Describe | a change: why, options, decisions | the system as the code is now |
| Tense | future while open, settled once done | present only |
| Lifetime | frozen once done — the record | edited with every change |

`check_docs` flags history phrasing ("previously", "we added"), design debate and links into
initiatives in your project docs.
