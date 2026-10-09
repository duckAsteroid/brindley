#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { relative, resolve } from "node:path";
import { createServer, VERSION } from "./server.js";
import { openRepo, toPosix } from "./repo.js";
import { summarise, validate } from "./validate.js";
import { createCollection, fix, regenerateReadmes, repad, tidy } from "./ops.js";
import { writeReport } from "./report.js";

const USAGE = `brindley ${VERSION} — Design fully before anyone digs.

Usage:
  brindley [serve] [--no-auto-readme]     Run the MCP server on stdio (default)
  brindley init [<folder>] [--name <n>]   Mark a folder (default: the current one) as a collection
  brindley validate [--docs]              Check every collection; exits 1 on errors
  brindley validate --fix [--write]       Plan (or with --write, make) the repairs with one obvious fix:
                                          broken links to a moved initiative, front-matter dependencies
  brindley readmes [--check]              Regenerate collection README blocks; --check exits 1 if stale
  brindley tidy <collection> [--write]     Move a collection's initiatives into the folders its
                                          \`folders:\` declares, rewriting links; plans only unless --write
  brindley repad <collection> [<width>] [--write]
                                          Pad a collection's numbers to one width (default: the one most
                                          files use), renaming files and rewriting links; plans only
                                          unless --write
  brindley report [options]               Write a one-page progress report (HTML) from the collections
                                          and their git history; prints the file's path
      --since <tag|date|window>           Start of "this period" (e.g. v1.2.0, 2026-09-01, 4w, 30d, 3m);
                                          default: the latest release that something changed after
      --until <tag|date|window>           Report as of then (default: the latest commit)
      --collection <name>                 Just one collection
      --out <file>                        Default: build/brindley-report.html
      --palette <name|file>               sea (default), plum, forest, fire, teal, slate, or a .json /
                                          .css palette file
      --mode auto|light|dark              Where the page's light/dark switch starts (default auto)
      --branches <glob>                   Branches to count in-progress work on (repeatable; !<glob>
                                          excludes); default: all
      --no-branches                       Count no branches' in-progress work
      --worktrees [<glob>]                Also count other worktrees' uncommitted work (repeatable)
`;

function flag(args: string[], name: string): boolean {
  const i = args.indexOf(name);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
}

/** Every value of a repeatable option. */
function options(args: string[], name: string): string[] {
  const out: string[] = [];
  for (let v = option(args, name); v !== undefined; v = option(args, name)) out.push(v);
  return out;
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
    case "tidy": {
      const write = flag(args, "--write");
      if (!args[0]) {
        process.stderr.write(USAGE);
        process.exit(2);
      }
      const r = tidy(openRepo(process.cwd()), args[0], { dry_run: !write });
      for (const m of r.result.moves) console.log(`${write ? "moved" : "move"}  ${m.from} → ${m.to}`);
      for (const w of r.result.rewrites) console.log(`${write ? "relinked" : "relink"} ${w.file}:${w.line}  ${w.before} → ${w.after}`);
      if (r.result.moves.length === 0) console.log(`${r.result.collection} is already tidy.`);
      else if (!write) console.log("\nDry run. Re-run with --write to apply.");
      return;
    }
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
    case "report": {
      const noBranches = flag(args, "--no-branches");
      const branches = options(args, "--branches");
      // --worktrees takes an optional glob: a value only when the next word isn't another option.
      const worktrees: string[] = [];
      let allTrees = false;
      for (let k = args.indexOf("--worktrees"); k >= 0; k = args.indexOf("--worktrees")) {
        const next = args[k + 1];
        if (next !== undefined && !next.startsWith("--")) {
          worktrees.push(next);
          args.splice(k, 2);
        } else {
          allTrees = true;
          args.splice(k, 1);
        }
      }
      const mode = option(args, "--mode");
      if (mode !== undefined && !["auto", "light", "dark"].includes(mode)) throw new Error(`--mode must be auto, light or dark (got ${mode}).`);
      const r = writeReport(openRepo(process.cwd()), {
        since: option(args, "--since"),
        until: option(args, "--until"),
        collection: option(args, "--collection"),
        out: option(args, "--out"),
        palette: option(args, "--palette"),
        mode: mode as "auto" | "light" | "dark" | undefined,
        branches: noBranches ? false : branches.length ? branches : undefined,
        worktrees: allTrees ? true : worktrees.length ? worktrees : undefined,
        cwd: process.cwd(),
      });
      console.log(relative(process.cwd(), r.file) || r.file);
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
