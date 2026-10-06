import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import {
  ASSET_DIR,
  INITIATIVE_FILE,
  type Collection,
  type CollectionMeta,
  type Initiative,
  type Ref,
  type Root,
  type RootMeta,
} from "./model.js";
import { h1, humanise, parseAcceptance, parseFrontMatter, parseQuestions, splitFrontMatter } from "./markdown.js";

export const ROOT_CANDIDATES = ["initiatives", join("docs", "initiatives")];
const SKIP_DIRS = new Set(["node_modules", ".git"]);

export function toPosix(p: string): string {
  return p.split(sep).join("/");
}

export function findRepoRoot(start: string): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(start);
    dir = parent;
  }
}

export function hasRootMarker(dir: string): boolean {
  const readme = join(dir, "README.md");
  if (!existsSync(readme)) return false;
  const { fmText } = splitFrontMatter(readFileSync(readme, "utf8"));
  const { data } = parseFrontMatter(fmText);
  return data["brindley"] !== undefined;
}

export interface Locate {
  repoRoot: string;
  dir: string | null;
}

/** Find the initiatives root: explicit dir, BRINDLEY_DIR, then the default candidates. */
export function locateRoot(cwd: string, explicit?: string): Locate {
  const repoRoot = findRepoRoot(cwd);
  const chosen = explicit ?? process.env["BRINDLEY_DIR"];
  if (chosen) {
    const dir = resolve(repoRoot, chosen);
    return { repoRoot, dir: existsSync(dir) ? dir : null };
  }
  for (const c of ROOT_CANDIDATES) {
    const dir = join(repoRoot, c);
    if (hasRootMarker(dir)) return { repoRoot, dir };
  }
  return { repoRoot, dir: null };
}

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  return String(v);
}

function strList(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  return (Array.isArray(v) ? v : [v]).map((x) => String(x));
}

export function parseRef(raw: unknown, fromCollection: string): Ref {
  if (typeof raw === "number" && Number.isInteger(raw)) {
    return { kind: "initiative", raw: String(raw), collection: fromCollection, number: raw };
  }
  const s = String(raw).trim();
  if (/^\d+$/.test(s)) return { kind: "initiative", raw: s, collection: fromCollection, number: Number(s) };
  const m = /^(.+)#(\d+)$/.exec(s);
  if (m) return { kind: "initiative", raw: s, collection: m[1]!.replace(/^\/+|\/+$/g, ""), number: Number(m[2]) };
  return { kind: "external", raw: s };
}

export function refKey(collection: string, number: number): string {
  return `${collection}#${number}`;
}

export function loadInitiative(file: string, rootDir: string, collection: string): Initiative {
  const name = file.split(sep).pop()!;
  const m = INITIATIVE_FILE.exec(name)!;
  const text = readFileSync(file, "utf8");
  const { fmText, body } = splitFrontMatter(text);
  const { data: fm, error } = parseFrontMatter(fmText);
  const problems: string[] = [];
  if (error) problems.push(`front-matter does not parse: ${error}`);
  if (fmText === null) problems.push("no front-matter");
  const dependsOn = strListOrNums(fm["depends_on"]).map((r) => parseRef(r, collection));
  const related = strListOrNums(fm["related"]).map((r) => parseRef(r, collection));
  return {
    collection,
    number: Number(m[1]),
    slug: m[2]!,
    file,
    rel: toPosix(relative(rootDir, file)),
    fm,
    fmText,
    body,
    title: h1(body),
    status: str(fm["status"]),
    statusNote: str(fm["status_note"]),
    type: str(fm["type"]),
    tags: strList(fm["tags"]),
    owner: str(fm["owner"]),
    updated: str(fm["updated"]),
    dependsOn,
    related,
    supersededBy: fm["superseded_by"] !== undefined ? parseRef(fm["superseded_by"], collection) : undefined,
    docs: strList(fm["docs"]),
    docsImpact: fm["docs_impact"],
    questions: parseQuestions(body),
    acceptance: parseAcceptance(body),
    problems,
  };
}

