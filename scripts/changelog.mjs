#!/usr/bin/env node
// Release notes from git: each final release tag (vX.Y.Z), newest first, with the annotated tag's
// message as highlights (if any) and the feat / fix / perf / breaking commits since the previous
// release tag as details. Uses the same Conventional Commits rules as scripts/version.mjs; other
// commit types (docs, chore, test, …) are left out.
//
// Usage: node scripts/changelog.mjs           Markdown for every release
//        node scripts/changelog.mjs v1.2.0    Markdown for one release (the GitHub Release notes)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { classify } from "./version.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;
const GROUPS = [
  ["breaking", "Breaking changes"],
  ["features", "Features"],
  ["fixes", "Fixes"],
  ["performance", "Performance"],
];

function git(cwd, ...args) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

/** The repository's web URL, from package.json, for commit links. */
export function repoUrl(cwd = ROOT) {
  try {
    const url = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")).repository?.url;
    return url ? url.replace(/^git\+/, "").replace(/\.git$/, "") : null;
  } catch {
    return null;
  }
}

/** Which group a commit belongs in, if any, and its text without the type prefix. */
function entry(subject, body) {
  const c = classify(subject, body);
  const group =
    c.bump === "major" ? "breaking" : c.type === "feat" ? "features" : c.type === "fix" ? "fixes" : c.type === "perf" ? "performance" : null;
  if (!group) return null;
  const m = /^\w+(?:\(([^)]*)\))?!?: (.*)$/.exec(subject);
  return { group, scope: m?.[1] || null, text: m ? m[2] : subject };
}

/** Every final release tag, newest first, with its highlights and grouped details. */
export function releases(cwd = ROOT) {
  const refs = (git(cwd, "for-each-ref", "--sort=-v:refname", "--format=%(refname:short)%1f%(objecttype)%1f%(creatordate:short)%1f%(contents)%1e", "refs/tags/v*") ?? "")
    .split("\x1e")
    .map((r) => r.replace(/^\n/, ""))
    .filter(Boolean)
    .map((r) => {
      const [tag, type, date, message] = r.split("\x1f");
      return { tag, annotated: type === "tag", date, message: (message ?? "").replace(/-----BEGIN PGP SIGNATURE-----[\s\S]*$/, "").trim() };
    })
    .filter((r) => RELEASE_TAG.test(r.tag));
  return refs.map((r, k) => {
    const previous = refs[k + 1]?.tag;
    const log = git(cwd, "log", "--no-merges", "--format=%h%x1f%s%x1f%b%x1e", previous ? `${previous}..${r.tag}` : r.tag) ?? "";
    const details = Object.fromEntries(GROUPS.map(([key]) => [key, []]));
    for (const rec of log.split("\x1e")) {
      const [sha, subject, body] = rec.replace(/^\n/, "").split("\x1f");
      if (!sha || !subject) continue;
      const e = entry(subject, body ?? "");
      if (e) details[e.group].push({ sha, scope: e.scope, text: e.text });
    }
    return {
      tag: r.tag,
      version: r.tag.slice(1),
      date: r.date,
      previous: previous ?? null,
      highlights: r.annotated && r.message ? r.message : null,
      details,
    };
  });
}

/** One release as Markdown: highlights, then details by group. */
export function releaseMarkdown(release, url = repoUrl()) {
  const out = [];
  if (release.highlights) out.push(release.highlights, "");
  let any = false;
  for (const [key, title] of GROUPS) {
    const items = release.details[key];
    if (!items.length) continue;
    any = true;
    out.push(`### ${title}`, "");
    for (const i of items) {
      const sha = url ? `[${i.sha}](${url}/commit/${i.sha})` : i.sha;
      out.push(`- ${i.scope ? `**${i.scope}:** ` : ""}${i.text} (${sha})`);
    }
    out.push("");
  }
  if (!any) out.push("_No feature, fix or performance changes — maintenance only._", "");
  if (url && release.previous) out.push(`[All changes since ${release.previous}](${url}/compare/${release.previous}...${release.tag})`, "");
  return out.join("\n").trimEnd() + "\n";
}

/** Every release as one Markdown document, newest first. */
export function changelogMarkdown(rels, url = repoUrl()) {
  return rels.map((r) => `## ${r.version} — ${r.date}\n\n${releaseMarkdown(r, url)}`).join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const all = releases();
  const tag = process.argv[2];
  if (tag) {
    const r = all.find((x) => x.tag === tag);
    if (!r) {
      process.stderr.write(`No release tag ${tag} (final vX.Y.Z tags only).\n`);
      process.exit(1);
    }
    process.stdout.write(releaseMarkdown(r));
  } else process.stdout.write(changelogMarkdown(all));
}
