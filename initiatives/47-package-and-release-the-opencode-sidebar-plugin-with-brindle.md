---
type: feature
status: draft
updated: 2026-11-02
---
# Package and release the OpenCode sidebar plugin with Brindley

## Goal

An OpenCode user installs the Brindley sidebar from npm by package name, at a version released alongside Brindley, instead of cloning a colleague's repo and pointing OpenCode at a local path.

## Background

[dcsmiff/opencode-brindley-sidebar](https://github.com/dcsmiff/opencode-brindley-sidebar) (MIT,
`0.1.0`, unpublished) adds two OpenCode sidebar sections: **Initiatives** (counts by tier) and
**Pick up next** (actionable rows with a detail dialog, `/brindley` to pin a collection). It is
read-only. Today it is installed by cloning it and giving OpenCode a local path
(`"plugins": [{ "package": "/path/to/opencode-brindley-sidebar" }]` in `~/.config/opencode/cli.json`).

Things about it that shape packaging:

- **It ships TypeScript source, no build.** `exports` maps `./tui` to `./src/tui.tsx`, and tests
  run under `node --test` with native type stripping. Brindley builds with `tsc` and tests with
  vitest.
- **Its peers must not be installed.** OpenCode supplies its own `@opentui/core`, `@opentui/solid`
  and `solid-js`; a bundled copy of `solid-js` shadows the host's and the sidebar silently stops
  updating. Its `.npmrc` sets `legacy-peer-deps=true` for that (its `DESIGN.md`, "Where
  reactivity lives").
- **It re-implements Brindley's reading of the files**, because OpenCode plugins cannot call MCP
  tools: collection discovery (`src/collections.ts`), front-matter (`src/frontmatter.ts`), file
  scanning (`src/scan.ts`) and status aliases and tiers (`src/status.ts`). That copy already
  differs from Brindley. It only falls back to the folder name for status when a collection
  declares `folders:`, but Brindley also reads `completed/`, `deferred/` and `superseded/`
  (FORMAT §4). It doesn't apply a collection's own `statuses:` mapping. And its alias table
  (`active`, `closed`, `complete` …) is its own.

### Installing from npm

OpenCode's [TUI plugin docs](https://opencode.ai/v2/docs/build/plugins/cli/) add a published
plugin by package name in `cli.json`, the file for TUI-only packages so they stay active against
remote servers: `{ "plugins": ["opencode-acme-plugin"] }`. Published, the sidebar would need no
clone, no `npm install` and no `git pull` to update.

- **The package already has the documented shape:** `exports["./tui"]` pointing at `.tsx` source,
  no build step, and `@opentui/core` / `@opentui/solid` `>=0.6.6` and `solid-js` `>=1.9.0` as peers.
- **The docs list `@opencode/plugin` as a dependency**, which the sidebar doesn't declare; whether
  it loads without it when installed by name, rather than from a local path, is unconfirmed.
- **Options by name are undocumented.** The docs show only a bare string; the README's
  `{ "package": …, "options": { … } }` object form (for `order`, `exclude`, `maxRows`) appears in
  community plugins but not in the docs.
- **Installation, caching and version pinning of TUI plugins are undocumented.** OpenCode's
  [server plugins](https://opencode.ai/docs/plugins/) are installed with Bun at startup and cached
  in `~/.cache/opencode/node_modules/`; the TUI page says neither, nor whether `name@1.2.3` pins a
  version.
- **`exports` advice conflicts.** A community author reports OpenCode silently skipping a plugin
  whose `package.json` has an `exports` field, contrary to the docs' own example; it needs testing
  against the OpenCode version in use.

## Dependencies

_None._

## Related

- [https://github.com/dcsmiff/opencode-brindley-sidebar](https://github.com/dcsmiff/opencode-brindley-sidebar) — the plugin as it is today
- [44 A JSON snapshot that every view renders from](44-a-json-snapshot-that-every-view-renders-from.md) — a snapshot the sidebar could read instead of parsing the files itself
- [45 Install Brindley as a Claude Code plugin](done/45-install-brindley-as-a-claude-code-plugin.md) — the same job for Claude Code: a plugin in this repo, pinned to the server version by `release:prepare`
- [37 Publish to npm only through trusted publishing](37-publish-to-npm-only-through-trusted-publishing.md) — applies to a second npm package too

## Open questions

- **Q1** Does the plugin's author agree to it moving into Brindley, and on what terms: the
  copyright line in its LICENSE, credit in the package and README, and who maintains it
  afterwards?
- **Q2** Where does the code live: a folder in this repo (e.g. `opencode/`, beside `plugin/`),
  brought in with its git history (subtree) or as a fresh copy; or does it stay in its own repo,
  with only publishing moved to Brindley's release?
- **Q3** What is the npm package called: keep `opencode-brindley-sidebar`, or a name that groups it
  with Brindley (e.g. `brindley-opencode`)? OpenCode plugins are installed by package name, so this
  is what users type.
- **Q4** Is it versioned in lockstep with `brindley` (one tag publishes both, as the Claude Code
  plugin is pinned to the server version), or independently with its own tags?
- **Q5** How does it read initiatives: keep its own parser, now tested against Brindley's fixtures
  so the two can't drift; import the parsing from the `brindley` package (which exports nothing
  today, only a `bin`); or read the snapshot from initiatives#44 and depend on it?
- **Q6** Can a user pin the sidebar's version in `cli.json` (e.g. `opencode-brindley-sidebar@1.2.3`),
  and if OpenCode always fetches the latest instead, is that acceptable, given initiatives#45 pins
  the Claude Code plugin's server version to avoid exactly that?

## Acceptance criteria

- The sidebar installs in OpenCode from npm by package name, with no local clone, and its options
  (`order`, `exclude`, `maxRows`) take effect when it is installed that way.
- Installing it does not install `@opentui/core`, `@opentui/solid` or `solid-js`, and the sidebar
  updates live inside OpenCode.
- A Brindley release publishes it, through trusted publishing, from the same workflow as `brindley`.
- Its tests run in Brindley's CI.
- The docs site and README describe installing and configuring it.
- The plugin shows the same status as Brindley's `list` for every initiative in this repo,
  including ones whose status comes only from a status folder.
