#!/usr/bin/env node
// Releases from main in one step: commits the next version into the plugin (as release:prepare
// does), tags it, and pushes main and the tag together, which starts the Release workflow.
//
// Usage: npm run release -- ["<highlights>"] [--dry-run]
//   <highlights>  the annotated tag's message, shown at the top of the release notes; without it
//                 the tag is a plain one and the notes list only the commits
//   --dry-run     check and say what would happen, changing nothing
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareRelease } from "./plugin-version.mjs";
import { computeVersion } from "./version.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const highlights = args.filter((a) => a !== "--dry-run").join(" ").trim();

const branch = git("rev-parse", "--abbrev-ref", "HEAD");
if (branch !== "main") fail(`Release from main, not ${branch}.`);
if (git("status", "--porcelain", "--untracked-files=no")) fail("Commit or stash your changes first.");
git("fetch", "--quiet", "origin", "main");
if (git("rev-list", "--count", "HEAD..origin/main") !== "0") fail("main is behind origin/main: pull first.");

if (dryRun) {
  const v = computeVersion();
  if (v.onTag || v.bump === "none") fail(`Nothing to release since ${v.base ?? "the first commit"}.`);
  const version = v.version.replace(/-SNAPSHOT$/, "");
  process.stdout.write(`Would release v${version} (${v.bump} bump since ${v.base ?? "the first commit"}), `);
  process.stdout.write(highlights ? `with highlights:\n  ${highlights}\n` : "without highlights (plain tag).\n");
  process.exit(0);
}

let version;
try {
  ({ version } = prepareRelease());
} catch (e) {
  fail(e.message);
}
const tag = `v${version}`;
if (highlights) git("tag", "-a", tag, "-m", highlights);
else git("tag", tag);
execFileSync("git", ["push", "--atomic", "origin", "main", tag], { cwd: ROOT, stdio: "inherit" });
process.stdout.write(`Pushed ${tag}; the Release workflow publishes it.\n`);