function strListOrNums(v: unknown): unknown[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function readCollectionMeta(readme: string, path: string): { meta: CollectionMeta; hasReadme: boolean } {
  const folder = path.split("/").pop() ?? path;
  const defaults: CollectionMeta = { title: humanise(folder), status: "active" };
  if (!existsSync(readme)) return { meta: defaults, hasReadme: false };
  const { fmText } = splitFrontMatter(readFileSync(readme, "utf8"));
  const { data } = parseFrontMatter(fmText);
  return {
    hasReadme: true,
    meta: {
      title: str(data["title"]) ?? defaults.title,
      summary: str(data["summary"]),
      status: str(data["status"]) ?? "active",
      owner: str(data["owner"]),
      link: str(data["link"]),
      agent: str(data["agent"]),
      docs: data["docs"] !== undefined ? strList(data["docs"]) : undefined,
    },
  };
}

function readRootMeta(readme: string): RootMeta {
  if (!existsSync(readme)) return { format: 1 };
  const { fmText } = splitFrontMatter(readFileSync(readme, "utf8"));
  const { data } = parseFrontMatter(fmText);
  const tagsRaw = data["tags"];
  let tags: Record<string, string> | undefined;
  if (Array.isArray(tagsRaw)) tags = Object.fromEntries(tagsRaw.map((t) => [String(t), ""]));
  else if (tagsRaw && typeof tagsRaw === "object")
    tags = Object.fromEntries(Object.entries(tagsRaw).map(([k, v]) => [k, v == null ? "" : String(v)]));
  return {
    format: Number(data["brindley"] ?? 1),
    agent: str(data["agent"]),
    docs: data["docs"] !== undefined ? strList(data["docs"]) : undefined,
    types: data["types"] !== undefined ? strList(data["types"]) : undefined,
    tags,
  };
}

function readmeHasFrontMatter(readme: string): boolean {
  if (!existsSync(readme)) return false;
  return splitFrontMatter(readFileSync(readme, "utf8")).fmText !== null;
}

export function loadRoot(repoRoot: string, dir: string): Root {
  const collections: Collection[] = [];
  const strays: string[] = [];

  const walk = (d: string) => {
    let entries: string[];
    try {
      entries = readdirSync(d).sort();
    } catch {
      return;
    }
    const files = entries.filter((e) => INITIATIVE_FILE.test(e) && statSync(join(d, e)).isFile());
    const isCollection = d !== dir && (files.length > 0 || readmeHasFrontMatter(join(d, "README.md")));
    if (d === dir) strays.push(...files.map((f) => join(d, f)));
    if (isCollection) {
      const path = toPosix(relative(dir, d));
      const readme = join(d, "README.md");
      const { meta, hasReadme } = readCollectionMeta(readme, path);
      const initiatives = files.map((f) => loadInitiative(join(d, f), dir, path)).sort((a, b) => a.number - b.number);
      collections.push({ path, dir: d, readme, hasReadme, meta, initiatives });
    }
    for (const e of entries) {
      if (e.startsWith(".") || SKIP_DIRS.has(e)) continue;
      // Asset directories belong to an initiative; never treat them as collections.
      if (isCollection && ASSET_DIR.test(e)) continue;
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
    }
  };
  walk(dir);
  collections.sort((a, b) => a.path.localeCompare(b.path));
  const readme = join(dir, "README.md");
  return {
    repoRoot,
    dir,
    rel: toPosix(relative(repoRoot, dir)) || ".",
    readme,
    meta: readRootMeta(readme),
    collections,
    strays,
  };
}

// ---------------------------------------------------------------------------
// Lookup

export function allInitiatives(root: Root): Initiative[] {
  return root.collections.flatMap((c) => c.initiatives);
}

export function findCollection(root: Root, path: string): Collection | undefined {
  const p = path.replace(/^\/+|\/+$/g, "");
  return root.collections.find((c) => c.path === p);
}

export function lookup(root: Root, collection: string, number: number): Initiative | undefined {
  return findCollection(root, collection)?.initiatives.find((i) => i.number === number);
}

export class BrindleyError extends Error {}

/**
 * Resolve a user-supplied reference: "collection#n", a bare number (within
 * `collection`, else across the root when unambiguous), or a path.
 */
export function resolveRef(root: Root, ref: string | number, collection?: string): Initiative {
  const s = String(ref).trim();
  const m = /^(.+)#(\d+)$/.exec(s);
  if (m) {
    const found = lookup(root, m[1]!, Number(m[2]));
    if (!found) throw new BrindleyError(`No initiative ${s}.`);
    return found;
  }
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (collection) {
      if (!findCollection(root, collection)) throw new BrindleyError(`No collection "${collection}".`);
      const found = lookup(root, collection, n);
      if (!found) throw new BrindleyError(`No initiative ${n} in ${collection}.`);
      return found;
    }
    const matches = allInitiatives(root).filter((i) => i.number === n);
    if (matches.length === 1) return matches[0]!;
    if (matches.length === 0) throw new BrindleyError(`No initiative numbered ${n}.`);
    throw new BrindleyError(
      `Initiative ${n} is ambiguous; pass collection or use one of: ${matches.map((i) => refKey(i.collection, i.number)).join(", ")}.`,
    );
  }
  const norm = toPosix(s).replace(/^\.?\//, "");
  const found = allInitiatives(root).find(
    (i) => i.rel === norm || toPosix(relative(root.repoRoot, i.file)) === norm || i.file === resolve(s),
  );
  if (!found) throw new BrindleyError(`No initiative matching "${s}".`);
  return found;
}

export function initiativeKey(i: Initiative): string {
  return refKey(i.collection, i.number);
}
