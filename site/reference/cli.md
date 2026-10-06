# CLI

```
brindley [serve] [--no-auto-readme]     Run the MCP server on stdio (default)
brindley init [<folder>] [--name <n>]   Mark a folder (default: the current one) as a collection
brindley validate [--docs]              Check every collection; exits 1 on errors
brindley readmes [--check]              Regenerate collection README blocks; --check exits 1 if stale
brindley --version
```

Run from anywhere inside the repository. Without `npm link`, use `node /path/to/brindley/dist/cli.js`.

## In CI

```yaml
- run: node path/to/brindley/dist/cli.js validate
- run: node path/to/brindley/dist/cli.js readmes --check
```

`validate` fails the build on errors (warnings are printed but pass); `readmes --check` fails if
any generated README block is out of date.

## Self-healing READMEs

While the server runs, every tool call first regenerates any README block that is stale — after
hand edits, `git pull` or a merge — and says so in its result. During a merge or rebase only
blocks with conflict markers are rewritten. `--no-auto-readme` turns this off.
