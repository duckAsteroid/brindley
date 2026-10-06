# Brindley — Format Specification (DRAFT)

*Design fully before anyone digs.*

> Status: **draft**, shaped by real-world use of numbered initiative files and the agents that
> implement them. See Appendix A for what that use showed.
>
> **Brindley** is named after James Brindley, engineer of Manchester's Bridgewater Canal, who
> worked his designs out completely before construction began.

## 1. Purpose

A plain-Markdown, in-repo convention for planning work that AI agents (and humans) can read,
reason over, and act on. Each unit of work is an **initiative**: one Markdown file with a small
block of structured front-matter and a free-form, prose-first body. Initiatives live in git
alongside the code they describe, so planning is versioned, branched, reviewed and merged exactly
like code.

Typical lifecycle:

1. A human and an agent iterate on an initiative's design (on the main branch) until it is
   design-complete.
2. An implementing agent picks up one initiative whose dependencies are done, implements it (e.g.
   in a git worktree), rewrites the initiative to describe what is now true, marks it **done** in the
   same change, and merges back.

### Design principles

- **Works with zero tooling.** A text editor and an agent that reads Markdown are sufficient.
  Tooling makes it easier, never required.
- **Nothing moves.** A file's path never changes after creation, so links to it — and links from it
  to its assets — never break. Status lives in front-matter. Existing layouts that file
  initiatives into status folders (`completed/`, `deferred/`) are still read (§2), but tools never
  move files themselves.
- **Prose first.** Initiatives are design documents. The format standardises only the handful of
  facts tools need (number, status, dependencies); everything else is the author's.
- **Readable on GitHub.** Rendered files and collection READMEs should be useful to a human
  browsing the repo.
- **Small core, versioned.** The format carries a version number so it can evolve.
- **Docs say what is; initiatives say why.** Project documentation describes only the current
  code. History, rationale and rejected alternatives belong in initiatives, never in the docs
  (§7.1).

## 2. Collections and layout

> Examples throughout this spec use a fictional system that lets boat captains book a slot to take
> their boat through a canal lock, ascending or descending.

Initiatives are grouped into **collections** — the larger changesets (themes, epics, tickets)
that individual initiatives belong to. **A collection is a folder you mark as one**, anywhere in
the repo. There is no repo-level file: nothing sits above a collection.

```
docs/initiatives/LOCK-42/slot-booking/             # a collection (marked by its README)
  README.md                                        # marker, collection details + generated index (§8)
  19-boat-identity.md
  20-slot-calendar-and-read-model.md
  21-lock-sensor-import.md
  21-sensor-readings/                              # assets belonging to initiative 21 (§3)
    castlefield-lock-2026-09.csv
  39-paged-slot-listings.md
services/search/plans/                             # another collection, somewhere else entirely
  README.md
  1-query-parser.md
```

**The marker.** A folder is a collection when its `README.md` front-matter contains `brindley`
(the value is the format version):

```yaml
---
brindley: 1                           # marks this folder as a collection (format version 1)
name: slot-booking                    # short name used in references; default: the folder name
title: LOCK-42 lock slot booking      # display name; default: derived from the folder name
summary: Let captains book ascending and descending lock slots online
status: active                        # active | done | abandoned — of the changeset as a whole
owner: locks team
link: https://tracker.example.com/LOCK-42   # external ticket/epic, if any
agent: .github/agents/slot-booking.agent.md # implementing-agent workflow for this collection (§9)
docs: ["services/locks/docs/*.md"]          # what counts as project docs for this collection (§7.1)
types: [feature, bug, refactor, perf, docs, chore, spike]   # initiative types in use (§4.1)
tags:                                       # themes (§4.2)
  notifications: Telling captains about changes to their slots
---
# LOCK-42 lock slot booking

Free-form introduction, above the generated content (§8).
```

Everything except `brindley` is optional. Marking an existing folder — for example one already
full of numbered initiative files — only adds front-matter to its README; nothing moves.

**Identity.** A collection is referred to by its **name**: the `name` field, else the folder name
(`slot-booking`, `plans`). Names must be unique in the repo; when two folders share a name, give
one an explicit `name`. Tools also accept the folder path (`docs/initiatives/LOCK-42/slot-booking`)
wherever a collection is expected.

