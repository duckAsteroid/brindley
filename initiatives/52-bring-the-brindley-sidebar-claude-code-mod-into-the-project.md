---
type: feature
status: designed
updated: 2026-11-25
---
# Bring the brindley-sidebar Claude Code mod into the project

## Goal

Ship the brindley-sidebar mod (https://github.com/dcsmiff/claudecode-brindley-sidebar, MIT, by dcsmiff) as part of Brindley, so users of the Brindley plugin get a pane beside the Claude Code chat showing the repository's initiatives — counts by status, what to pick up next, and a detail view that queues an initiative as Claude's next turn — without installing a separate marketplace.

## Dependencies

- [54 Rename the plugin's MCP server from brindley to core](done/54-rename-the-plugin-s-mcp-server-from-brindley-to-core.md) — the sidebar looks for the plugin's server as `plugin:brindley:core`, so the rename ships first

## Related

- [https://github.com/dcsmiff/claudecode-brindley-sidebar](https://github.com/dcsmiff/claudecode-brindley-sidebar)

## Context

The mod (v0.1.0) is a TypeScript Claude Code hooks module (`hooks/hooks.json`, `hooks/register.tsx`,
`hooks/lib/*`, tests under `test/`) that reads everything from a connected Brindley MCP server. It
ships its own `.claude-plugin/marketplace.json` and `plugin.json` with `userConfig` options
`order`, `exclude`, `maxRows` and `server` (default `brindley`). It also carries its own Brindley
collection in `docs/initiatives/` (two initiatives).

Brindley today publishes one plugin, `brindley`, from `plugin/` via `.claude-plugin/marketplace.json`.

## Decisions

- **Q1** A separate plugin, `brindley-sidebar`, listed next to `brindley` in Brindley's `.claude-plugin/marketplace.json` with its own source folder. The core `brindley` plugin (`plugin/`: server, skills, implementer agent) is unchanged, so users choose whether to install the pane (`/plugin install brindley-sidebar@brindley`). Folding it into `plugin/` was rejected: every user would get a pane that opens by itself in fullscreen sessions, and the core plugin would depend on the newer mod engine API (`claude-code` import, `hooks/register.tsx:3`).
- **Q2** One squashed commit in Conventional Commits format (e.g. `feat(sidebar): add the brindley-sidebar Claude Code plugin`), copying upstream at a named commit (currently `4875741`). The message names the upstream repo and that commit, and credits Darren Smith (`dcsmiff`) with a `Co-Authored-By:` trailer; the README and the plugin's `plugin.json` `author` credit him too. This is a plain copy rather than `git subtree add --squash`, because the subtree squash commit gets an auto-generated message that isn't conventional. There is no `subtree pull` route, so later upstream changes are ported by hand. Rejected: a full subtree import of the 19 upstream commits, whose non-conventional messages and `cbs#` references would land in this repo's history.
- **Q3** The `server` option's default (`hooks/lib/options.ts:13`) becomes `plugin:brindley:core`, the name `/mcp` gives the core plugin's server after #54. With that, the tool prefix from `serverToolPrefix` (`hooks/lib/refresh.ts:7`) is `mcp__plugin_brindley_core__`. Users who connected Brindley another way (e.g. `claude mcp add brindley`) set `server` to that name; the plugin's `userConfig` description and the docs say so. Rejected: an ordered fallback (`plugin:brindley:core`, then `brindley`), and discovering the server through the engine API, which the repo's code doesn't show exists.
- **Q4** Lockstep with Brindley. `scripts/plugin-version.mjs` `--prepare` (`npm run release:prepare`) stamps the sidebar's `.claude-plugin/plugin.json` `version` with the same release version as the core plugin. `--check`, run in `.github/workflows/plugin.yml`, fails unless it matches. Sidebar X.Y.Z is the one built against Brindley X.Y.Z's tool output (the sidebar parses that output in `hooks/lib/brindley.ts`; upstream `4875741` was a fix for 5.0.0's changed `list` output). Rejected: its own hand-bumped version line (upstream 0.1.0), which records no server compatibility and can be forgotten.
- **Q5** The upstream `docs/initiatives/` collection (`cbs`) is not copied in. Its open bug, cbs#2, is now initiatives#55 in this collection. cbs#1, the done design record, stays upstream, and the sidebar README links to it. Rejected: copying the folder in as a second `cbs` collection, which would split the roadmap in two; and dropping both, which would lose a known bug.
- **Q6** Development moves to this repo; Darren Smith (dcsmiff) has agreed (told Chris directly, 2026-11-25). He contributes by PR here. Once the sidebar ships from Brindley's marketplace, the upstream repo is archived, with its README pointing to `brindley-sidebar@brindley`; dcsmiff does that, since it's his repo. Rejected: keeping upstream as the place he develops it and copying changes here by hand, which leaves two places to fix bugs and can't work with Q2 (no subtree route) or Q4 (versions stamped by this repo's release).
- **Q7** The sidebar keeps its own toolchain. `.github/workflows/plugin.yml` adds `plugin validate --strict` and `plugin test` for the sidebar folder, using the same pinned Claude Code (`@anthropic-ai/claude-code@2.1.308`), and its `paths` filter covers the sidebar folder. vitest (`npm test`, no config today) excludes the sidebar folder, so its `claude-code/testing` imports never reach vitest. Brindley's `tsc` already covers only `src` (`tsconfig.json:16`). Rejected: porting the tests to vitest. The eight logic files would port by swapping an import, but `test/register.test.tsx` and `test/pane.test.tsx` drive the engine (`$.session.start`, `$.ui.mount`, `$.command.run`, `$.tool.call`, `mock.clock`, `mock.store`). A home-made fake of the engine would keep passing when the real engine changes. Also rejected: splitting the files between two runners.

## Open questions

- **Q8** (implementation) Type-check in CI: the sidebar's `tsconfig.json` extends `.claude-plugin/types/tsconfig.json`, which the engine writes on a `claude --plugin-dir` run and which is gitignored. If CI can generate it headlessly, add a `tsc -p` step to `plugin.yml`; otherwise rely on `plugin test`. Record which.

## Acceptance criteria

- `.claude-plugin/marketplace.json` lists `brindley-sidebar` next to `brindley`.
  `/plugin install brindley-sidebar@brindley`, with the core plugin installed, gives a working
  pane with no `server` setting (Q1, Q3).
- The sidebar is brought in as one conventional commit naming upstream `4875741` (or the commit
  copied), with dcsmiff credited in a `Co-Authored-By:` trailer, the sidebar README and
  `plugin.json` `author`. The MIT licence notice is kept (Q2).
- `npm run release:prepare` stamps the sidebar's version with the core plugin's, and
  `plugin-version.mjs --check` in CI fails on a mismatch (Q4).
- `plugin.yml` validates and tests the sidebar with the pinned Claude Code, and `npm test` doesn't
  pick up the sidebar's tests (Q7).
- The upstream `docs/initiatives/` collection isn't copied; the sidebar README links to cbs#1
  upstream (Q5).
- Project docs describe the sidebar, its install and options, including setting `server` when
  Brindley isn't connected through the core plugin, on the Claude Code page from #53 if it has
  landed, or else in getting-started.
