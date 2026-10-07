# Validation rules

`validate` (the tool, or `brindley validate`) reports problems with file and line. Errors make
`brindley validate` exit 1; warnings don't. Pass `rules: [...]` to the tool to see only some.

## Errors

| Rule | Meaning |
|------|---------|
| `parse` | Front-matter doesn't parse, or an initiative outside a status folder has none. |
| `status-missing` | No status — and no status folder to take it from. When the body states one, `status-inferable` says which; otherwise the message quotes what the body says, if anything. |
| `status-invalid` | A status word that isn't a core status, an alias, or mapped with `statuses:`. |
| `duplicate-number` | Two initiatives in one collection share a number. When one file's name is the other's plus a suffix (`24-booking-window-rationale.md`), it is treated as a companion note: the finding suggests moving it into the initiative's asset folder, or the `ignore` pattern that leaves it in place. |
| `cycle` | Dependencies loop back on themselves. Often one link is a back-reference ("depended on by"): move it to `## Related`, or to `## See also` for a plain link. |
| `dangling-ref` | `superseded_by` refers to an initiative that doesn't exist. |
| `date` | `updated` isn't an ISO date. |
| `superseded-by` | Superseded, with nothing saying by what (a warning for files in a `superseded/` folder). |
| `duplicate-collection` | Two collections have the same name; give one a `name:`. |
| `alias-clash` | A name or alias is used by more than one collection. |
| `alias-format` | A name or alias contains characters that can't be used in references. |
| `collection-status` | A collection status other than active, done or abandoned. |
| `dimension-value` | A scoring dimension value that isn't one of its declared values. |
| `dimension-declaration` | A `dimensions:` entry with no values, a repeated value, a `default` that isn't one of them, or a reserved name like `status`. |
| `duplicate-theme` | Two overview docs claim the same theme. |

## Warnings

| Rule | Meaning |
|------|---------|
| `designed-open-questions` | Designed, but blocking questions remain. |
| `dimension-missing` | A required scoring dimension has no value. |
| `abandoned-reason` | Abandoned, with no reason recorded (`status_note`) — unless the status comes from a status folder. |
| `status-inferable` | No status recorded, but a `**Status:**` line or `## Status` section states one that maps to a core status — record it with `update` (`status: …`). Free text isn't read. |
| `graph-setting` | A collection README's `graph:` has an unknown setting or a value it can't use. |
| `open-questions` | In progress or done, with questions still open. |
| `docs-impact` | Done, with no `docs_impact` recorded. |
| `status-folder-mismatch` | Front-matter says one status, the folder another. |
| `status-not-in-folder` | The collection keeps this status in a folder (e.g. done in `completed/`), but this file is elsewhere. |
| `status-prose-mismatch` | The body's "Status:" line disagrees with the actual status. |
| `broken-link` | A link target doesn't exist — with where the file is now, if it moved; the repo path a `../` link resolves to; and the worktree that has it, if another one does. |
| `front-matter-dependencies` | `depends_on` / `related` in front-matter, which are ignored; use the sections. |
| `number-padding` | A number padded differently from the rest of its collection (e.g. `9-` among `01-`, `02-`). `repad` makes them consistent. |
| `number-width` | The collection's highest number has reached 80% of its padding width (8, 80, 800 …): `repad` to one digit more. |
| `orphan-assets` | An asset folder whose number matches no initiative. |
| `spike-measures` | A designed spike without `## Measures`. |
| `spike-findings` | A finished spike without `## Findings`. |
| `type-unknown` | A type the collection doesn't declare. |
| `tag-format` / `tag-unknown` | A tag that isn't kebab-case, or isn't declared. |
| `readme-stale` | A generated README block is out of date. |
| `collection-done-open` | A collection marked done with open initiatives. |
| `nested-collection` | A collection inside another collection's folder. |

With `docs: true`, project docs are linted too (see `check_docs`).

## Paths and worktrees

Brindley works on the git checkout it was started in. Errors about a path you give a tool (a
reference by path, a collection folder, a `docs_impact` path) name that checkout. When another
worktree of the repository has the missing file, the message says which one — usually the sign
that the server was started in a different checkout from the one being changed.
