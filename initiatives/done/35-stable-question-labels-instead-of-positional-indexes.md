---
type: feature
status: done
tags: [questions]
updated: 2026-10-30
docs_impact:
  - FORMAT.md
  - MCP-SERVER.md
  - site/reference/mcp.md
  - site/reference/validation.md
  - site/reference/cli.md
  - site/guide/concepts.md
---
# Stable question labels instead of positional indexes

## Goal

Every open question carries a stable label (Q1, Q2, …) written into the file, and the question tools address questions by that label, so resolving or splitting one question never changes which question another reference points at.

## Problem

Agents resolved the wrong question. A question's `index` was its position among the section's list items, and `resolve_question` (which deletes the item) and `split_question` (which inserts parts in its place) renumbered every later question. An agent that listed questions 2, 3 and 4, resolved 2, then asked for "3" settled what had been question 4. `match` avoided this, but every result handed agents the index.

## Design

Labels are described in FORMAT.md §6 (open questions) and MCP-SERVER.md (question tools and "Question labels").

- **The label is written into the file**, bold, as the first thing in the item after any task box:
  `- **Q3** Should an ascending and a descending slot be paired, …` or
  `- [ ] **Q4** (implementation) One shared filter contract for slot listings, …`. The parser
  (`LABEL` in `src/markdown.ts`) matches `**Q<n>**` with optional dotted (`.1`) or lettered (`a`)
  suffixes and strips it before the `(implementation)` check. Bold text that doesn't match, such as
  `- **Blocker:** does the API page?`, is ordinary question text.
- **Tools write labels.** `add_question` gives the next free label (replacing one written in its
  text); `split_question` labels parts under the question's label (Q3 → Q3.1, Q3.2, skipping any
  already used), and Q3 stops naming an open question. Tools write only dotted parts; hand-written
  lettered labels (Q3a) are read the same way, and their parts are dotted (Q3a.1).
- **Labels are never reused in a file.** Decisions are recorded under their label (`- **Q3** …` in
  `## Decisions` or any `record_in` section); ticked questions keep theirs. The high-water mark is
  the highest leading number of any bold label anywhere in the body (Q3.2.1 and Q3a count as 3),
  examples included, and the next free label is one more. Gaps are harmless. A bare `Q3` in prose
  is not a label.
- **Unlabelled questions get provisional labels.** Reads report the labels labelling would write
  (in list order, after the high-water mark) with `provisional: true`. Every question write labels
  the whole file first, so a provisional `id` names the same question; `fix` writes them too
  (rule `question-label`), and `validate` warns `question-unlabelled` until it does. A hand edit
  between a read and a write can shift provisional labels, only until the first write pins them.
- **Tools address questions by label.** `resolve_question` and `split_question` take `id: "Q3"`
  (case and bold markers ignored) or `match`; `next_question` takes `after` as a label. `index` is
  gone from every schema and result: a breaking change, released as a major version. An `id` that
  names a resolved question fails with "Q3 is already resolved: …" and the recorded decision; one
  that names a split question lists its parts; an unknown one lists the open labels.
- `validate` also warns `question-label-duplicate` when one label starts more than one list item.
- The agent snippet tells agents to refer to questions by label and record decisions under it.

## Dependencies

_None._

## Related

- [Questions](../questions.md) — the theme this belongs to

## Decisions

- **Q1** Label syntax is bold `**Q3**`, the first thing in the item after any task box, matched by
  `^\*\*Q\d+(?:[a-z]+|\.\d+)*\*\*\s`.
- **Q2** Splits are numbered dotted (Q3.1, Q3.2.1); hand-written lettered labels (Q3a) are accepted
  everywhere and split dotted (Q3a.1).
- **Q3** `index` is dropped outright and `id` replaces it, as a breaking change (major version).
- **Q4** Only `Q<n>` labels, with the suffixes from Q2; other bold openings are question text.
- **Q5** The high-water mark counts any bold label anywhere in the body, by its leading number.
- **Q6** Reads report provisional labels (`provisional: true`) for unlabelled questions, and a write
  by a provisional `id` labels the file first.

## Open questions

_None._

## Acceptance criteria

- Resolving or splitting a question never changes the label of any other question.
- A label once used in a file is never given to a different question in that file.
- `add_question`, `split_question`, `next_question`, `resolve_question`, `check_ready` and `get`
  report questions by label, and the selecting tools accept `id`.
- `fix` labels unlabelled questions; `validate` warns about unlabelled questions and duplicate labels.
- `index` no longer appears in any tool's input schema or result.
- On a file with unlabelled questions, reads report provisional labels (`provisional: true`), and a
  write addressed by one labels the file first and acts on that question.
- Hand-written lettered labels (Q3a) parse, can be addressed by `id`, count toward the high-water
  mark, and split into dotted parts (Q3a.1).
- FORMAT.md §6, MCP-SERVER.md and the agent snippet describe labels; the examples use them.
- Tests cover: resolve-then-select-next, split, tick mode, a hand-written unlabelled file, and a
  resolved label not being reused.

## Appendix: Rejected alternatives

| Question | Rejected | Why |
|---|---|---|
| Q1 | `Q3:` (plain) | Clashes with real question text ("Q4: which quarter?"). |
| Q1 | `[Q3]` | Sits where a task box goes, and is reference-link syntax. |
| Q1 | A label derived from position when none is written | Just the index under another name. |
| Q2 | Lettered splits (Q3a, Q3b) as the tools' scheme | No obvious rule for splitting a part again. |
| Q2 | Fresh labels (Q7, Q8) with "Q3 split into Q7, Q8" | Loses lineage at a glance and adds a note per split. |
| Q3 | Keep `index` as a deprecated alias for one release | Keeps the wrong-question bug alive; the warning arrives after the wrong question is settled. Callers are agents reading the schema each session, so nothing saved depends on it. |
| Q4 | Free-form labels (`**slot-pairing**`) | Every bold-lead bullet would become a label; no "next free" value; a second hand-kept namespace for little gain over `match`. |
| Q5 | Count only `## Decisions` | Misses ticked questions and other `record_in` sections, so labels would be reused. |
| Q5 | A front-matter counter | Would also survive a decision deleted by hand, but not worth the extra field. |
| Q6 | Report `id: null` and require `match` | The first call on an unlabelled file would differ from every later one. |
