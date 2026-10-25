<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brindley-logo-dark.svg">
  <img alt="Brindley — Design fully before anyone digs" src="assets/brindley-logo.svg" width="300">
</picture>

Plan work as Markdown in your git repo. Settle every open question with your AI agent, then hand
it over to build — with an MCP server that keeps it all straight.

**📖 Documentation: [duckasteroid.github.io/brindley](https://duckasteroid.github.io/brindley/)**
— [getting started](https://duckasteroid.github.io/brindley/guide/getting-started),
[concepts](https://duckasteroid.github.io/brindley/guide/concepts),
[the workflow](https://duckasteroid.github.io/brindley/guide/workflow),
[why "Brindley"?](https://duckasteroid.github.io/brindley/story)

## Quick start

For Claude Code, install the plugin once and it works in every repo (Node 20+ and git):

```sh
claude plugin install brindley --marketplace duckAsteroid/brindley
```

It brings the MCP server at a pinned version, the workflows as skills (`/brindley:design-review`,
`/brindley:implement`, `/brindley:spike`, `/brindley:triage`) and an implementer agent. Allow its
tools with the permission rule `mcp__plugin_brindley_brindley`.

Then ask your agent to *"make `docs/plans` a collection"*. For the people outside the team,
`npx -y brindley@latest report` writes a one-page progress report from the collections and their
git history ([example](https://duckasteroid.github.io/brindley/guide/reporting)). Without the plugin
(`claude mcp add -s user brindley -- npx -y brindley@latest`) and for other MCP clients (opencode,
…), see [getting started](https://duckasteroid.github.io/brindley/guide/getting-started).

## Developing Brindley

```sh
npm test                  # unit + MCP-level tests
npm run build             # stamps the version, compiles to dist/
npm run version:explain   # how the current version is computed
cd site && npm install && npm run dev   # the documentation site
```

The version comes from git: the last `vX.Y.Z` tag, bumped by the Conventional Commits since it
(`feat` → minor, `fix`/`perf` → patch, `!` → major), with `-SNAPSHOT` off-tag — the same rules as
[gradle-versioning](https://github.com/duckAsteroid/gradle-versioning). Release with
`npm run release:prepare`, which commits the next version into the Claude Code plugin (`plugin/`),
then tag and push — `git tag -a v1.0.0 -m "<highlights>" && git push origin main v1.0.0` — and the
Release workflow checks the plugin names the tag's version, validates it, tests, publishes to npm
(with provenance) and creates a GitHub Release. Its notes, and the site's
[Releases](https://duckasteroid.github.io/brindley/releases) page, come from
`node scripts/changelog.mjs`: the annotated tag's message as highlights (optional — a plain tag
gives none), then the `feat`, `fix`, `perf` and breaking commits since the previous release.

Design documents: [FORMAT.md](FORMAT.md) (the file format) and [MCP-SERVER.md](MCP-SERVER.md)
(the server). Documentation pages live in [`site/`](site/) and publish to GitHub Pages on push.

## Licence

[MIT](LICENSE) © 2026 Chris Senior