- Initiatives never declare their collection — it is always the folder they are in. There is no
  `collection:` field to drift out of sync.
- A file is an initiative iff its name matches `<number>-<slug>.md` and it sits in the collection
  folder or one of its immediate sub-folders.
- **Status folders** are read, not required. Sub-folders holding numbered initiatives —
  `completed/`, `deferred/`, `superseded/`, or anything mapped with `statuses:` — are part of the
  collection, and a file without a `status` in its front-matter takes its status from the folder
  name. Front-matter always wins. New work should stay in the collection folder and use
  front-matter, because moving a file breaks the links to it.
- Asset folders (`<number>-…/`) and sub-folders that are collections themselves are not status
  folders. Sub-folders with no numbered files (e.g. `code-review/`) are ignored.
- Collection folders in gitignored paths (such as worktrees under an ignored directory) are not
  collections of this working tree.

**Renaming a collection** means changing its `name` (or, without one, its folder), which breaks
`"<name>#<n>"` references from other collections. Avoid it; when unavoidable, validation catches
the dangling references and a tool can rewrite them.

## 3. Identity, filenames and assets

- Every initiative has a **number**: a positive integer, unique within its collection, allocated
  sequentially (next = highest existing + 1). People say "do 39"; the format keeps that.
- Filename: `<number>-<slug>.md`. No zero-padding (`21-…`, not `0021-…`).
- **The filename is permanent.** Retitling changes the H1 only; the slug is not updated. This is
  the price of never-breaking links.
- **Assets** (fixtures, diagrams, samples) live in a sibling directory whose name starts with the
  same number: `<number>-<anything>/`. Because neither file nor directory ever moves, relative links
  between them stay valid.
- **Referencing** an initiative:
  - same collection: by number in front-matter (`20`), by relative link in prose
    (`[20](20-slot-calendar-and-read-model.md)`);
  - another collection: `"<name>#<number>"` in front-matter (`"plans#1"`), relative link in
    prose (`[query parser](../../../../services/search/plans/1-query-parser.md)`). Tools find every
    collection in the repo, so these are checkable just like same-collection references.

**Collision handling.** Numbers are allocated where design happens — normally the main branch, one
author at a time — so collisions are rare. Tooling should reduce them further by scanning other
worktrees, branches and history before coining a number, and should never reuse the number of a
deleted initiative. When two branches do allocate the same number, it shows
up as two files with the same prefix after merge; validation (§10) flags it and the later one is
renumbered (a tool can do this, rewriting the few links involved).

## 4. Front-matter

YAML front-matter, delimited by `---`. Deliberately small:

```yaml
---
type: feature
status: draft
depends_on: [19, 20, "lib:geo-coords"]
related: [30]
tags: [notifications]
owner: locks/core
updated: 2026-09-24
---
# Lock sensor CSV import
```

| Field        | Required | Type | Notes |
|--------------|----------|------|-------|
| `status`     | yes      | enum | See §5. |
| `type`       | no       | string | Kind of work: `feature`, `bug`, `refactor`, … (§4.1). |
| `status_note` | no      | string | One-line qualifier shown next to the status, e.g. "synchronous impact validation on publish" or "design proposal, no implementation yet". |
| `depends_on` | no       | list | **Hard prerequisites.** An integer is an initiative in this collection; `"<collection>#<n>"` is an initiative in another collection; any other string is an **external** prerequisite (module, other repo) that tools record but cannot check. Default `[]`. |
| `related`    | no       | list | Soft links: "informed by, but does not depend on". Integers or `"<collection>#<n>"`. Never blocks. |
| `owner`      | no       | string | Owning team/module/person. |
| `updated`    | no       | ISO date | Last meaningful change. Tools set it; humans may. |
| `superseded_by` | conditional | integer | Required when `status: superseded`. |
| `tags`       | no       | list of strings | Themes this initiative belongs to, across collections (§4.2). |
| `docs`       | no       | list of paths | Project docs this initiative is expected to change (§7.1). Filled in during design, corrected during implementation. |
| `docs_impact` | on `done` | list of paths, or `none: <reason>` | Project docs actually updated, or an explicit statement that none were affected and why (§7.1). |

