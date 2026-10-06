# Validation rules

`validate` (the tool, or `brindley validate`) reports problems with file and line. Errors make
`brindley validate` exit 1; warnings don't. Pass `rules: [...]` to the tool to see only some.

## Errors

| Rule | Meaning |
|------|---------|
| `parse` | Front-matter doesn't parse, or an initiative outside a status folder has none. |
| `status-missing` | No status — and no status folder to take it from. The message quotes what the body says, if anything. |
| `status-invalid` | A status word that isn't a core status, an alias, or mapped with `statuses:`. |
| `duplicate-number` | Two initiatives in one collection share a number. |
| `cycle` | Dependencies loop back on themselves. |
| `dangling-ref` | `superseded_by` refers to an initiative that doesn't exist. |
| `date` | `updated` isn't an ISO date. |
| `superseded-by` | Superseded, with nothing saying by what (a warning for files in a `superseded/` folder). |
| `duplicate-collection` | Two collections have the same name; give one a `name:`. |
| `alias-clash` | A name or alias is used by more than one collection. |
| `alias-format` | A name or alias contains characters that can't be used in references. |
| `collection-status` | A collection status other than active, done or abandoned. |
| `duplicate-theme` | Two overview docs claim the same theme. |

## Warnings

| Rule | Meaning |
|------|---------|
| `designed-open-questions` | Designed, but blocking questions remain. |
| `open-questions` | In progress or done, with questions still open. |
| `docs-impact` | Done, with no `docs_impact` recorded. |
| `status-folder-mismatch` | Front-matter says one status, the folder another. |
| `status-not-in-folder` | The collection keeps this status in a folder (e.g. done in `completed/`), but this file is elsewhere. |
| `status-prose-mismatch` | The body's "Status:" line disagrees with the actual status. |
| `broken-link` | A link target doesn't exist — with where the file is now, if it moved. |
| `front-matter-dependencies` | `depends_on` / `related` in front-matter, which are ignored; use the sections. |
| `number-padding` | A zero-padded number like `01-`. |
| `orphan-assets` | An asset folder whose number matches no initiative. |
| `spike-measures` | A designed spike without `## Measures`. |
| `spike-findings` | A finished spike without `## Findings`. |
| `type-unknown` | A type the collection doesn't declare. |
| `tag-format` / `tag-unknown` | A tag that isn't kebab-case, or isn't declared. |
| `readme-stale` | A generated README block is out of date. |
| `collection-done-open` | A collection marked done with open initiatives. |
| `nested-collection` | A collection inside another collection's folder. |

With `docs: true`, project docs are linted too (see `check_docs`).
