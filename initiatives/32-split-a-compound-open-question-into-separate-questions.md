---
type: feature
status: designed
tags: [questions, text]
updated: 2026-10-09
---
# Split a compound open question into separate questions

## Goal

Agents keep posing several decisions as one open question ("WSJF only, or a general formula? And which ranking does `ready` use?"), which can't be answered, resolved or tracked one at a time. Two parts:

- **Advice:** the server instructions, `add_question` and the `design-review` / `next_question` guidance say one decision per question, and that a compound question should be split before it is discussed.
- **A tool:** `split_question(ref, index | match, into: [...])` replaces one open question with N in its place — same position, in order, each keeping or setting its own `(implementation)` marker — in one write, so the agent doesn't delete and re-add (losing the position and risking a half-done edit). Returns the new questions with their indexes. Refuses a resolved question, or `into` with fewer than two entries.

## Dependencies

_None._

## Related

- [16 Resolve settled questions in bulk](16-resolve-settled-questions-in-bulk.md)

## Decisions

- Yes, with simple heuristics, as warnings an agent may ignore: a question looks compound when its text has more than one "?" outside inline code, or nested list items under it. `add_question` warns when it adds one, and `questions` / `next_question` mark it (`compound: true`) with a hint to `split_question`. Not a `validate` rule — it's advice, not a problem with the file.
- `split_question` takes each part as text or `{ text, implementation?, answer? }`; a part with an `answer` is resolved as it is written — removed from the list and recorded in Decisions (or ticked, with `mode: tick`), as `resolve_question` does — so a partly settled compound question splits and settles in one call. The result lists the parts left open with their new indexes, and the decisions recorded.

## Open questions

_None._

## Acceptance criteria

- [ ] `split_question(ref, index | match, into, mode?, record_in?)` replaces one unresolved open question with its parts in its place and order, in one write; each part is text or `{ text, implementation?, answer? }`.
- [ ] A part with an `answer` is resolved as it is written — recorded in Decisions (or `record_in`), or ticked with `mode: tick` — as `resolve_question` does.
- [ ] It refuses a resolved question, a question it can't find, and `into` with fewer than two parts; a designed initiative left with a blocking open part goes back to draft, as `add_question` does.
- [ ] The result lists the parts left open with their new indexes, and the decisions recorded.
- [ ] A question with more than one "?" outside inline code, or nested list items, is flagged as compound: `add_question` warns, and `questions` / `next_question` mark it `compound: true` with a hint to `split_question`.
- [ ] The server instructions, `add_question`'s description and the `design-review` prompt say one decision per question, and to split a compound one before discussing it.
- [ ] MCP-SERVER.md, FORMAT.md (if the question format's guidance changes) and the MCP reference page describe the tool and the warning.