- The **title is the document's H1**, not a front-matter field — it is what people edit and what
  GitHub shows.
- The format version is declared once, on the collection (§2), not per file.
- Unknown fields are permitted and must be preserved by tools (extension point).

### 4.1 Initiative types

`type` is a free-form string saying what kind of work an initiative is. Suggested vocabulary:

| Type | Use for |
|------|---------|
| `feature` | New user- or caller-visible capability. |
| `bug` | Behaviour that is wrong today. |
| `refactor` | Internal restructuring with no behaviour change. |
| `perf` | Performance work. |
| `docs` | Documentation-only change. |
| `chore` | Build, dependencies, tooling, CI. |
| `spike` | Time-boxed investigation whose output is knowledge (often new initiatives), not shipped code. |

- A collection may declare its list with `types:` in its README front-matter. When declared, an
  unlisted `type` is a validation warning (typo protection); when not, any string is accepted.
- Type is descriptive only: it never affects readiness or lifecycle rules.
- Tools may use it for grouping and filtering, and an implementing agent may use it to choose a
  commit type (e.g. `feature` → `feat`, `bug` → `fix` in Conventional Commits).

### 4.2 Tags: themes across collections

Three ways initiatives relate, each for a different job:

| Mechanism | Cardinality | Answers |
|-----------|-------------|---------|
| Collection (§2) | exactly one per initiative | *Which changeset is this part of?* |
| `depends_on` / `related` (§4) | specific pairs | *What must come first? What informs this?* |
| `tags` | any number per initiative | *What else, anywhere in the repo, is about the same theme?* |

A tag is a theme that cuts across collections — e.g. `notifications` might cover an initiative
in `LOCK-42/slot-booking` and another in `search-rework`.

- Tags are lowercase kebab-case strings (`slot-pairing`, `accessibility`).
- A collection may declare themes with `tags:` in its README front-matter, as a map of tag →
  one-line description. Declarations from all collections are combined, since themes cut across
  them. Once any collection declares tags, an undeclared tag is a validation warning (typo
  protection) and descriptions are shown in the overview; when none do, any tag is accepted.
- Tags are descriptive only: they never affect readiness or lifecycle rules.

## 5. Status lifecycle

Core statuses (format v1; other words map onto these, see below):

```
draft ──► designed ──► in-progress ──► done
  │           │              │
  ├───────────┴──────────────┴──► abandoned | superseded
  └──► deferred (parked; from any open status, and back)
```

| Status        | Meaning |
|---------------|---------|
| `draft`       | Being designed ("proposed"). |
| `designed`    | Design complete: an implementing agent can act without asking product questions. |
| `in-progress` | Being implemented. |
| `done`        | Implemented and merged; the body describes what is true now (§7). |
| `abandoned`   | Will not be done. |
| `superseded`  | Replaced by another initiative (`superseded_by`). |
| `deferred`    | Parked: not abandoned, not being worked on. Never ready; shown separately. |

**Status words.** Besides the core names, tools accept common aliases — `proposed`,
`exploratory`, `unresolved`, `design` (still designing) → `draft`; `ready`, `design complete`,
`design settled` → `designed`; `in-review`, `wip` → `in-progress`;
`parked`, `on-hold`, `backlog`, `future` → `deferred`; `complete`, `completed`, `implemented` → `done`;
`cancelled`, `rejected`, `dropped` → `abandoned`; `replaced` → `superseded` — and a collection
can map its own words in its README front-matter:

```yaml
statuses:
  spiked: designed      # this collection's word → core status
  archive: done         # also works as a status folder name
```

The word as written is kept for display ("draft (proposed)"); behaviour follows the core status.

**Readiness is derived, never stored.** For an initiative with `status: designed`, each entry in
`depends_on` is classified as:

| Classification | Meaning |
|----------------|---------|
| satisfied      | initiative dependency (same or other collection) with `status: done` |
| blocking       | initiative dependency not yet `done` |
| external       | other string dependency — cannot be checked; must be confirmed by the implementer |

The initiative is **ready** when nothing is blocking. External dependencies don't block readiness
but are always surfaced to the implementing agent. Storing readiness would mean rewriting dependants
whenever a dependency completes — the problem this format exists to avoid.

