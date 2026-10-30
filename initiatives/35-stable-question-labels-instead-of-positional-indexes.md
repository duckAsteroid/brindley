---
type: feature
status: designed
tags: [questions]
updated: 2026-10-30
---
# Stable question labels instead of positional indexes

## Goal

Every open question carries a stable label (Q1, Q2, …) written into the file, and the question tools address questions by that label, so resolving or splitting one question never changes which question another reference points at.

## Problem

Agents keep resolving the wrong question. A question's `index` is its "1-based position among the section's top-level list items" (`src/model.ts:61`). `resolve_question` deletes the item by default (`src/ops.ts:711`) and `split_question` inserts parts in its place (`src/ops.ts:798`), so both renumber every later question. An agent that lists questions 2, 3 and 4, resolves 2, then asks for "3" settles what was question 4. `match` avoids this but agents reach for the index, which every result hands them (`next_question`, `split_question`'s `open`, `check_ready`'s summary at `src/ops.ts:1346`).

## Design

- **The label is written into the file**, as the first thing in the item after any task box, e.g.
  `- **Q3** Should an ascending and a descending slot be paired, …` or
  `- [ ] **Q4** (implementation) One shared filter contract for slot listings, …`.
  A label derived from position when none is written would just be the index under another name.
- **Tools write labels.** `add_question` and `split_question` label what they add; `fix` (and any
  question write) labels unlabelled questions in a file, in order, with the next free labels.
  Hand-written questions without a label stay valid until then.
- **Labels are never reused in a file.** `resolve_question` records the decision under its label
  (e.g. `- **Q3** Slots in each direction are booked independently — …` in `## Decisions`), so the
  highest Q-number anywhere in the body is the high-water mark and the next free label is one more.
- **Splitting keeps lineage.** Splitting Q3 gives Q3.1, Q3.2, …; Q3 stops existing. Hand-written
  lettered labels (Q3a) are accepted; splitting one gives Q3a.1, Q3a.2.
- **Tools address questions by label.** `resolve_question`, `split_question` and `next_question`
  take `id: "Q3"` (alongside `match`); results report labels, never positions. An id that names a
  resolved question fails with "Q3 is already resolved" and the recorded decision; an unknown id
  fails naming the open labels.

## Dependencies

_None._

## Related

- [Questions](questions.md) — the theme this belongs to

## Decisions

- **Q1** Label syntax is bold: `**Q3**`, the first thing in the item after any task box. The parser matches `^\*\*Q\d+(?:[a-z]+|\.\d+)*\*\*\s` (see Q2 for the suffixes) and strips the label before the `(implementation)` check. Ordinary question text is never bold-wrapped, so a question that merely starts with "Q" is never mistaken for a label; `Q3:` could clash with a real question ("Q4: which quarter?") and `[Q3]` collides with the task-box position and reference-link syntax.
- **Q2** Splits are numbered dotted by default: splitting Q3 gives Q3.1, Q3.2; splitting Q3.2 gives Q3.2.1, Q3.2.2; Q3 stops existing. Answered parts land in `## Decisions` under their dotted label. Hand-written lettered labels (Q3a, Q3b) are accepted as labels everywhere (parsed, addressable by `id`, counted for the high-water mark); tools never write letters, so splitting Q3a gives Q3a.1, Q3a.2. Dotted is the only scheme that re-splits by the same rule at any depth and shows lineage without a "split into" note; fresh labels (Q7, Q8 plus "Q3 split into Q7, Q8") lose lineage at a glance.
- **Q3** `index` is dropped outright from `resolve_question` and `split_question`, and results stop reporting positions; `id` replaces it. This is a breaking change released as a major version (`feat!`). The callers are agents that read the tool schema each session, so no saved call depends on it, and a deprecated alias would keep the wrong-question bug alive for its whole lifetime (a warning arrives after the wrong question is already settled).
- **Q4** Only `Q<n>` labels (with the dotted and lettered suffixes from Q2). A bold opening that doesn't match the Q1 pattern, e.g. `- **Blocker:** does the API support paging?`, is ordinary question text, never a label and never an error. Free-form names would make every bold-lead bullet a label, have no "next free" value for the high-water mark, and add a second hand-kept namespace for little gain over `match`.
- **Q5** The high-water mark is the highest leading number of any bold label matching the Q1 pattern anywhere in the body (Q3.2.1 and Q3a count as 3): open, ticked (`- [x]`), recorded in `## Decisions` or any other `record_in` section, or moved to the rejected-alternatives appendix. Bold labels in examples count too; the cost is a gap in numbering, and labels need only be unique, not contiguous. Bare `Q3` in prose (e.g. "ships in Q3") never counts. Deleting a recorded decision by hand can free its label for reuse; a front-matter counter would close that but is not worth the extra field.
- **Q6** Reads on a file with unlabelled questions report provisional labels: the labels `fix` would assign (in order, after the high-water mark), marked `provisional: true`. A write addressed by a provisional `id` labels the whole file first, then acts on that question, so agents use `id` the same way on labelled and unlabelled files. A hand edit between the read and the write can shift provisional labels; that window exists only until the first write pins them, and `validate` warns about unlabelled questions. Reporting `id: null` and forcing `match` was rejected because the first call would differ from every later one.

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
