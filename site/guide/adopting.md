# Adopting an existing folder

Already keeping numbered Markdown plans? Mark the folder and Brindley reads it as it is.

> Make `docs/plans/schema-enhancements` a collection.

Only the README changes: `brindley: 1` is added to its front-matter, and a generated block is
appended after your text.

## What's understood without changes

- **Status folders.** Files in `completed/`, `deferred/` or `superseded/` take their status from
  the folder unless their front-matter says otherwise. Brindley never moves files itself.
- **Your status words.** *Proposed*, *Exploratory*, *Design complete*, *Future* and other common
  words map to core statuses; map your own with `statuses:` in the collection README.
- **Dependency links.** Links under `## Dependencies` count — even links to files that have since
  been moved into `completed/`, which are matched by filename.
- **Zero-padded numbers** like `01-` are read (and flagged, since the format doesn't use them).

## What to tidy

Ask for a check:

> Validate the collection.

Typical findings, each with a suggested fix:

| Finding | Fix |
|---------|-----|
| No `status` — "the body says *Proposed*" | add `status: draft` to the front-matter |
| Status says one thing, the folder another | correct the front-matter, or the folder |
| Two files with the same number | if one is a companion note (`24-x-rationale.md` beside `24-x.md`), move it into the initiative's asset folder (`24-x/rationale.md`) or `ignore` it — the finding suggests both |
| A broken link — "it is now at `completed/50-…`" | update the link |

## Ignoring files

Numbered files that aren't initiatives can be ignored with `.gitignore`-style patterns:

```yaml
ignore:
  - "*-rationale.md"
  - code-review/
```

> Preview ignoring `*-rationale.md` in lgm.

The `ignore` tool shows what a pattern would match before writing it. Ignored numbers are still
never reused.
