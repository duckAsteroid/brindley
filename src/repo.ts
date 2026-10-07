import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import ignore from "ignore";
import {
  ASSET_DIR,
  INITIATIVE_FILE,
  normaliseStatus,
  normaliseType,
  type Collection,
  type CollectionMeta,
  type Initiative,
  type Ref,
  type Root,
  type Theme,
} from "./model.js";
import {
  DEPENDENCIES,
  RELATED,
  h1,
  humanise,
  parseAcceptance,
  parseFrontMatter,
  parseQuestions,
  proseStatus,
  sectionLinks,
  splitFrontMatter,
} from "./markdown.js";
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

/**
 * Matcher for a collection's `ignore:` patterns, with .gitignore semantics (relative to the
 * collection folder): `#` comments, `!` negation, a leading `/` anchors to the collection folder,
 * a trailing `/` matches folders only, and a pattern without `/` matches at any depth. Pass
 * folder paths with a trailing "/".
 */
export function ignoreMatcher(patterns: string[] = []): (relPath: string) => boolean {
  if (patterns.length === 0) return () => false;
  const ig = ignore().add(patterns);
  return (relPath) => ig.ignores(toPosix(relPath).replace(/^\.?\//, ""));
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

export function loadInitiative(
  file: string,
  repoRoot: string,
  collection: string,
  opts: { folder?: string; statuses?: Record<string, string> } = {},
): Initiative {
  const name = file.split(sep).pop()!;
  const m = INITIATIVE_FILE.exec(name)!;
  const text = readFileSync(file, "utf8");
  const { fmText, body } = splitFrontMatter(text);
  const { data: fm, error } = parseFrontMatter(fmText);
  const problems: string[] = [];
  if (error) problems.push(`front-matter does not parse: ${error}`);
  if (fmText === null && !opts.folder) problems.push("no front-matter");
  // Status: front-matter wins; otherwise the status folder the file sits in.
  const fmStatus = str(fm["status"]);
  const statusRaw = fmStatus ?? opts.folder;
  const statusSource = fmStatus !== undefined ? ("front-matter" as const) : opts.folder ? ("folder" as const) : undefined;
  const status = normaliseStatus(statusRaw, opts.statuses) ?? (fmStatus !== undefined ? fmStatus : undefined);
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
    status,
    statusRaw,
    statusSource,
    proseStatus: proseStatus(body),
    folder: opts.folder,
    statusNote: str(fm["status_note"]),
    type: normaliseType(str(fm["type"])),
    tags: strList(fm["tags"]),
    owner: str(fm["owner"]),
    updated: str(fm["updated"]),
    dependsOn: [],
    related: [],
    links: { dependencies: sectionLinks(body, DEPENDENCIES), related: sectionLinks(body, RELATED) },
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
    statuses: tagMap(data["statuses"]),
    ignore: data["ignore"] !== undefined ? strList(data["ignore"]) : undefined,
    dimensions: data["dimensions"],
    graph: data["graph"],
    aliases:
      data["aliases"] !== undefined || data["alias"] !== undefined
        ? [...strList(data["aliases"]), ...strList(data["alias"])]
        : undefined,
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

/** Numbered initiative files directly in `dir`. */
function initiativeFiles(dir: string, ignored: (name: string) => boolean = () => false): string[] {
  return readdirSync(dir)
    .filter((e) => INITIATIVE_FILE.test(e) && !ignored(e) && statSync(join(dir, e)).isFile())
    .sort();
}

/**
 * Status folders: immediate sub-folders of a collection (e.g. completed/, deferred/) holding
 * numbered initiatives. Asset folders ("21-…") and folders that are collections themselves
 * are excluded.
 */
export function statusFolders(dir: string, ignored: (relPath: string) => boolean = () => false): string[] {
  return readdirSync(dir)
    .filter((e) => !e.startsWith(".") && !ASSET_DIR.test(e) && statSync(join(dir, e)).isDirectory() && !ignored(`${e}/`))
    .filter(
      (e) =>
        !isCollectionReadme(join(dir, e, "README.md")) &&
        initiativeFiles(join(dir, e), (f) => ignored(`${e}/${f}`)).length > 0,
    )
    .sort();
}

export function loadCollection(repoRoot: string, readmeRel: string): Collection {
  const readme = join(repoRoot, readmeRel);
  const dir = dirname(readme);
  const path = toPosix(relative(repoRoot, dir)) || ".";
  const folder = path === "." ? (repoRoot.split(sep).pop() ?? "repo") : path.split("/").pop()!;
  const data = readFrontMatterOf(readme) ?? {};
  const name = str(data["name"]) ?? folder;
  const meta = collectionMeta(data, folder);
  const ignored = ignoreMatcher(meta.ignore);
  const initiatives = [
    ...initiativeFiles(dir, ignored).map((f) => loadInitiative(join(dir, f), repoRoot, name, { statuses: meta.statuses })),
    ...statusFolders(dir, ignored).flatMap((sub) =>
      initiativeFiles(join(dir, sub), (f) => ignored(`${sub}/${f}`)).map((f) =>
        loadInitiative(join(dir, sub, f), repoRoot, name, { folder: sub, statuses: meta.statuses }),
      ),
    ),
  ].sort((a, b) => a.number - b.number || a.rel.localeCompare(b.rel));
  return { name, path, dir, readme, meta, initiatives, aliases: [...(meta.aliases ?? [])], ignored: numberedFilesMatching(dir, ignored) };
}

/** Numbered .md files in a collection folder and its immediate sub-folders that `match` selects. */
export function numberedFilesMatching(dir: string, match: (relPath: string) => boolean): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir).sort()) {
    if (e.startsWith(".")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (ASSET_DIR.test(e) || isCollectionReadme(join(p, "README.md"))) continue;
      for (const f of readdirSync(p).sort())
        if (INITIATIVE_FILE.test(f) && statSync(join(p, f)).isFile() && match(`${e}/${f}`)) out.push(`${e}/${f}`);
    } else if (INITIATIVE_FILE.test(e) && match(e)) out.push(e);
  }
  return out;
}

/** Automatic alias: initials of a multi-word folder name ("lock-gate-maintenance" → "lgm"). */
export function initialsAlias(folder: string): string | undefined {
  const words = folder.split(/[-_\s.]+/).filter(Boolean);
  if (words.length < 2) return undefined;
  return words.map((w) => w[0]!.toLowerCase()).join("");
}

const fold = (s: string) => s.toLowerCase();

export function loadRoot(repoRoot: string): Root {
  const collections = findCollectionReadmes(repoRoot).map((r) => loadCollection(repoRoot, r));
  collections.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));

  // Automatic aliases apply only when unambiguous: not equal to any name, explicit alias, or
  // another collection's automatic alias.
  const taken = new Map<string, number>();
  const count = (k: string) => taken.set(fold(k), (taken.get(fold(k)) ?? 0) + 1);
  for (const c of collections) [c.name, ...c.aliases].forEach(count);
  const autos = collections.map((c) => initialsAlias(c.path.split("/").pop() ?? c.name));
  autos.forEach((a) => a && count(a));
  collections.forEach((c, k) => {
    const a = autos[k];
    if (a && taken.get(fold(a)) === 1 && !c.aliases.some((x) => fold(x) === fold(a))) {
      c.autoAlias = a;
      c.aliases.push(a);
    }
  });

  const root: Root = { repoRoot, collections, themes: collections.flatMap((c) => findThemes(repoRoot, c)) };
  const all = collections.flatMap((c) => c.initiatives);
  const byFile = new Map(all.map((i) => [i.file, i]));
  const byName = new Map<string, Initiative[]>();
  for (const i of all) {
    const base = i.file.split(sep).pop()!;
    byName.set(base, [...(byName.get(base) ?? []), i]);
  }
  for (const i of all) {
    // Links in "## Dependencies" / "## Related" become references.
    const resolveLinks = (links: { href: string }[]) => {
      const out: Ref[] = [];
      const seen = new Set<string>();
      for (const { href } of links) {
        const r = resolveLink(i, href, byFile, byName);
        if (!r) continue;
        const key = r.kind === "initiative" ? refKey(r.collection, r.number) : r.raw;
        if (seen.has(key) || (r.kind === "initiative" && r.collection === i.collection && r.number === i.number)) continue;
        seen.add(key);
        out.push(r);
      }
      return out;
    };
    i.dependsOn = resolveLinks(i.links.dependencies);
    i.related = resolveLinks(i.links.related);
    // superseded_by (front-matter) may use an alias or path: resolve to the canonical name.
    if (i.supersededBy?.kind === "initiative") {
      const target = findCollection(root, i.supersededBy.collection);
      if (target) i.supersededBy = { ...i.supersededBy, collection: target.name };
    }
  }
  return root;
}

