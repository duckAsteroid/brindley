#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { relative, resolve } from "node:path";
import { createServer, VERSION } from "./server.js";
import { openRepo, toPosix } from "./repo.js";
import { summarise, validate } from "./validate.js";
import { createCollection, regenerateReadmes } from "./ops.js";

const USAGE = `brindley ${VERSION} — Design fully before anyone digs.

Usage:
  brindley [serve] [--no-auto-readme]     Run the MCP server on stdio (default)
  brindley init [<folder>] [--name <n>]   Mark a folder (default: the current one) as a collection
  brindley validate [--docs]              Check every collection; exits 1 on errors
  brindley readmes [--check]              Regenerate collection README blocks; --check exits 1 if stale
`;

function flag(args: string[], name: string): boolean {
  const i = args.indexOf(name);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
}

function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
}

async function main() {
  const args = process.argv.slice(2);
  if (flag(args, "--help") || flag(args, "-h")) {
    process.stdout.write(USAGE);
    return;
  }
  if (flag(args, "--version")) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  const cmd = args.shift() ?? "serve";
  switch (cmd) {
    case "serve": {
      const server = createServer({ cwd: process.cwd(), autoReadme: !flag(args, "--no-auto-readme") });
      await server.connect(new StdioServerTransport());
      return;
    }
    case "init": {
      const name = option(args, "--name");
      const root = openRepo(process.cwd());
      const folder = toPosix(relative(root.repoRoot, resolve(args[0] ?? ".")));
      const r = createCollection(root, folder, { name });
      console.log(`Collection "${r.result.collection}" at ${r.result.path}`);
      for (const t of r.touched) console.log(`  wrote ${t}`);
      if (r.result.agentSnippet) console.log(`\nAdd this to AGENTS.md / CLAUDE.md:\n\n${r.result.agentSnippet}`);
      return;
    }
    case "validate": {
      const docs = flag(args, "--docs");
      const findings = validate(openRepo(process.cwd()), { docs });
      console.log(summarise(findings));
      process.exit(findings.some((f) => f.level === "error") ? 1 : 0);
    }
    // eslint-disable-next-line no-fallthrough
    case "readmes": {
      const check = flag(args, "--check");
      const changes = regenerateReadmes(openRepo(process.cwd()), undefined, check);
      for (const c of changes) console.log(`${check ? "stale" : c.reason}: ${c.path}`);
      if (changes.length === 0) console.log("READMEs are up to date.");
      process.exit(check && changes.length > 0 ? 1 : 0);
    }
    // eslint-disable-next-line no-fallthrough
    default:
      process.stderr.write(USAGE);
      process.exit(2);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
