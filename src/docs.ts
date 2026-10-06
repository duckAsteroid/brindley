import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { Root } from "./model.js";
import { stripCodeFences } from "./markdown.js";
import { changedFiles, git } from "./git.js";
import { toPosix } from "./repo.js";

export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        const slash = glob[i + 2] === "/";
        re += slash ? "(?:.*/)?" : ".*";
        i += slash ? 2 : 1;
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

/** Docs globs in effect: the given collection's, else every collection's combined. */
export function docsGlobs(root: Root, collectionDocs?: string[]): string[] {
  return collectionDocs ?? [...new Set(root.collections.flatMap((c) => c.meta.docs ?? []))];
}

/** Is this repo-relative path inside a collection folder (an initiative, its assets or README)? */
export function inCollection(root: Root, repoPath: string): boolean {
  const p = toPosix(repoPath).replace(/^\.\//, "");
  return root.collections.some((c) => c.path === "." || p === c.path || p.startsWith(c.path + "/"));
}

/** Is this repo-relative path project documentation (and not part of a collection)? */
export function isProjectDoc(root: Root, repoPath: string, globs: string[]): boolean {
  const p = toPosix(repoPath).replace(/^\.\//, "");
  if (inCollection(root, p)) return false;
  return globs.some((g) => globToRegExp(g).test(p));
}

export function allProjectDocs(root: Root): string[] {
  const globs = docsGlobs(root);
  if (globs.length === 0) return [];
  const listed = git(root.repoRoot, ["ls-files", "--cached", "--others", "--exclude-standard"]);
  if (!listed) return [];
  return listed
    .split("\n")
    .filter(Boolean)
    .filter((p) => isProjectDoc(root, p, globs));
}

interface Rule {
  re: RegExp;
  kind: "history" | "debate";
}

/** Phrases that narrate history or design debate rather than describing what is. */
const RULES: Rule[] = [
  { re: /\bpreviously\b/i, kind: "history" },
  { re: /\bno longer\b/i, kind: "history" },
  { re: /\boriginally\b/i, kind: "history" },
  { re: /\bused to\b/i, kind: "history" },
  { re: /\b(?:was|were|has been|have been) (?:changed|replaced|renamed|removed|moved|introduced)\b/i, kind: "history" },
  { re: /\bwe (?:added|changed|introduced|removed|replaced|decided|moved|renamed)\b/i, kind: "history" },
  { re: /\b(?:introduced|added) (?:in|by) (?:initiative|PR|version|v\d)/i, kind: "history" },
  { re: /\bas of (?:this|the latest) (?:change|release|version)\b/i, kind: "history" },
  { re: /\bnow (?:uses|supports|returns|requires|has|is)\b/i, kind: "history" },
  { re: /\brejected (?:alternative|option|approach)s?\b/i, kind: "debate" },
  { re: /\balternatives? considered\b/i, kind: "debate" },
  { re: /\bwe (?:considered|chose|opted)\b/i, kind: "debate" },
];

export interface DocFinding {
  file: string;
  line: number;
  kind: "history" | "debate" | "initiative-link";
  text: string;
}

export function checkDoc(root: Root, repoPath: string): DocFinding[] {
  const abs = join(root.repoRoot, repoPath);
  if (!existsSync(abs)) return [];
  const findings: DocFinding[] = [];
  for (const { line, text } of stripCodeFences(readFileSync(abs, "utf8"))) {
    for (const r of RULES) {
      const m = r.re.exec(text);
      if (m) findings.push({ file: repoPath, line: line + 1, kind: r.kind, text: m[0] });
    }
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const href = m[1]!.split("#")[0]!;
      if (!href || /^[a-z]+:/i.test(href)) continue;
      const target = toPosix(relative(root.repoRoot, resolve(dirname(abs), href)));
      if (inCollection(root, target)) {
        findings.push({ file: repoPath, line: line + 1, kind: "initiative-link", text: m[0] });
      }
    }
  }
  return findings;
}

/** Lint the given docs, else docs changed vs HEAD, else every project doc. */
export function checkDocs(root: Root, paths?: string[]): { checked: string[]; findings: DocFinding[] } {
  let targets = paths;
  if (!targets || targets.length === 0) {
    const globs = docsGlobs(root);
    const changed = changedFiles(root.repoRoot).filter((p) => isProjectDoc(root, p, globs));
    targets = changed.length > 0 ? changed : allProjectDocs(root);
  }
  return { checked: targets, findings: targets.flatMap((p) => checkDoc(root, p)) };
}