/**
 * What a link in a Dependencies/Related section refers to: an initiative file (also when it has
 * since moved, matched by filename), an external ticket (http/https), or nothing Brindley tracks.
 */
function resolveLink(
  from: Initiative,
  href: string,
  byFile: Map<string, Initiative>,
  byName: Map<string, Initiative[]>,
): Ref | undefined {
  if (/^https?:\/\//i.test(href)) return { kind: "external", raw: href };
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#")) return undefined;
  let path = href.split("#")[0]!;
  try {
    path = decodeURIComponent(path);
  } catch {
    /* keep as written */
  }
  const abs = resolve(dirname(from.file), path);
  const hit = byFile.get(abs);
  if (hit) return { kind: "initiative", raw: href, collection: hit.collection, number: hit.number };
  if (existsSync(abs)) return undefined; // a real file, but not an initiative (e.g. a design doc)
  const candidates = byName.get(path.split("/").pop()!) ?? [];
  if (candidates.length === 1) {
    const t = candidates[0]!;
    return { kind: "initiative", raw: href, collection: t.collection, number: t.number, movedTo: t.rel };
  }
  return undefined;
}

/**
 * Theme docs in a collection folder: non-numbered .md files (other than README.md) whose
 * front-matter has `theme: <tag>` (or a list of tags). Ignored paths are skipped.
 */
export function findThemes(repoRoot: string, c: Collection): Theme[] {
  const ignored = ignoreMatcher(c.meta.ignore);
  const out: Theme[] = [];
  for (const e of readdirSync(c.dir).sort()) {
    if (!e.endsWith(".md") || e === "README.md" || INITIATIVE_FILE.test(e) || ignored(e)) continue;
    const file = join(c.dir, e);
    if (!statSync(file).isFile()) continue;
    const text = readFileSync(file, "utf8");
    const { fmText, body } = splitFrontMatter(text);
    if (fmText === null) continue;
    const data = parseFrontMatter(fmText).data;
    for (const tag of strList(data["theme"])) {
      out.push({
        tag,
        title: h1(body) ?? e.replace(/\.md$/, ""),
        summary: str(data["summary"]),
        ...(str(data["icon"]) ? { icon: str(data["icon"]) } : {}),
        file,
        rel: toPosix(relative(repoRoot, file)),
        collection: c.name,
      });
    }
  }
  return out;
}

export function themeFor(root: Root, tag: string): Theme | undefined {
  return root.themes.find((t) => t.tag === tag);
}

/**
 * Tags declared by collections (`tags:`) or by theme docs, merged; first description wins.
 * Undefined if nothing declares tags.
 */
export function declaredTags(root: Root): Record<string, string> | undefined {
  const declaring = root.collections.filter((c) => c.meta.tags);
  if (declaring.length === 0 && root.themes.length === 0) return undefined;
  const out: Record<string, string> = {};
  for (const t of root.themes) if (!out[t.tag]) out[t.tag] = t.summary ?? t.title;
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
/**
 * Find a collection by name, explicit alias, automatic alias, or repo-relative folder path —
 * in that order, ignoring case.
 */
export function findCollection(root: Root, nameOrPath: string): Collection | undefined {
  const p = fold(toPosix(nameOrPath).replace(/^\.\//, "").replace(/\/+$/, ""));
  return (
    root.collections.find((c) => fold(c.name) === p) ??
    root.collections.find((c) => (c.meta.aliases ?? []).some((a) => fold(a) === p)) ??
    root.collections.find((c) => c.autoAlias !== undefined && fold(c.autoAlias) === p) ??
    root.collections.find((c) => fold(c.path) === p)
  );
}

/** Canonical collection name for a filter argument (name, alias or path); unknown → as given. */
export function canonicalCollection(root: Root, nameOrPath: string | undefined): string | undefined {
  if (nameOrPath === undefined) return undefined;
  return findCollection(root, nameOrPath)?.name ?? nameOrPath;
}

export function requireCollection(root: Root, nameOrPath: string): Collection {
  const c = findCollection(root, nameOrPath);
  if (!c) {
    const known =
      root.collections.map((x) => (x.aliases.length ? `${x.name} (${x.aliases.join(", ")})` : x.name)).join(", ") ||
      "none — mark a folder with create_collection";
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
