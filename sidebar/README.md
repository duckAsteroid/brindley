# brindley-sidebar

A Claude Code mod that shows the [Brindley](https://www.npmjs.com/package/brindley)
initiatives of the session's repository in a pane beside the chat: how much
work is open, what to pick up next, and a one-step way to start Claude working
on an initiative.

```
3 active, 12 draft · 4 deferred, 31 done

▶ Pick up next 3
▶   at#116 Suggestions for parked work
◆ b at#117 GET /suggest drops the cursor ⊘
◆   in#14 Replay already-ingested batches
```

- **Counts.** `active` is in-progress and designed work. `done` covers done,
  abandoned and superseded.
- **Pick up next.** Active rows, at most `maxRows` of them. Press the header to
  expand to every active and draft initiative; the choice is remembered.
- **Detail.** Press a row for its goal, what blocks it, and its open question
  count, with three buttons:
  - **Queue** submits `Work on <ref> — <title>. Read <path> first.` as Claude's
    next turn.
  - **Copy** puts the ref on the clipboard.
  - **Back** returns to the list.

Each row is a status glyph, a type letter, the reference and the title:

| Glyph | Status | Colour |
| --- | --- | --- |
| `▶` | in progress | green |
| `◆` | designed | amber |
| `○` | draft | muted |
| `?` | unrecognised or missing | red |

A `?` means the `status:` value is not one Brindley defines, usually a typo. The
initiative is still listed, as a draft, so the mistake shows. The type letter is
the type's first letter; `feature`, the majority, is left blank. `⊘` after the
title means another initiative blocks it.

## Requirements

- The Brindley MCP server, connected in Claude Code. All the data comes from it,
  so the pane reads the collections exactly as Brindley does. The `brindley`
  plugin from the same marketplace provides it, and `/mcp` lists it as
  `plugin:brindley:core`, the `server` option's default.

  If you connect Brindley another way, for example
  `claude mcp add -s user brindley -- npx -y brindley@latest`, set the `server`
  option to the name `/mcp` lists (`brindley` there).
- A terminal session. The pane opens by itself only in the terminal's
  fullscreen layout, docked beside the chat.

## Install

At the prompt of a Claude Code terminal session, type:

```
/plugin marketplace add duckAsteroid/brindley
/plugin install brindley-sidebar@brindley
```

Pick a scope: user, for every project. It loads from the next session. The
sidebar's version always matches the `brindley` plugin's, because it reads that
server's tool output: update both together with
`claude plugin marketplace update brindley`, then
`claude plugin update brindley@brindley` and
`claude plugin update brindley-sidebar@brindley`.

### From a clone

To run the code in a folder of your own, for example while changing it:

```sh
git clone https://github.com/duckAsteroid/brindley.git
```

- **One session:** `claude --plugin-dir /path/to/brindley/sidebar`.
- **Every session:** link the folder into your skills folder, and Claude Code
  loads it at each start. Edits reload it in a running session.

  ```sh
  ln -s /path/to/brindley/sidebar ~/.claude/skills/brindley-sidebar
  ```

Use one way at a time. An installed copy together with a linked or
`--plugin-dir` folder loads the mod twice.

## When the pane opens

- **At session start**, in a repository with Brindley collections, the pane
  opens by itself if you are in a terminal using the fullscreen layout. Claude
  Code docks a pane it was not asked for only from 144 columns wide (110 once
  you have opened it yourself); narrower, it waits. If the Brindley server is
  still starting, the pane tries again for about 30 seconds.
- **Not fullscreen**, or seated inline above the prompt: the pane closes again
  on its first frame.
- **Once you close it** in a project, it stays closed there in later sessions
  until you run `/initiatives`.
- **On other surfaces** (the desktop app, VS Code) it never opens by itself;
  `/initiatives` still opens it.
- **No collections or no server:** in a repository with no collections, or
  without the Brindley server, it does not open, and `/initiatives` says why.

The pane refreshes every 5 seconds while open, and straight away after Claude
calls a Brindley tool or edits a file under a collection.

## Commands

| Command | What it does |
| --- | --- |
| `/initiatives` | Opens or closes the pane, at any width. |
| `/brindley` | Lists the collections, numbered, with their paths and the current pin. |
| `/brindley <n \| name \| alias \| path>` | Pins counts and rows to one collection, remembered per project. |
| `/brindley all` | Clears the pin. |

## Options

Set them in `/config`, or in `settings.json` under `pluginConfigs`:

```json
{
  "pluginConfigs": {
    "brindley-sidebar": {
      "options": {
        "order": "status-priority",
        "exclude": ["**/test-corpus/**", "archive/**"],
        "maxRows": 10,
        "server": "plugin:brindley:core"
      }
    }
  }
}
```

| Option | Default | Meaning |
| --- | --- | --- |
| `order` | `status-recency` | Row order: `status-recency`, `status-priority`, `recency` or `priority`. Initiatives without an `updated:` date or a priority sort last; ties go by ref. |
| `exclude` | `["**/test-corpus/**"]` | Globs (`*`, `**`, `?`) matched against each collection's repo-relative path; matching collections are left out. |
| `maxRows` | `8` | Rows shown while Pick up next is collapsed. |
| `server` | `plugin:brindley:core` | The Brindley MCP server's name as `/mcp` lists it. The default is the `brindley` plugin's server. |

## Large repositories

Claude Code caps the size of an MCP result. The counts line uses Brindley's own
counts. Rows are only fetched for active and draft work, one collection at a
time. If one collection's list is still over the cap, the pane asks for it one
open status at a time instead.

In a collection listed that way, an initiative with a status Brindley does not
recognise cannot be fetched, so it is missing from the pane. If even one open
status is over the cap, the pane says so; raise `MAX_MCP_OUTPUT_TOKENS` for
Claude Code.

## Development

From the repository root:

```sh
claude plugin test sidebar                # the tests, under Claude Code's own test kit
npx -p typescript tsc -p sidebar          # type-check
claude plugin validate --strict sidebar   # what the engine would refuse
```

An interactive `claude --plugin-dir sidebar` session lays the engine's types in
`sidebar/.claude-plugin/types/` (gitignored), which `tsconfig.json` extends, so
type-checking runs locally. CI runs the tests and validation with a pinned
Claude Code; `npm test` (vitest) leaves `sidebar/` out. `npm run release:prepare`
stamps the sidebar's `plugin.json` version with the release's.

The code:

- `hooks/register.tsx` wires the events, the commands and the pane.
- `hooks/lib/` holds the logic and the views.
- `types/index.d.ts` is the `$.state` contract.
- Planned work lives in Brindley's `initiatives/` collection. The pane's
  original design record is
  [cbs#1](https://github.com/dcsmiff/claudecode-brindley-sidebar/blob/main/docs/initiatives/01-brindley-initiative-pane-for-claude-code.md)
  in its first repository.

## Credits and license

Written by Darren Smith ([dcsmiff](https://github.com/dcsmiff)). MIT; see
[LICENSE](LICENSE).
