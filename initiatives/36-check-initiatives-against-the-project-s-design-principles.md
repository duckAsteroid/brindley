---
type: feature
status: draft
updated: 2026-10-23
---
# Check initiatives against the project's design principles

## Goal

An initiative cannot reach `designed` while it contradicts a declared design principle by accident: agents review it against the collection's principles docs, every conflict becomes a blocking open question, and a deliberate change to a principle is declared in the initiative and lands in the principles doc when the work completes.

## Problem

Agents writing initiatives produce statements and acceptance criteria that contradict, or sit badly with, the architectural principles of the project — the few "god documents" every change should respect. Nothing in Brindley names those documents or asks anyone to check against them, so the contradiction is found late (in review or after implementation), or never, and the principles quietly stop being true.

Brindley has an example of its own. FORMAT §1 "Design principles" (`FORMAT.md:30`) says **Nothing moves** — "tools never move files themselves" — while `tidy` (`MCP-SERVER.md:138`) moves initiatives into status folders for a collection that declares `folders:`. Whether or not that was meant, nothing recorded it as a change to the principle, and the principle now reads as false.

Whether prose contradicts a principle is a semantic judgement the server, being deterministic code with no model, cannot make. Brindley supplies the structure, gates and record — as it does for docs (`check_docs`, `docs_impact`) and questions — and the agent does the reading.

## Design

1. **Principles docs are declared.** The collection README gains `principles:`, a list of paths or
   globs relative to the repo root, each optionally narrowed to a heading
   (`principles: ["FORMAT.md#design-principles", "ARCHITECTURE.md"]`). They are distinct from
   `docs:`: docs describe the code; principles are the small set new work must not contradict.
   `fields` and `collections` report them; `get` lists them for an initiative.
2. **Intended changes are explicit.** An initiative that means to change a principle says so under
   `## Principle changes`: one item per principle, naming it, linking the doc, and stating the new
   rule and why — e.g. "[Nothing moves](../FORMAT.md#design-principles) → tools may move files in a
   collection that opts in with `folders:`". `complete` refuses unless every principles doc linked
   there is in `docs_impact`, so the change ends up in the god doc, which stays the authority.
3. **A review turns conflicts into open questions.** A prompt loads the principles and the
   initiative and has the agent check each claim, constraint and acceptance criterion against them,
   citing principle and initiative line, with one of three verdicts:
   - *consistent* — nothing to do;
   - *conflict* — add a blocking open question: "Keep principle X (and change this initiative), or
     amend X?". Answering "amend" writes the item into `## Principle changes`; the existing rule
     that blocking questions keep an initiative out of `designed` does the gating;
   - *tension* — strains the principle without contradicting it; reported to the user, no question.
   Items already declared under `## Principle changes` are not conflicts.
4. **Principles are read first.** `create`'s result, the agent snippet (FORMAT §9), `design-review`
   and the `implement` brief tell the agent to read the collection's principles before writing or
   building, so fewer contradictions are written in the first place.

## Dependencies

_None._

## Related

- [Stable question labels instead of positional indexes](35-stable-question-labels-instead-of-positional-indexes.md) — conflicts are recorded as open questions

## Open questions

- Is the review its own prompt (`conformance-review`), a first step of `design-review`, or both
  (the step runs the same checklist the prompt does)?
- Does the review leave a record that `check_ready` can test for staleness — e.g. front-matter
  `principles_reviewed: <commit>`, failing when the initiative or any principles doc changed since
  — or is that a follow-up initiative? Without it, nothing stops an initiative edited after review
  from reaching `designed` unchecked; with it, every reviewed initiative gains a field that churns.
- Where are `principles:` declared when collections disagree — per collection only, or also once
  for a repo (which has no repo-level file today, `FORMAT.md` §2)?
- What happens to `tidy` versus **Nothing moves**: a bug fixed separately (amend FORMAT §1 to say
  tools move files only in a collection that opts in with `folders:`), or the worked example this
  initiative's own `## Principle changes` dogfoods?
- (implementation) Heading anchors: match GitHub's slug rules for `#design-principles`, or match
  heading text case-insensitively as the open-questions heading is matched (`FORMAT.md:481`)?

## Acceptance criteria

- A collection README can declare `principles:`; `fields`, `collections` and `get` report them, and
  `validate` reports a declared path or heading that doesn't exist.
- `## Principle changes` is defined in FORMAT §6; `complete` refuses when a principles doc linked
  there is missing from `docs_impact`, naming it.
- The review prompt lists every principle with its verdict and citations, adds a blocking open
  question per conflict, and skips items declared under `## Principle changes`.
- `create`, the agent snippet, `design-review` and the `implement` brief point the agent at the
  collection's principles.
- FORMAT.md, MCP-SERVER.md and the site describe principles and the review; Brindley's own
  `initiatives` collection declares `FORMAT.md#design-principles`.
- A settled decision on how a heading anchor is matched.
