---
type: feature
status: done
updated: 2026-10-25
docs_impact:
  - README.md
  - MCP-SERVER.md
  - site/guide/getting-started.md
  - site/reference/mcp.md
  - site/reference/cli.md
---
# Install Brindley as a Claude Code plugin

## Goal

A Claude Code user installs Brindley once, with one command, and has the MCP server, its workflows as skills and an implementer agent in every repo — from a marketplace in this repo.

## Problem

Claude Code setup today is `claude mcp add brindley -- npx -y brindley@latest` (`README.md:21`, `site/guide/getting-started.md:17`). What follows it is the friction:

1. **Per repo.** `claude mcp add` registers the server for the current project only, so it is repeated in every repo, or each repo commits an `.mcp.json` (`getting-started.md:45-46`). The guide doesn't mention `-s user`.
2. **The workflows are hard to find.** `design-review`, `implement`, `spike` and `triage` (MCP-SERVER.md §5) appear only as `/mcp__brindley__<name>` MCP prompts, and can carry nothing Claude Code-specific.
3. **Permission prompts.** Every tool call asks until the user allows `mcp__brindley`; the guide doesn't say how.
4. **`@latest` at every start.** `npx -y brindley@latest` runs whichever version was published most recently each time a session starts — the risk the `security` theme closes on the publishing side — and needs the network and a slow first start.
5. **Agent rules are pasted by hand.** `init` prints a snippet for `CLAUDE.md`/`AGENTS.md` (`getting-started.md:57-59`).

## Design

### Plugin and marketplace in this repo

Brindley ships a Claude Code plugin, and this repo is its marketplace — publishing needs no submission, only `.claude-plugin/marketplace.json` pushed to `main`:

```
.claude-plugin/
  marketplace.json      # marketplace "brindley", one plugin entry
plugin/                 # the plugin root (marketplace source "./plugin")
  .claude-plugin/plugin.json
  .mcp.json             # "brindley": npx -y brindley@<pinned version>
  skills/
    design-review/SKILL.md
    implement/SKILL.md
    spike/SKILL.md
    triage/SKILL.md
  agents/
    implementer.md
  README.md
```

Users install with `claude plugin install brindley --marketplace duckAsteroid/brindley` (checked with Claude Code v2.1.308), or `/plugin marketplace add duckAsteroid/brindley` then `/plugin install brindley@brindley`.

- **Pinned server.** `.mcp.json` runs an exact version, never `@latest`. `npm run release:prepare`
  writes the next version into it and into `plugin.json`'s `version` and commits that before the
  release is tagged; `release.yml` refuses a tag the plugin files don't match. A plugin update is
  what moves users to a new server.
- **Skills wrap the prompts.** A `brief` tool returns the text of a workflow prompt, built by the
  same function as the prompt. Each skill calls `brief` and adds what is specific to Claude Code —
  e.g. `design-review`'s "open chat, never a form tool" names Claude Code's question tool. The
  MCP prompts stay the client-neutral source.
- **Implementer agent.** A generic sub-agent for `implement`: gets its brief from `brief`, calls
  `use_worktree` when working in a worktree, runs `check_ready` and stops on failure, follows the collection's `agent:` file, and
  finishes with `complete`.
- **Metadata.** Permanent kebab-case name `brindley`; `displayName`, `description`, `author`,
  `homepage` (the docs site) and `repository` set; a plugin `README.md`.
- **Validated in CI.** `claude plugin validate --strict` (Claude Code pinned to an exact version)
  runs on the marketplace and the plugin in `.github/workflows/plugin.yml` on every push or pull
  request that touches them, and in `release.yml` before publishing, beside
  `scripts/plugin-version.mjs --check`.

### Docs

The getting-started pages describe the plugin as the way Claude Code users set up
Brindley:

- **`site/guide/getting-started.md` §1 "Connect your agent".** A Claude Code section installs the
  plugin (`claude plugin install brindley --marketplace duckAsteroid/brindley`, and the
  `/plugin marketplace add` + `/plugin install` route), says what it brings (the tools, the four
  skills as `/brindley:<name>`, the implementer agent, in every repo) and that it runs a pinned
  server version that moves with `claude plugin update`. `claude mcp add` stays as the
  plugin-free route, with `-s user` so it applies to every repo. The page shows how to allow the
  tools in `.claude/settings.json` — `mcp__plugin_brindley_brindley` for the plugin,
  `mcp__brindley` for `claude mcp add`; a plugin cannot grant permissions itself. The opencode and
  other-client snippets are unchanged.
- **`README.md` "Quick start".** Shows the plugin install for Claude Code, with `claude mcp add`
  and the other clients pointed to the getting-started guide.
- **`MCP-SERVER.md`, `site/reference/mcp.md`, `site/reference/cli.md`** describe the `brief` tool,
  `serve --cwd`, the plugin and `release:prepare`.

## Dependencies

_None._

## Related

