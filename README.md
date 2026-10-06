<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brindley-logo-dark.svg">
  <img alt="Brindley — Design fully before anyone digs" src="assets/brindley-logo.svg" width="300">
</picture>

Brindley is a plain-Markdown convention for planning work in a git repo — one numbered file per
initiative, designed with an AI agent until every open question is settled, then handed to an
agent to implement — plus an MCP server that makes the convention easy to adopt and work with.

Named after James Brindley, engineer of Manchester's Bridgewater Canal, who worked his designs out
completely before construction began.

- [FORMAT.md](FORMAT.md) — the file format and conventions (usable with no tooling at all)
- [MCP-SERVER.md](MCP-SERVER.md) — the MCP server's design

**Status:** early (0.1). Not yet published to npm.

## What the server does

- **Plans live in the repo, wherever you like.** Mark any folder as a collection (a `brindley: 1`
  line in its README's front-matter); initiatives are `<n>-<slug>.md` files in it, status in
  front-matter. Files never move, so links never break.
- **Numbers are coined for you**, scanning other worktrees, branches and history so parallel
  work doesn't collide.
- **Knows what's ready**: designed, with every dependency done — across collections.
- **Design sessions**: a `design-review` prompt that works through open questions one at a time,
  in open chat, grounded in the code, recording decisions as it goes.
- **Hand-off**: an `implement` prompt with the dependency report, lifecycle rules and the docs to
  update; `complete` refuses to finish without a `docs_impact` statement.
- **READMEs keep themselves current**: tables, Mermaid dependency graphs and a themes index,
  regenerated on every change and healed after hand edits or merges.

## Running it locally

Requires Node 20+ and git.

```sh
git clone https://github.com/duckAsteroid/brindley && cd brindley
npm install
npm run build        # compiles to dist/
npm test
```

Then, **in the repo you want to plan in**:

```sh
node /path/to/brindley/dist/cli.js init docs/plans   # marks the folder as a collection; prints the AGENTS.md snippet
claude mcp add brindley -- node /path/to/brindley/dist/cli.js
```

Restart Claude Code in that repo and the `brindley` tools and prompts are available. You can also
mark folders from inside a session: ask the agent to "make `docs/plans` a collection". Any other MCP
client works the same way: run `node /path/to/brindley/dist/cli.js` over stdio with the repo as the
working directory. To make a `brindley` command available everywhere, run `npm link` in this repo.

To poke at the server interactively, use the MCP Inspector:

```sh
npx @modelcontextprotocol/inspector node /path/to/brindley/dist/cli.js
```

## CLI

```
brindley [serve] [--no-auto-readme]     Run the MCP server on stdio (default)
brindley init [<folder>] [--name <n>]   Mark a folder (default: the current one) as a collection
brindley validate [--docs]              Check every collection; exits 1 on errors
brindley readmes [--check]              Regenerate collection README blocks; --check exits 1 if stale
```

`brindley validate` and `brindley readmes --check` are suitable as CI checks.

## Not built yet

`migrate` (from a numbered + `completed/` layout), `renumber`, and `rename_collection` are
specified in [MCP-SERVER.md](MCP-SERVER.md) but not implemented in 0.1.

## Licence

[MIT](LICENSE) © 2026 Chris Senior
