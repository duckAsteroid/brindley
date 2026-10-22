---
type: feature
status: draft
tags: [questions]
updated: 2026-10-22
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
- **Splitting keeps lineage.** Splitting Q3 gives Q3a, Q3b, …; Q3 stops existing.
- **Tools address questions by label.** `resolve_question`, `split_question` and `next_question`
  take `id: "Q3"` (alongside `match`); results report labels, never positions. An id that names a
  resolved question fails with "Q3 is already resolved" and the recorded decision; an unknown id
  fails naming the open labels.

## Dependencies

_None._

## Related

- [Questions](questions.md) — the theme this belongs to

## Open questions

- **Q1** Label syntax: `**Q3**` (bold, reads well rendered), `Q3:` (plain), or `[Q3]` (risks
  looking like a link reference / task box)? The parser must tell it apart from question text that
  happens to start with "Q".
- **Q2** Split numbering: `Q3a`/`Q3b`, `Q3.1`/`Q3.2`, or fresh labels (Q7, Q8) with the decision
  for Q3 recording "split into Q7, Q8"? Matters for a part that is itself split again.
- **Q3** Is `index` dropped outright, or accepted for one release as a deprecated alias that warns?
- **Q4** Are free-form labels allowed (e.g. `**slot-pairing**`) alongside `Q<n>`, or only `Q<n>`?
  Free-form adds a naming step to every question for little gain over the question text.
- **Q5** With `mode: "tick"`, the label stays on the ticked item. Does the high-water mark also
  count `- [x]` items and rejected-alternatives rows, or only `## Decisions`? (Likely "any
  `**Q<n>**` in the body".)

## Acceptance criteria

- Resolving or splitting a question never changes the label of any other question.
- A label once used in a file is never given to a different question in that file.
- `add_question`, `split_question`, `next_question`, `resolve_question`, `check_ready` and `get`
  report questions by label, and the selecting tools accept `id`.
- `fix` labels unlabelled questions; `validate` warns about unlabelled questions and duplicate labels.
- FORMAT.md §6, MCP-SERVER.md and the agent snippet describe labels; the examples use them.
- Tests cover: resolve-then-select-next, split, tick mode, a hand-written unlabelled file, and a
  resolved label not being reused.