- [Write and keep the agent rules in AGENTS.md / CLAUDE.md](../28-write-and-keep-the-agent-rules-in-agents-md-claude-md.md) — the agent-rules snippet, which a plugin does not replace
- [Pin the release toolchain and keep it updated](../41-pin-the-release-toolchain-and-keep-it-updated.md) — the same pin-don't-float policy, for what users run
- [Release only commits on main](../40-release-only-commits-on-main.md) — the plugin version is stamped by the same release
- [Submit the Brindley plugin to Anthropic's directory](../46-submit-the-brindley-plugin-to-anthropic-s-directory.md) — the possible future enhancement
- https://code.claude.com/docs/en/plugins/publish.md — publishing a plugin: own marketplace and the directory
- https://code.claude.com/docs/en/plugins/anthropic-marketplaces.md — official, community and demo marketplaces

## Decisions

- Self-hosted only: the plugin ships from this repo's marketplace. Submitting it to Anthropic's
  directory is a possible future enhancement, not part of this initiative.
- The plugin lives in a `plugin/` sub-folder; `.claude-plugin/marketplace.json` at the repo root points to it with `"source": "./plugin"`. Its files stay together, apart from the npm package's source, and this repo's own project MCP config is unaffected.
- No `SessionStart` hook. The server's on-connect instructions explain the format, and the agent calls `collections` and `ready` when it needs the repo's state.
- `brindley serve --cwd <dir>` works on the repository at `<dir>`, and the plugin's `.mcp.json` passes `--cwd ${CLAUDE_PROJECT_DIR}`: the plugin docs don't say what working directory a plugin's stdio server starts in, but `${CLAUDE_PROJECT_DIR}` (the project root) is substituted in its `args`. Checked with a headless session: the server worked on the session's repo.
- Every plugin component is namespaced under the manifest name: the skills run as `/brindley:design-review`, `/brindley:implement`, `/brindley:spike` and `/brindley:triage`, and the agent is `brindley:implementer`. The server's tools are named `mcp__plugin_brindley_brindley__<tool>` (plugin name, then server key), not `mcp__brindley__<tool>`, so the allow rule for plugin users is `mcp__plugin_brindley_brindley`.
- Stamped before tagging. `npm run release:prepare` (`scripts/plugin-version.mjs --prepare`) computes the next version with `scripts/version.mjs`, writes it into `plugin/.claude-plugin/plugin.json` (`version`) and `plugin/.mcp.json` (`brindley@<version>`), and commits `chore(release): v<version>` (nothing, if the plugin already names it); the maintainer tags that commit and pushes `main` and the tag together. `release.yml` fails a release whose plugin files don't name the tag's version, beside its computed-version check. A `chore` commit doesn't bump the computed version, and the tagged commit is on `main`. `main` can name a version for the few minutes before npm publishes it; third-party marketplaces don't auto-update by default, so few users reach that window.
- A `brief` tool. `brief({ workflow, ref?, collection? })` returns the text of the `design-review`, `implement`, `spike` or `triage` prompt, from the same builder as the prompt, so the two cannot drift apart. Each skill calls `brief` with its arguments, follows the result, and adds what is specific to Claude Code; the implementer agent calls it too. Claude Code gives the model no way to fetch an MCP prompt, so a skill cannot use the prompt itself.

## Open questions

_None._

## Acceptance criteria

- `claude plugin install brindley --marketplace duckAsteroid/brindley` installs the plugin; in any
  git repo, a new session has the Brindley tools, the four skills and the implementer agent.
- The plugin runs an exact server version; `npm run release:prepare` updates `plugin.json`'s
  `version` and the pinned version together in the commit that is tagged, `release.yml` refuses a
  tag they don't match, and `claude plugin update` moves users to it.
- `claude plugin validate --strict` passes in CI and is a step of `release.yml`.
- The getting-started guide's Claude Code setup and `README.md`'s quick start lead with the
  plugin and describe what it installs, allowing its tools (`mcp__plugin_brindley_brindley`), and the `claude mcp add -s user`
  and other-client routes.
- Settled decisions on the working directory and skill namespacing questions, recorded here.

## Appendix: Rejected alternatives

- **Plugin at the repo root** (`source: "./"`): a root `.mcp.json` would also be this repo's own
  project MCP config, giving Brindley's developers the pinned published server instead of the one
  they work on. (Keeping the plugin out of the npm package was no reason either way: npm publishes
  only `dist/`.)
- **A `SessionStart` hook** reporting collections and what is ready: it would run a command at the
  start of every session in every repo, need new CLI surface, and slow startup.
- **CI committing the plugin version back to `main`** after publishing: it needs write access to a
  protected `main`.
- **No `version` in `plugin.json`**, so each commit is an update: the pinned server version in
  `.mcp.json` still has to be committed.
- **Skills restating the workflow steps**: two copies of every workflow, which drift apart.
- **Generating the skills from the prompts at build time**: a rework of all four prompt builders,
  with the skills still needing the data from tools.
- **Submitting to Anthropic's directory here**: it depends on a paid-plan account and Anthropic's
  review; it is a separate possible enhancement.