Transition rules:

- `draft → designed` requires no unresolved blocking open questions (§6).
- Moving backwards (e.g. `designed → draft` when a new question surfaces) is allowed.
- `done` is set **in the same commit as the implementation**, so status and code land together.

## 6. Body

The body is free-form prose. Recommended sections, roughly in order (names are conventions, not
requirements, except where marked):

| Section | Purpose |
|---------|---------|
| `## Goal` or `## Context` | What and why. |
| `## Dependencies` | **Narrative** for `depends_on`/`related`: *why* each is needed (e.g. "for the slot schema, booking lifecycle, and boat read model"). Front-matter is authoritative for *what*; this section explains it. |
| design sections | Whatever the initiative needs: proposed direction, mappings, compatibility, failure behaviour, testing… |
| `## Open Questions` *(defined)* | Task list of undecided points (below). |
| `## Acceptance criteria` *(defined)* | Bullet list of verifiable outcomes. The implementing agent's definition of done. |

**Open questions** are list items under a heading named `Open questions` (matched
case-insensitively):

```markdown
## Open questions

- Must captains with a booked slot be re-notified when a lock's opening hours change, or is
  updating the published timetable enough?
- Should an ascending and a descending slot be paired, so the descending boat uses the water level
  the ascending boat leaves behind, or are slots in each direction booked independently?
- (implementation) One shared filter contract for slot listings, or per-endpoint typed filters?
- [x] Slot length? — 20 minutes per lock cycle, see Design.
```

- Each top-level list item is one question. Items may run over several lines and contain inline
  context, links and code — questions are often paragraphs, not one-liners.
- A plain bullet (`-`) or an unchecked task (`- [ ]`) is **unresolved**.
- **Resolving** a question, preferred: delete the item and record the decision where it belongs in
  the body (e.g. an `## Agreed direction` or `## Decisions` section, or a row in a rejected
  alternatives table). This keeps the document describing what is decided, not the history of
  deciding it. Alternative: keep it as `- [x] … — answer`.
