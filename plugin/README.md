# Brindley plugin for Claude Code

[Brindley](https://duckasteroid.github.io/brindley/) keeps planned work — initiatives, also called
tickets or issues — as Markdown files in your git repository, and gives your agent the tools to
design them fully before anyone starts building.

## Install

```sh
claude plugin install brindley --marketplace duckAsteroid/brindley
```

or, inside a session:

```text
/plugin marketplace add duckAsteroid/brindley
/plugin install brindley@brindley
```

## What it adds

- **The Brindley MCP server**, at an exact version that moves only when the plugin updates
  (`claude plugin update brindley@brindley`). It needs Node 20+ and git, and works on the repository
  the session is started in.
- **Skills** for the workflows: `/brindley:design-review <ref>`, `/brindley:implement <ref>`,
  `/brindley:spike <ref>` and `/brindley:triage [collection]`.
- **An agent**, `brindley:implementer`, that implements one initiative from its brief through to
  `complete`.

## Allow the tools

A plugin cannot grant itself permissions, so Claude Code asks before each Brindley tool call until
you allow them. To allow them all, add the rule to `.claude/settings.json` (for the repo) or
`~/.claude/settings.json` (for you):

```json
{
  "permissions": {
    "allow": ["mcp__plugin_brindley_brindley"]
  }
}
```

## Get started

Ask your agent to *"make `docs/plans` a collection"*, then *"create a feature ticket in plans called
…"*. The [getting-started guide](https://duckasteroid.github.io/brindley/guide/getting-started)
covers the rest.
