# MCP tools & prompts

You rarely call these by name — ask your agent in plain words and it picks the tool. Wherever a
tool takes `ref`, use `name#n` (`sb#22`), a bare number when unambiguous, or a path; `collection`
accepts a name, an alias or a folder path.

## Collections

| Tool | Parameters | Does |
|------|------------|------|
| `create_collection` | `path`, `name?`, `aliases?`, `title?`, `summary?`, `owner?`, `link?`, `agent?`, `docs?`, `types?`, `tags?`, `statuses?`, `ignore?` | Marks a folder as a collection (creating it if needed). The first one in a repo also returns the AGENTS.md snippet. |
| `update_collection` | `collection`, `status?`, and the same details | Edits the collection README's front-matter. Its name can't be changed here. |
| `ignore` | `collection`, `add?`, `remove?`, `dry_run?` | Adds or removes `.gitignore`-style patterns for numbered files that aren't initiatives; `dry_run` previews. |
| `collections` | — | Every collection with aliases, counts by status, number ready and ignored files. |

## Reading

| Tool | Parameters | Does |
|------|------------|------|
| `list` | `collection?`, `type?`, `status?`, `tag?`, `owner?`, `ready?` | Initiatives, filtered. |
| `get` | `ref` | One initiative in full: dependency report, dependants, questions, acceptance criteria, themes. |
| `ready` | `collection?`, `type?` | What can be picked up now, prerequisites first. |
| `check_ready` | `ref` | Whether one initiative is complete and ready to work on, check by check. |
| `graph` | `collection?`, `ref?`, `tag?`, `include_done?` | Dependency graph as data and Mermaid. |
| `questions` | `collection?`, `ref?`, `include_implementation?` | Unresolved open questions. |
| `next_question` | `ref`, `after?` | The next blocking question to discuss, and how many remain. |
| `tags` | — | Every tag, with descriptions, counts and theme docs. |
| `validate` | `collection?`, `rules?`, `docs?` | Problems with initiatives and collection structure. See [Validation rules](/reference/validation). |
| `check_docs` | `paths?` | History phrasing, design debate and initiative links in project docs. |
| `version` | — | The server's version. |

## Writing

Every write touches only the initiative (or collection README) concerned, plus the regenerated
README blocks — and reports every file it touched, ready to commit.

| Tool | Parameters | Does |
|------|------------|------|
| `create` | `collection`, `title`, `type?`, `tags?`, `goal?`, `depends_on?`, `related?`, `why?`, `owner?` | Coins the next number and writes the skeleton; dependencies become links. A folder path that isn't a collection yet is marked as one. |
| `update` | `ref`, `title?`, `type?`, `owner?`, `tags?`, `status_note?`, `docs?`, `section?`, `content?` | Edits front-matter or the H1, or replaces a body section. `content` is the section's body; a leading heading naming the section is dropped. |
| `set_status` | `ref`, `status`, `superseded_by?`, `force?` | Changes status within the lifecycle rules. Aliases like *parked* are accepted. |
| `add_question` | `ref`, `text`, `implementation?` | Adds an open question; a blocking one sends a designed initiative back to draft. |
| `resolve_question` | `ref`, `index` or `match`, `answer`, `record_in?`, `mode?` | Removes the question and records the decision (or ticks it, with `mode: tick`). |
| `set_dependencies` | `ref`, `add?`, `remove?`, `related_add?`, `related_remove?`, `why?` | Adds or removes links under `## Dependencies` / `## Related`. Refuses cycles. |
| `complete` | `ref`, `docs_impact` | Marks it done. `docs_impact` lists the project docs changed (paths from the repo root, not initiative files), or `none: <reason>` (spikes default to none). Reports what became ready. |
| `regenerate_readmes` | `collection?`, `check?` | Rebuilds generated README blocks; `check` only reports stale ones. |

## Prompts

| Prompt | Argument | For |
|--------|----------|-----|
| `design-review` | `ref` | Working through open questions with you, one at a time, grounded in the code. |
| `implement` | `ref` | Handing an initiative to an agent to build. Starts with a readiness check. |
| `spike` | `ref` | Running a spike: measure, record findings, keep the code on its own branch. |
| `triage` | `collection?` | Reviewing what's stale, blocked, undecided and next. |

Whether prompts appear as slash commands depends on your MCP client.

## Resources

| URI | Content |
|-----|---------|
| `brindley://index` | Overview of every collection, cross-collection dependencies and themes. |
| `brindley://collection/<name>` | One collection's tables and graph. |
| `brindley://initiative/<name>/<n>` | One initiative's Markdown. |
| `brindley://tag/<tag>` | A theme: its overview doc, then every tagged initiative. |
