# Types

An initiative's `type` says what kind of work it is:

```yaml
---
status: draft
type: feature
---
```

## Suggested types

| Type | Use for |
|------|---------|
| `feature` | New user- or caller-visible capability. |
| `bug` | Behaviour that is wrong today. |
| `refactor` | Internal restructuring with no behaviour change. |
| `perf` | Performance work. |
| `docs` | Documentation-only change. |
| `chore` | Build, dependencies, tooling, CI. |
| `spike` | Builds just enough to measure something and answer a question — see [Spikes](/guide/spikes). |

Any other word is accepted too, unless the collection declares its types (below).

## Aliases

These words are read as the type they stand for:

| Written | Read as |
|---------|---------|
| `feat` | `feature` |
| `fix`, `bugfix` | `bug` |
| `raconiter`, `raconitering`, `reconnoitre`, `investigation` | `spike` |

## Declaring a collection's types

A collection README can list the types it uses; an initiative with any other type is then a
`type-unknown` warning, which catches typos:

```yaml
types: [feature, bug, refactor, perf, docs, chore, spike]
```

Without `types:`, any type is accepted.

## What a type changes

For most types, nothing: `type` describes the work, and `list` and `ready` can filter by it. An
implementing agent may also use it to choose its commit type (`feature` → `feat`, `bug` → `fix`).

`spike` is the exception, because a spike measures rather than builds:

- `create` adds `## Measures` and `## Findings` sections;
- `check_ready` and the implement brief ask for a filled-in `## Measures` instead of acceptance
  criteria, and `validate` warns when a started spike has none, or a finished one has no
  `## Findings`;
- `implement` hands over the spike brief instead of the build brief;
- `complete` defaults its `docs_impact` to none — a spike's findings are recorded in the initiative.