- A question prefixed `(implementation)` is **deliberately delegated to the implementer** and does
  not block `designed` — including fact-finding the implementer can do better (e.g. "volumes are
  *unclear from code*"). It should be mirrored by an acceptance criterion requiring the decision to
  be settled and recorded (e.g. "A settled decision on …").

## 7. Completion

When an initiative becomes `done`, the implementer, in the same commit as the code:

- updates the project docs (§7.1) and records `docs_impact`;
- rewrites the main body into a concise, settled account of what was decided and built (no
  "we will"), pointing at the current-state docs for the detail;
- moves rejected alternatives and design debate into a final `## Appendix: Rejected alternatives`
  — kept, not deleted, but out of the way of the main account;
- keeps acceptance criteria and constraints unless they are preserved in the docs;
- sets `status: done` and `updated`.

A completed initiative is therefore the permanent **why** record for its change: the main body
says what was decided, the appendix says what was ruled out and why. The project docs say what
is (§7.1) and never repeat either.

```markdown
# Opening-hours change impact
… settled summary of the agreed direction, links to services/locks/docs/ …

## Acceptance criteria
…

## Appendix: Rejected alternatives
| Option | Why rejected |
|--------|--------------|
| Re-notify every captain with any future booking | Floods captains whose slots are unaffected by the change. |
```

The file stays where it is. Nothing else in the collection is edited, except the generated
README content.

### 7.1 Project documentation describes only what is

Two kinds of document, with a strict division of labour:

| | Initiatives | Project docs |
|-|-------------|--------------|
| Describe | A change: why, options, decisions, rejected alternatives, acceptance criteria | The system as the code currently is |
| Tense | Future while open; settled once done | Present only |
| Lifetime | Frozen once done — a record | Edited with every change that affects it |
| Audience | People and agents deciding or implementing a change | Anyone using or changing the code today |

Which files are project docs is declared by `docs:` globs in each collection's README front-matter.
Files inside collection folders are never project docs.

Project docs must:

- **say what exists, how callers use it, its constraints and failure modes** — succinctly;
- **contain no history:** no "previously", "now", "was changed to", "we added", "introduced
  in", "no longer", "originally", "new"/"old" as time markers;
- **contain no ruled-out alternatives or design debate** — those stay in the initiative;
- **not link to initiatives** — docs must stand on their own as the code changes after the
  initiative is frozen. (Initiatives link to docs, never the reverse.);
- **say *unclear from code*** rather than guess, when the code does not establish a fact.

Every completed initiative records `docs_impact`: the doc files updated in the same commit, or
`none: <reason>` (e.g. `none: internal refactor, no public contract or data-shape change`). Silence
is not allowed — the implementer must decide and state, which is what keeps docs from drifting.

## 8. Generated README content

Each collection's `README.md` is its human entry point: front-matter (§2), a free-form
introduction written by people, plus a **generated block** that tools keep current:

```markdown
<!-- brindley:generated:begin — do not edit by hand; regenerate instead -->
…
<!-- brindley:generated:end -->
```

Rules for the generated block:

- **Entirely derived** from front-matter and H1s. Nothing in it is a source of truth.
- **Deterministic.** Same inputs, byte-identical output: stable ordering (by number), no
  timestamps, no counts that depend on when it ran. Regenerating an up-to-date README produces no
  diff, so it never causes churn or spurious merge conflicts.
- **On merge conflict**, discard both sides and regenerate — never hand-merge it.
- **Outside the markers is never touched** by tools.
- A repo with no tooling can omit the markers and maintain the README by hand.

### 8.1 Collection README

1. **Active** table — every initiative not `done`/`abandoned`/`superseded`:

   | # | Initiative | Type | Status | Ready / blocked by | Open Qs | Owner |
   |---|------------|------|--------|--------------------|---------|-------|
   | 21 | [Lock sensor CSV import](21-lock-sensor-import.md) | feature | designed | ✅ ready · ext: `lib:geo-coords` | 0 | — |
   | 22 | [Opening-hours change impact](22-opening-hours-change-impact.md) | feature | draft | ⛔ 23 | 7 | `locks/core` |
   | 39 | [Paged slot listings](39-paged-slot-listings.md) | perf | draft | — | 0 (+2 impl.) | `locks/api` |

   `status_note`, when present, is shown under the status.

2. **Dependency graph** (Mermaid) — see §8.3.

3. **Completed** table — `done` initiatives (#, linked title, `updated`); then a short
   **Closed** list for `abandoned`/`superseded` (with `superseded_by`).

### 8.2 Overview of all collections

Because nothing sits above a collection, the repo-wide overview is generated on demand by tools
(the MCP server serves it as a resource) rather than written to a file:

1. **Collections** table: name (linked to its README), title, collection status, counts by
   initiative status, number ready.
2. **Cross-collection graph** (Mermaid): one node per collection with active work, an edge
   wherever an initiative in one depends on an initiative in another (labelled with the
   initiative numbers).
3. **Themes**: one sub-section per tag in use (declared description first), listing every
   initiative with that tag across all collections — `name#n`, linked title, type, status —
   active first, then done. This is the "show me everything about notifications" view.

### 8.3 Mermaid dependency graph

GitHub renders ```` ```mermaid ```` blocks natively, so the graph is a plain fenced block:

````markdown
```mermaid
flowchart LR
  n19["19 Boat identity"]:::done
  n20["20 Slot calendar and read model"]:::done
  n21["21 Lock sensor CSV import"]:::ready
  n22["22 Opening-hours change impact"]:::draft
  n23["23 Passage recorded event"]:::designed
  n44["44 Timetable publication impact checks"]:::draft
  x1{{"lib:geo-coords"}}:::external
  n19 --> n21
  n20 --> n21
  x1 --> n21
  n23 --> n22
  n22 -.-> n44
  classDef done fill:#e6e6e6,color:#777,stroke:#bbb
  classDef draft fill:#fff,stroke:#999,stroke-dasharray:4 3
  classDef designed fill:#e8f0fe,stroke:#4a7bd0
  classDef ready fill:#d9f2e3,stroke:#2e8b57,stroke-width:2px
  classDef inprogress fill:#fff4d6,stroke:#d49a00,stroke-width:2px
  classDef external fill:#fafafa,stroke:#999
```
````

- Edges point **from prerequisite to dependant** (arrow = "unblocks"). `related` links are
  dotted; `depends_on` links are solid.
- Node class reflects derived state: `ready` (designed with nothing blocking) is shown distinctly
  from merely `designed`.
- **Scope:** all active initiatives, plus any `done` initiative that an active one depends on
  (greyed, so the edge is visible). Other completed work is omitted — it would swamp the graph.
- External dependencies are hexagon nodes; initiatives in other collections are labelled
  `<collection>#<n>`.
- Graphs over ~40 nodes may be split into connected components, one block each.

## 9. Agent instructions

Two layers:

1. **Format rules** — generic, identical in every adopting repo. A snippet adopters paste into
   `AGENTS.md`/`CLAUDE.md` (or that tooling provides):

   ```markdown
   ## Initiatives
   Planned work lives in collections: folders whose `README.md` front-matter contains
   `brindley: 1`, one Markdown file per initiative. Format spec: <link>.
   - Never rename or move initiative files or their asset directories. Status is the
     `status` front-matter field.
   - Implement only an initiative that is `designed` and whose numbered `depends_on` are all
     `done`. Confirm string (external) dependencies yourself; report any you cannot confirm.
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
   - New initiative: next number in the collection, filename `<number>-<slug>.md`,
     `status: draft`, and a `type` (e.g. `feature`, `bug`, `refactor`).
   ```

2. **Repo workflow** — specific to the project: verification commands, docs to keep current,
   worktree/branch conventions, commit rules. Lives in a repo agent file, referenced from each
   collection's `agent:` field (collections may share one file or each have their own).

## 10. Validation rules

Errors:

1. Initiative numbers unique within a collection (catches post-merge collisions).
2. `status` present and in the core set; dates ISO-8601.
3. Every initiative reference (integer or `"<collection>#<n>"`) in `depends_on`/`related`/
   `superseded_by` refers to an existing initiative.
4. The `depends_on` graph across all collections is acyclic.
5. `status: superseded` has `superseded_by`.
6. Collection names are unique in the repo.

Warnings:

7. `status: designed` with unresolved non-`(implementation)` open questions.
8. `status: in-progress`/`done` with unresolved open questions.
9. Relative links that do not resolve.
10. Asset directories whose number matches no initiative.
11. Missing H1.
12. A collection README's generated block is out of date.
13. Collection `status: done` while any of its initiatives is still `draft`/`designed`/`in-progress`.
14. `status: done` without `docs_impact`.
15. A project doc (per `docs:` globs) that links into a collection folder.
16. History phrasing in a project doc (heuristic — see §7.1 list).
17. `type` not in its collection's `types:` list, when one is declared.
18. A tag not declared by any collection's `tags:`, when any are declared; or a tag that isn't kebab-case.
19. Front-matter status contradicts the status folder the file is in.
20. The collection files a status in a status folder (e.g. done in `completed/`), but this file
    with that status is elsewhere.
21. A status written in the body (`**Status:** …` or `## Status`) disagrees with the file's status.
22. A zero-padded number (`01-…`).

Broken-link warnings name the new location when the linked file has moved within the collection.

## 11. Migration from the numbered + `completed/` layout

1. Mark the folder as a collection: add `brindley: 1` (and any details) to its README
   front-matter.
2. Move `completed/*` back into the collection with `status: done`.
3. Convert status/owner/last-updated metadata into front-matter. Both styles seen in practice
   must be recognised:
   - sections: `## Status` / `## Owner` / `## Last updated` followed by a paragraph;
   - bold lead-in lines: `**Status:** …`, `**Owner module:** …`, `**Last updated:** …`.

   Map status wording to the enum (e.g. "Proposed." / "`draft`" → `draft`); any trailing
   qualifier ("-- synchronous impact validation on publish", "— design proposal, no
   implementation yet") becomes `status_note`.
4. Extract numbered dependencies from `## Dependencies` into `depends_on`/`related`, and
   non-initiative prerequisites into string entries. Keep the narrative section.
5. Rewrite every `completed/…` link **once**, and replace the hand-written README tables/graph with
   the generated index — all in a single migration commit.

## Open Questions

- [x] **Name** — Brindley; collection marker key `brindley:`.
- [x] Status mapping — `deferred` joins the core set; common words are aliases; collections can
      map their own words with `statuses:`; legacy status folders are read (§2, §5).
- [x] Cross-collection dependencies — `"<name>#<n>"`, checkable because tools find every collection (§3).
- [x] Where do initiatives live? — in any folder marked as a collection by its README; there is no
      repo-level root or config file (§2).
- [x] **Name for a collection** — "collection": deliberately vague, so it fits themes, epics, tickets or changesets alike.
- [x] Number scope — unique **per collection**. Each changeset counts from 1, existing numbering
      migrates unchanged, and `"<collection>#<n>"` disambiguates across collections.
- [ ] Is a front-matter-free mode worth supporting (status as a `## Status` section, as today), or
      is front-matter acceptable to adopters?
- [ ] Should `done` record the implementing merge commit or PR? (A commit can't contain its own
      SHA; the merge commit could be recorded by a follow-up, or a PR URL used.)
- [ ] Record who/what is implementing an `in-progress` item (branch/worktree name) to stop two
      agents picking up the same one?
- [x] What happens to rejected alternatives on completion? — they move into a final
      `## Appendix: Rejected alternatives` in the completed initiative (§7).
- [ ] Typed relations? One initiative may be "generalised by" another, or "hand over" a case to
      another. A plain `related` list loses the direction and kind; e.g.
      `related: [{to: 44, as: generalised-by}]`
      would let the index show it. Worth the extra syntax?
- [ ] Should the format require the question list to be a task list (`- [ ]`) for reliable
      parsing, or accept plain bullets as real-world files use? (Currently: accept both.)

## Appendix A — What real-world use showed

This format grew out of an existing practice: numbered Markdown initiatives in a repo, moved into
a `completed/` folder when done, with hand-maintained README tables and dependency graphs, and an
implementing agent that works in a git worktree. What that practice showed, and how it shaped the
spec:

| Observation | Effect on this spec |
|-------------|---------------------|
| Moving finished initiatives into `completed/` breaks every link to them, forcing mass rewrites. | Nothing moves; status is front-matter (§1, §5). |
| Initiatives live in nested, ticket- or theme-scoped directories, each with a hand-maintained README summary table and dependency graph. | Collections are marked folders, wherever they live (§2); generated README content (§8) replaces the hand-maintained tables/graph — the second mass-rewrite target. |
| Numbers are used conversationally ("do 39", "completed `30`"), unpadded. Design happens on main. | Sequential numbers kept; random IDs rejected (§3). |
| Initiatives link to their own asset directories (fixtures, samples). | Asset directory rule (§3). Moving files would also break these links. |
| Dependencies mix initiatives, external modules, and soft "informed by but does not depend on" links, each with a reason. | `depends_on` with integer + string entries, `related`, and a kept narrative section (§4, §6). |
| Status wording drifts across files ("Proposed.", "`draft` — design proposal…", `**Status:** Proposed -- <qualifier>`), as sections or bold lead-in lines. | Closed status enum in front-matter, `status_note` for the qualifier; migration recognises both metadata styles (§4, §5, §11). |
| Many initiatives have no Open Questions section; some deliberately leave decisions to the implementer via acceptance criteria. | Open questions stay optional; `(implementation)` questions don't block `designed` (§6). |
| Where present, open questions are plain, multi-sentence bullets under `## Open questions`, some fact-finding ("unclear from code"). Settled points move into an "Agreed direction" section or a rejected-alternatives table rather than being ticked off. | Heading matched case-insensitively; plain bullets = unresolved; multi-line items; preferred resolution is "delete the question, record the decision in the body" (§6). |
| Relationships come in several kinds in prose: depends on, relates to, hands a case over to, is generalised by. | `related` covers all non-blocking kinds; the prose explains which. Typed relations deferred (Open Questions). |
| Initiatives end with `## Acceptance criteria`, which the implementing agent treats as the definition of done. | Acceptance criteria are a defined section (§6). |
| The agent rewrites a completed initiative into current-state wording, and must decide and state which project docs it updated. | Completion rules and `docs_impact` (§7). |
| The agent file mixes generic lifecycle rules with repo-specific workflow (build tool, docs, worktrees). | Two-layer agent instructions (§9); collection `agent:` pointer. |
