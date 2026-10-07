#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { relative, resolve } from "node:path";
import { createServer, VERSION } from "./server.js";
import { openRepo, toPosix } from "./repo.js";
import { summarise, validate } from "./validate.js";
import { createCollection, fix, regenerateReadmes, repad } from "./ops.js";

const USAGE = `brindley ${VERSION} — Design fully before anyone digs.

Usage:
  brindley [serve] [--no-auto-readme]     Run the MCP server on stdio (default)
  brindley init [<folder>] [--name <n>]   Mark a folder (default: the current one) as a collection
  brindley validate [--docs]              Check every collection; exits 1 on errors
  brindley validate --fix [--write]       Plan (or with --write, make) the repairs with one obvious fix:
                                          broken links to a moved initiative, front-matter dependencies
  brindley readmes [--check]              Regenerate collection README blocks; --check exits 1 if stale
  brindley repad <collection> [<width>] [--write]
                                          Pad a collection's numbers to one width (default: the one most
                                          files use), renaming files and rewriting links; plans only
                                          unless --write
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
      if (flag(args, "--fix")) {
        const write = flag(args, "--write");
        const r = fix(openRepo(process.cwd()), { dry_run: !write });
        for (const e of r.result.edits) console.log(`${write ? "fixed" : "fix"}  ${e.file}:${e.line} [${e.rule}] ${e.before} → ${e.after}`);
        for (const u of r.result.unfixed) console.log(`left ${u.file}:${u.line} ${u.message}`);
        if (r.result.edits.length === 0) console.log("Nothing to fix.");
        else if (!write) console.log("\nDry run. Re-run with --write to apply.");
        return;
      }
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
    case "repad": {
      const write = flag(args, "--write");
      const [collection, width] = args;
      if (!collection) {
        process.stderr.write(USAGE);
        process.exit(2);
      }
      const r = repad(openRepo(process.cwd()), collection, { width: width ? Number(width) : undefined, dry_run: !write });
      const { moves, rewrites } = r.result;
      for (const m of moves) console.log(`${write ? "renamed" : "rename"}  ${m.from} → ${m.to}`);
      for (const w of rewrites) console.log(`${write ? "relinked" : "relink"} ${w.file}:${w.line}  ${w.before} → ${w.after}`);
      for (const w of r.warnings) console.log(`warning: ${w}`);
      if (moves.length === 0) console.log(`${r.result.collection} is already padded to ${r.result.width} digit${r.result.width === 1 ? "" : "s"}.`);
      else if (!write) console.log(`\nDry run. Re-run with --write to apply.`);
      return;
    }
    default:
      process.stderr.write(USAGE);
      process.exit(2);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
