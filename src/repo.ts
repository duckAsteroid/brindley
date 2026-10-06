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
} from "./model.js";
import { h1, humanise, parseAcceptance, parseFrontMatter, parseQuestions, splitFrontMatter } from "./markdown.js";
import { git } from "./git.js";

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

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  return String(v);
}

function strList(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  return (Array.isArray(v) ? v : [v]).map((x) => String(x));
}

export function readFrontMatterOf(file: string): Record<string, unknown> | null {
  if (!existsSync(file)) return null;
  const { fmText } = splitFrontMatter(readFileSync(file, "utf8"));
  if (fmText === null) return null;
  return parseFrontMatter(fmText).data;
}

/** A folder is a collection when its README.md front-matter has a `brindley` key. */
export function isCollectionReadme(readme: string): boolean {
  return readFrontMatterOf(readme)?.["brindley"] !== undefined;
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

function strListOrNums(v: unknown): unknown[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

export function loadInitiative(file: string, repoRoot: string, collection: string): Initiative {
  const name = file.split(sep).pop()!;
  const m = INITIATIVE_FILE.exec(name)!;
  const text = readFileSync(file, "utf8");
  const { fmText, body } = splitFrontMatter(text);
  const { data: fm, error } = parseFrontMatter(fmText);
  const problems: string[] = [];
  if (error) problems.push(`front-matter does not parse: ${error}`);
  if (fmText === null) problems.push("no front-matter");
  return {
    collection,
    number: Number(m[1]),
    slug: m[2]!,
    file,
    rel: toPosix(relative(repoRoot, file)),
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
    dependsOn: strListOrNums(fm["depends_on"]).map((r) => parseRef(r, collection)),
    related: strListOrNums(fm["related"]).map((r) => parseRef(r, collection)),
    supersededBy: fm["superseded_by"] !== undefined ? parseRef(fm["superseded_by"], collection) : undefined,
    docs: strList(fm["docs"]),
    docsImpact: fm["docs_impact"],
    questions: parseQuestions(body),
    acceptance: parseAcceptance(body),
    problems,
  };
}

function tagMap(raw: unknown): Record<string, string> | undefined {
  if (Array.isArray(raw)) return Object.fromEntries(raw.map((t) => [String(t), ""]));
  if (raw && typeof raw === "object")
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v == null ? "" : String(v)]));
  return undefined;
}

function collectionMeta(data: Record<string, unknown>, folder: string): CollectionMeta {
  return {
    title: str(data["title"]) ?? humanise(folder),
    summary: str(data["summary"]),
    status: str(data["status"]) ?? "active",
    owner: str(data["owner"]),
    link: str(data["link"]),
    agent: str(data["agent"]),
    docs: data["docs"] !== undefined ? strList(data["docs"]) : undefined,
    types: data["types"] !== undefined ? strList(data["types"]) : undefined,
    tags: tagMap(data["tags"]),
  };
}

/**
 * Repo-relative paths of every README.md that marks a collection. Uses git to
 * honour .gitignore (which also skips worktrees under ignored folders); falls
 * back to walking the tree outside git.
 */
export function findCollectionReadmes(repoRoot: string): string[] {
  const listed = git(repoRoot, ["ls-files", "--cached", "--others", "--exclude-standard", "--", "README.md", "**/README.md"]);
  let candidates: string[];
  if (listed !== null) {
    candidates = [...new Set(listed.split("\n").filter(Boolean))];
  } else {
    candidates = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d)) {
        if (e.startsWith(".") || SKIP_DIRS.has(e)) continue;
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (e === "README.md") candidates.push(toPosix(relative(repoRoot, p)));
      }
    };
    walk(repoRoot);
  }
  return candidates
    .filter((p) => existsSync(join(repoRoot, p)) && isCollectionReadme(join(repoRoot, p)))
    .sort();
}

export function loadCollection(repoRoot: string, readmeRel: string): Collection {
  const readme = join(repoRoot, readmeRel);
  const dir = dirname(readme);
  const path = toPosix(relative(repoRoot, dir)) || ".";
  const folder = path === "." ? (repoRoot.split(sep).pop() ?? "repo") : path.split("/").pop()!;
  const data = readFrontMatterOf(readme) ?? {};
  const name = str(data["name"]) ?? folder;
  const files = readdirSync(dir)
    .filter((e) => INITIATIVE_FILE.test(e) && statSync(join(dir, e)).isFile())
    .sort();
  const initiatives = files.map((f) => loadInitiative(join(dir, f), repoRoot, name)).sort((a, b) => a.number - b.number);
  return { name, path, dir, readme, meta: collectionMeta(data, folder), initiatives };
}

export function loadRoot(repoRoot: string): Root {
  const collections = findCollectionReadmes(repoRoot).map((r) => loadCollection(repoRoot, r));
  collections.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
  return { repoRoot, collections };
}

/** Tags declared by any collection, merged (first description wins); undefined if none declare tags. */
export function declaredTags(root: Root): Record<string, string> | undefined {
  const declaring = root.collections.filter((c) => c.meta.tags);
  if (declaring.length === 0) return undefined;
  const out: Record<string, string> = {};
  for (const c of declaring) for (const [k, v] of Object.entries(c.meta.tags!)) if (!out[k]) out[k] = v;
  return out;
}

/** Load the Brindley view of the repository containing `cwd`. */
export function openRepo(cwd: string): Root {
  return loadRoot(findRepoRoot(cwd));
}

// ---------------------------------------------------------------------------
// Lookup

export class BrindleyError extends Error {}

export function allInitiatives(root: Root): Initiative[] {
  return root.collections.flatMap((c) => c.initiatives);
}

/** Find a collection by name or by repo-relative folder path. */
export function findCollection(root: Root, nameOrPath: string): Collection | undefined {
  const p = toPosix(nameOrPath).replace(/^\.\//, "").replace(/\/+$/, "");
  return root.collections.find((c) => c.name === p) ?? root.collections.find((c) => c.path === p);
}

export function requireCollection(root: Root, nameOrPath: string): Collection {
  const c = findCollection(root, nameOrPath);
  if (!c) {
    const known = root.collections.map((x) => x.name).join(", ") || "none — mark a folder with create_collection";
    throw new BrindleyError(`No collection "${nameOrPath}". Known collections: ${known}.`);
  }
  return c;
}

export function lookup(root: Root, collection: string, number: number): Initiative | undefined {
  return findCollection(root, collection)?.initiatives.find((i) => i.number === number);
}

/**
 * Resolve a user-supplied reference: "collection#n", a bare number (within
 * `collection`, else across the repo when unambiguous), or a path.
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
      const c = requireCollection(root, collection);
      const found = c.initiatives.find((i) => i.number === n);
      if (!found) throw new BrindleyError(`No initiative ${n} in ${c.name}.`);
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
  const found = allInitiatives(root).find((i) => i.rel === norm || i.file === resolve(s));
  if (!found) throw new BrindleyError(`No initiative matching "${s}".`);
  return found;
}

export function initiativeKey(i: Initiative): string {
  return refKey(i.collection, i.number);
}
