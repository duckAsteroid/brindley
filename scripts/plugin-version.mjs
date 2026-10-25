#!/usr/bin/env node
// Keeps the Claude Code plugin (plugin/) on one exact server version. Claude Code reads the plugin
// from this repo's main branch, so the version must be committed before the release is tagged.
//
// Usage: node scripts/plugin-version.mjs                 print the version the plugin files name
//        node scripts/plugin-version.mjs --check <ver>   exit 1 unless both plugin files name <ver>
//        node scripts/plugin-version.mjs --prepare       write the next release's version into the
//                                                        plugin files and commit them (npm run release:prepare)
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { computeVersion } from "./version.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = join(ROOT, "plugin");
const MANIFEST = join(".claude-plugin", "plugin.json");
const MCP = ".mcp.json";
const PACKAGE = /^brindley@(.+)$/;

const readJson = (dir, file) => JSON.parse(readFileSync(join(dir, file), "utf8"));
const writeJson = (dir, file, value) => writeFileSync(join(dir, file), `${JSON.stringify(value, null, 2)}\n`);

/** The versions the plugin manifest and its MCP server config name. */
export function pluginVersions(dir = PLUGIN) {
  const server = readJson(dir, MCP).mcpServers.brindley.args.map((a) => PACKAGE.exec(a)?.[1]).find(Boolean) ?? null;
  return { manifest: readJson(dir, MANIFEST).version ?? null, server };
}

/** Write `version` into the plugin manifest and the npx package spec of its MCP server. */
export function stampPlugin(version, dir = PLUGIN) {
  const manifest = readJson(dir, MANIFEST);
  manifest.version = version;
  writeJson(dir, MANIFEST, manifest);
  const mcp = readJson(dir, MCP);
  const args = mcp.mcpServers.brindley.args;
  const at = args.findIndex((a) => PACKAGE.test(a));
  if (at < 0) throw new Error(`${MCP} has no brindley@<version> argument to stamp`);
  args[at] = `brindley@${version}`;
  writeJson(dir, MCP, mcp);
}

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [arg, value] = process.argv.slice(2);
  if (arg === "--check") {
    const v = pluginVersions();
    if (v.manifest !== value || v.server !== value) {
      process.stderr.write(`plugin names ${JSON.stringify(v)}, not ${value}; run npm run release:prepare before tagging\n`);
      process.exit(1);
    }
    process.stdout.write(`${value}\n`);
  } else if (arg === "--prepare") {
    if (git("status", "--porcelain", "--untracked-files=no")) {
      process.stderr.write("Commit or stash your changes first: the release commit holds only the plugin version.\n");
      process.exit(1);
    }
    const v = computeVersion();
    if (v.onTag || v.bump === "none") {
      process.stderr.write(`Nothing to release since ${v.base ?? "the first commit"} (no feat, fix, perf or breaking commits).\n`);
      process.exit(1);
    }
    const version = v.version.replace(/-SNAPSHOT$/, "");
    const current = pluginVersions();
    if (current.manifest === version && current.server === version) {
      process.stdout.write(`The plugin already names ${version}; nothing to commit.\n`);
    } else {
      stampPlugin(version);
      git("add", join("plugin", MANIFEST), join("plugin", MCP));
      git("commit", "-m", `chore(release): v${version}`);
      process.stdout.write(`Committed the plugin at ${version}.\n`);
    }
    process.stdout.write(`Tag and push it:\n  git tag -a v${version} -m "<highlights>" && git push origin main v${version}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(pluginVersions())}\n`);
  }
}
