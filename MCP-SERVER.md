# Brindley MCP Server — Design Spec (DRAFT)

*Design fully before anyone digs.*

> Status: **draft**. Reference tooling for the format defined in [FORMAT.md](FORMAT.md). The
> format must remain usable without this server.

## 1. Goals

- Make the convention **trivial to adopt** in any repo (mark a folder as a collection + one entry
  in the agent's MCP config).
- Give agents **structured, safe operations** over initiatives so they don't hand-edit
  front-matter, mis-number files, or forget lifecycle rules.
- Answer the questions people actually ask: *what's ready? what's blocked, and on what? what's
  still undecided?*
- **Never require mass rewrites.** Every write touches only the initiative being changed, plus the
  generated block in that collection's README (tables + Mermaid graph, §6.1).
- **Shrink repo agent files** to repo-specific workflow. In a typical implementing agent,
  step 1 (validate dependencies) becomes one `get` call, and step 6 (move to `completed/`, update
  README table and graph) becomes one `complete` call (see Appendix A).

### Non-goals (v1)

- **No git writes.** No worktree creation, branching, committing or merging. (Read-only git
  queries are used for number allocation — §6.) That workflow is
  project-specific (see the agent file's steps 2, 8, 9) and stays in the repo's agent file. The
  server reads and writes files in the working tree it runs in. (Revisit in v2 — Open Questions.)
- No launching or orchestrating agents.
- No UI beyond the generated README content (tables + Mermaid graphs).
- No state outside the repo.

## 2. Runtime and distribution

- **Language:** TypeScript on Node, using the official MCP TypeScript SDK.
- **Transport:** stdio.
- **Install:** `npx -y brindley` — no global install, nothing added to the repo's build.
- **Repo:** the nearest git root above the server's working directory. A server started inside a
  worktree therefore operates on that worktree's files — which is what an implementing agent wants.
- **Collections** are found on every call by scanning the repo for `README.md` files whose
  front-matter has `brindley` (FORMAT §2), using `git ls-files` so gitignored paths (including
  worktrees under ignored folders) are skipped. There is no repo-level config file. With no
  collections yet, tools return empty results with a note pointing at `create_collection`.
- **Writes** go only to collection folders: initiatives and collection READMEs. Project docs are
  written by the agent, never the server; outside collections the server only *reads* project
  docs matched by `docs:` globs (for `check_docs`) and git metadata (§6).

```json
{
  "mcpServers": {
    "brindley": { "command": "npx", "args": ["-y", "brindley"] }
  }
}
```

### Addressing

- A **collection** is addressed by its name (`slot-booking`) or its folder path relative to the
  repo root (`docs/initiatives/LOCK-42/slot-booking`). Tools take an optional `collection`
  param; it can be omitted when the `ref` is unambiguous.
- An **initiative** is addressed by `ref`: `"<name>#<number>"`, a bare number (`39`), or a
  path. A bare number is resolved within `collection`, or across the repo if unambiguous;
  otherwise the error lists the candidates.

### Server instructions

On connect the server sends MCP `instructions`: a short summary of how Brindley sees a repo —
collection markers, initiative files and references, status resolution and aliases, `ignore:`,
never moving files, and how to discuss open questions — so an agent can use the tools correctly
without reading this spec.

## 3. Tools

All tools return structured JSON plus a short text rendering.

### Setup

| Tool | Params | Behaviour |
|------|--------|-----------|
| `create_collection` | `path`, `name?`, `title?`, `summary?`, `owner?`, `link?`, `agent?`, `docs?`, `types?`, `tags?` | Marks a folder as a collection: adds `brindley: 1` and the given details to its README front-matter, creating the folder and README if needed and keeping any existing README text. Works on a folder already full of numbered initiatives. Refuses a name already used by another collection. For the repo's first collection, also returns the format-rules agent snippet (FORMAT §9) to add to `AGENTS.md`/`CLAUDE.md`. `create` given a new folder path does the same implicitly. |
| `ignore` | `collection`, `add?`, `remove?`, `dry_run?` | Adds or removes the collection's `ignore:` patterns (`.gitignore` semantics, FORMAT §2) without rewriting the whole list. Returns the resulting patterns, every numbered file now ignored, and what changed; `dry_run` previews without writing. |
| `update_collection` | `collection`, `status?`, `title?`, `summary?`, `owner?`, `link?`, `agent?`, `docs?`, `types?`, `tags?` | Edits the collection README's front-matter, including the changeset's status (`active` / `done` / `abandoned`; warns when marking `done` with unfinished initiatives). Refuses to change `name`, since references would break. |
| `rename_collection` | `collection`, `to` | Moves the folder and rewrites `"<collection>#<n>"` references and relative links that point into it — the only other sanctioned multi-file rewrite besides `migrate`. |
| `migrate` | `collection`, `dry_run = true` | Converts a numbered + `completed/` collection (FORMAT §11). Infers front-matter from status/owner/last-updated metadata (as `## Status` sections or `**Status:**` lead-in lines) and from `## Dependencies` / "Relationship to" prose; anything it can't map confidently is listed for a human/agent to decide rather than guessed. Dry run returns the full plan (moves, front-matter, link rewrites). The **one** sanctioned mass-rewrite. |

### Reading

| Tool | Params | Returns |
|------|--------|---------|
| `collections` | — | Every collection: name, folder path, details, counts by initiative status, number ready, and the numbered files it ignores. |
| `version` | — | The server's version (from git tags + Conventional Commits) and build commit. |
| `list` | `collection?`, `type?`, `status?`, `tag?`, `owner?`, `ready?` | Across the whole repo unless `collection` is given. Summaries: number, title, type, status, owner, `ready`, blocking deps, open question counts. |
| `get` | `ref` | Front-matter, title, body, parsed open questions and acceptance criteria, plus a **dependency report**: each dependency link classified `satisfied` / `blocking` / `external` (FORMAT §5), with the dependency's title and path; related links; dependants. This is the implementing agent's "select and validate" step in one call. |
| `ready` | `collection?`, `type?` | Across the repo unless `collection` is given. Initiatives that are `designed` with nothing blocking (including cross-collection deps), in suggested order (topological, then number), each with its external deps listed. |
| `graph` | `collection?`, `ref?`, `tag?`, `include_done = false` | Dependency graph as adjacency list + Mermaid. With `tag`, the graph of that theme across all collections. |
| `tags` | — | Every tag in use (plus declared-but-unused ones), with description, initiative counts by status, and the theme overview doc if there is one (FORMAT §4.2). `get` also lists the theme docs for an initiative's tags, and the `design-review` / `implement` prompts tell the agent to read them. |
| `questions` | `collection?`, `ref?`, `include_implementation = true` | Unresolved open questions, grouped by initiative. |
| `check_docs` | `paths?` | Lints project docs (default: those changed vs `HEAD`, else all matching `docs:`) against FORMAT §7.1: history phrasing, rejected-alternative/debate wording, links into collection folders. Returns findings with file/line and the offending phrase. Heuristic; warnings only. |
| `next_question` | `ref`, `after?` | The next unresolved question in one initiative, with its index, related body sections and count remaining. Drives `design-review` (§5.1). |
| `validate` | `collection?` | FORMAT §10 results: errors and warnings with file/line. Suitable as a CI check. |

### Writing

Every write preserves unknown front-matter fields and the author's Markdown formatting, sets
`updated`, and touches only the target file plus the generated README blocks (§6.1).

| Tool | Params | Behaviour |
|------|--------|-----------|
| `create` | `collection` (a name, or a folder path — a new folder is marked as a collection), `title`, `type?`, `tags?`, `goal?`, `depends_on?`, `related?`, `owner?` | Coins the next number by repo scan (§6), writes `<n>-<slug>.md` with `status: draft`, H1, and a section skeleton (Goal, Dependencies, Open Questions, Acceptance criteria). `depends_on`/`related` (refs like `ese#22`, or URLs) become relative links under `## Dependencies` / `## Related`. |
| `update` | `ref`, `title?`, `type?`, `owner?`, `tags?`, `section?`, `content?` | Edits front-matter / H1, or replaces a named body section. Cannot change the number or filename. |
| `set_status` | `ref`, `status`, `force = false` | Enforces transition rules (refuses `→ designed` with blocking open questions; refuses `→ in-progress` when blocked), explaining why. `force` overrides with a warning. |
| `add_question` | `ref`, `text`, `implementation = false` | Appends to `## Open Questions` (creating it if needed). A blocking question on a `designed` initiative moves it back to `draft`, and says so. |
| `resolve_question` | `ref`, `index` \| `match`, `answer`, `record_in?`, `mode = "remove"` | Default (`remove`): deletes the question and appends the decision to the `record_in` section (default `## Decisions`, created if missing — e.g. pass `Agreed direction`). `mode: "tick"` instead keeps it as `- [x] … — answer`. Returns the edited sections so the agent can smooth the prose. |
| `set_dependencies` | `ref`, `add?`, `remove?`, `related_add?`, `related_remove?`, `why?` | Edits the `## Dependencies` / `## Related` sections: adds a bullet with a relative link (plus `why`), removes the bullet(s) linking to a target. Accepts refs (`ese#22`, numbers, paths) or URLs. Refuses cycles and unknown initiatives. |
| `complete` | `ref`, `docs_impact` | `docs_impact` is **required**: the project doc paths updated, or `"none: <reason>"`. Each listed path must exist, match the `docs:` globs, and differ from `HEAD` (i.e. actually edited in this change); otherwise refused with the reason. Runs `check_docs` on the listed files and returns any warnings. Then sets `done` (pre-check: was `in-progress`, warns otherwise), warns if design-debate content (e.g. a rejected-alternatives table or section) is still in the main body rather than in `## Appendix: Rejected alternatives`, regenerates the READMEs, and reports which initiatives **became ready** as a result. No other initiative files are modified. |
| `renumber` | `ref`, `to?` | Fixes a post-merge number collision: renames file and asset dir, rewrites the (few) references to it. |
| `regenerate_readmes` | `collection?`, `check = false` | Rebuilds the generated blocks in collection READMEs (one, or all). `check: true` only reports which are stale — for CI. Rarely needed by hand, since writes and the staleness check (§6.1) keep them current. |

## 4. Resources

- `brindley://initiative/<collection>/<number>` — raw Markdown of one initiative, so a client can attach it
  as context when handing it to an implementer.
- `brindley://collection/<name>` — the same overview the collection README contains, generated
  on the fly.
- `brindley://index` — the overview of every collection: counts, cross-collection dependencies
  and themes (FORMAT §8.2). This is the only place the repo-wide view lives; no file is written.
- `brindley://tag/<tag>` — the theme as one document: its overview doc (if any), then every initiative with that tag, across collections
  (useful context for a design session on a cross-cutting theme).
- The resource list enumerates all initiatives for clients with resource pickers.

## 5. Prompts

Reusable workflows, so hand-off instructions live in the tool rather than being retyped per repo:

| Prompt | Args | Content |
|--------|------|---------|
| `design-review` | `ref` | Interactive session resolving an initiative's open questions with the user. See §5.1 — this is the primary design-time workflow. |
| `implement` | `ref` | Hand-off brief: the initiative, its dependency report, summaries of its done dependencies, the generic lifecycle rules (FORMAT §9 layer 1), the docs it is expected to change (`docs`, falling back to the collection's) with the current-state writing rules (FORMAT §7.1) and the requirement to finish with `complete(docs_impact)`, and — if the collection declares `agent:` — an instruction to read and follow that repo workflow file. |
| `triage` | `collection?` | Review a collection: stale drafts, unresolved questions, blocked chains, external deps nobody has confirmed, suggested next pick. |

### 5.1 `design-review`: interactive question resolution

The way initiatives actually reach `designed` is a human working through the open questions one by
one with an agent. The prompt encodes how that conversation must be run.

**Loaded context.** The initiative, its dependency report, summaries of its dependencies and
`related` initiatives, and its unresolved questions in order (`(implementation)` ones listed
separately, not discussed unless the user asks).

**Conversation rules** (part of the prompt text):

1. **Open chat, not forms.** Ask in the normal conversation, in prose. Never use a structured
   question / multiple-choice / form tool, even if the client offers one — the user wants to reply
   freely, push back, and redirect.
2. **One question at a time**, in the order they appear unless the user picks another. State which
   question is being discussed and how many remain.
3. **Grounded in the code, not theory.** Before discussing a question, read the code that the
   question is about: the classes, queries, tests and docs that currently own the behaviour.
   Every claim about how the system works cites where it comes from (`path:line`, test name,
   doc section). If the code doesn't establish something, say *unclear from code* and say what
   was checked — never fill the gap with a plausible description of how such systems usually work.
4. **Clear, concrete examples.** Illustrate each option with an example drawn from the real domain
   and code: actual types, field names, data, and what a caller would see before and after — in
   the style of a worked example (e.g. a before/after table of stored, current and prospective
   values for one real record). Avoid abstract placeholders like `Foo`/`x`.
5. **Recommend, then let the user decide.** Lay out the realistic options (usually 2–3) with their
   consequences in this codebase, give a recommendation and why, then ask. Don't move on until the
   user has decided, deferred it, or marked it `(implementation)`.
6. **Record as you go.** When a question is settled, call `resolve_question` (default: remove the
   question, write the decision into the body — e.g. `Agreed direction`), and show the user the
   edited text. If the decision will change documented behaviour, add the affected doc to the
   initiative's `docs` list so the implementer knows to update it. Rationale and rejected options
   stay in the initiative — they never go into project docs. New questions that surface go in via `add_question`. Update acceptance criteria
   when a decision creates a verifiable outcome.
7. **Finish cleanly.** When no blocking questions remain, offer to `set_status(designed)`; don't do
   it unprompted.

**Supporting tool.** `next_question(ref, after?)` returns the next unresolved question with its
index, the section(s) of the body it refers to, and the number remaining — so the agent can step
through without re-parsing the document each turn.

## 6. Behavioural details

- **Parsing:** front-matter with a YAML library that round-trips comments and key order. The body
  is parsed to a Markdown AST only to *locate* sections and list items; edits are applied as
  text splices so the author's formatting (line wrapping, table style) is untouched. Open
  questions are top-level list items under a case-insensitive `Open questions` heading, including
  their continuation lines and nested content.
- **Number allocation (repo scan):** `create` coins the number itself; callers never supply one.
  It takes the highest number used for the collection across:
  1. the current working tree;
  2. every other worktree of the repo (`git worktree list`), including uncommitted files;
  3. every local branch and its upstream (`git ls-tree` on the collection path) — catches numbers
     already coined on branches not checked out anywhere;
  4. the collection's own history (`git log --diff-filter=D` on the path), so a deleted
     initiative's number is never reused and old references stay unambiguous.

  …and returns that + 1. All git access is **read-only**; if git is unavailable it falls back to
  (1) and says so. Numbers coined on other people's unpushed branches remain invisible, so
  `validate` + `renumber` stay as the safety net.
- **Concurrency:** single writer per working tree. Parallel agents use separate worktrees; at
  merge, conflicts are limited to the files each actually changed plus the generated index (which
  is regenerated, not merged).
- **Validation on write:** writes that would violate an error-level rule are refused with an
  explanation; warnings are returned alongside success.
- **Leniency on read:** malformed files are reported but never stop the rest of the collection
  being read.

### 6.1 Keeping READMEs current

The server owns the generated block in every collection README (FORMAT §8).

**After every write.** Any tool that changes an initiative or collection regenerates, in the same
call, every collection README's generated block. Usually only the edited collection's changes,
but a status change can alter readiness in other collections through cross-collection
dependencies. Because output is deterministic, an unaffected README is not rewritten. The tool
result lists every file it touched, so the agent can include them in its commit.

**After edits the server didn't make.** Initiatives are also edited by hand, by agents without the
server, by `git pull`, and by merges. At the start of every tool call the server regenerates
each existing README's block in memory and compares it with what is on disk — generation is
deterministic and cheap, so no stored fingerprint is needed. If stale, it rewrites the block and
says so in the tool result ("README for `LOCK-42/slot-booking` was stale; regenerated"). This
self-healing is on by default; `--no-auto-readme` turns it off, leaving staleness to `validate`.

**Merges.** If a generated block contains conflict markers, the server regenerates it outright
(the block is derived, so either side is equally disposable). It never touches conflict markers
outside the block. While a merge or rebase is in progress (`MERGE_HEAD` / `rebase-merge`
present) self-healing is limited to conflicted blocks, to avoid adding unrelated changes to the
merge.

**Hand edits inside the block** are overwritten; the marker text says so. **Outside the block**
is never modified — the free-form introduction is the humans'.

**First run.** A README without markers gets a block appended at the end on its first
regeneration (reported in the result). Users can then move the markers wherever they like; the
server only ever rewrites between them.

## 7. Testing

- Fixture repos: an unmarked folder being adopted; a mid-project collection; a legacy numbered layout (with a
  `completed/` folder) for `migrate`; deliberately broken files for `validate`.
- Golden-file tests for every write tool, asserting untouched parts of a file are byte-for-byte
  unchanged.
- MCP-level tests via the SDK's in-memory client.
- README generation: golden-file tests for tables and Mermaid; determinism (regenerating twice
  gives identical bytes); self-healing after an out-of-band edit; conflict-marker recovery.

## Open Questions

- [x] Package / server name — `brindley` on npm (unscoped name was free at time of writing); CLI command `brindley`.
- [ ] v2 git helpers? E.g. `claim` (set `in-progress` and record the branch) — the same
      worktree/branch scan used for numbering could detect an initiative already `in-progress`
      elsewhere. Or keep git writes entirely in repo agent files?
- [x] Who coins numbers? — the server, via read-only repo scan across worktrees, branches and
      history (§6).
- [ ] Should the `implement` prompt *inline* the resolved `agent:` file, or just tell the agent
      to read it?
- [ ] Should `create_collection` write the format-rules snippet into `AGENTS.md`/`CLAUDE.md`, or only return it?
- [ ] `check_docs` heuristics: a fixed English phrase list, or configurable per repo? Should it
      ever fail CI, or stay advisory?
- [ ] A companion CLI over the same core library (for humans, and `validate` in CI)?
- [ ] `migrate`'s dependency extraction will be heuristic (links to `completed/NN-…`, bare
      "`30`" mentions, module names like `lib:geo-coords`). Is an
      agent-assisted migration (tool proposes, agent confirms per file) acceptable?

## Appendix A — Effect on a typical implementing agent

A worktree-based implementing agent written for the pre-Brindley practice has roughly these steps:

| Agent step | Today | With the server |
|------------|-------|-----------------|
| 1. Select and validate | Read the proposal, follow `## Dependencies` links, classify each as completed / active / conditional / unclear. | `get(ref)` returns the dependency report; the agent judges only `external` entries and "conditional" cases. |
| 2. Worktree | Repo-specific git workflow. | Unchanged (stays in the agent file). |
| 3–4. Trace, implement | Repo-specific. | Unchanged. |
| 5. Update current-state docs | Decide and state which docs are affected; write present-tense, no history. List of candidate docs hard-coded in the agent. | Candidate docs come from the initiative's/collection's `docs`; writing rules come from the format; `check_docs` lints the result; `complete` refuses without a `docs_impact` statement. The agent file keeps only repo-specific guidance (which doc covers what). |
| 6. Retire the note | Move to `completed/`, mark as completed, rewrite wording, edit README summary table, completed table, and dependency graph. | Rewrite wording, then `complete(ref)`. Nothing moves; README index regenerates. |
| 7–9. Verify, commit, merge | Repo-specific. | Unchanged. |

The agent file loses its hard-coded collection path and its README-maintenance instructions; the
collection's `agent:` field points back at it, so `implement` can find it.
