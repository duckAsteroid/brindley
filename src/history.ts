import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { INITIATIVE_FILE, normaliseStatus, type Collection, type Root } from "./model.js";
import { DEPENDENCIES, h1, parseFrontMatter, parseQuestions, sectionLinks, splitFrontMatter } from "./markdown.js";
import { ignoreMatcher } from "./repo.js";
import { folderStatuses, parseFolders } from "./folders.js";
import { git } from "./git.js";

/** One initiative as a commit left it: just what the report reads. */
export interface ItemState {
  number: number;
  /** Repo-relative path. */
  path: string;
  title: string;
  /** Core status, or undefined when the file had none that Brindley recognises. */
  status?: string;
  tags: string[];
  /** Scalar front-matter values (strings and numbers), for sizing by any field. */
  fields: Record<string, string | number>;
  note?: string;
  /** Unresolved, non-implementation open questions. */
  openQuestions: number;
  /** Initiatives it depends on, as "<collection path>#<number>". */
  dependsOn: string[];
}

/** One first-parent commit that changed a collection, as the initiatives it set and removed. */
export interface Change {
  sha: string;
  /** Committer date, ISO 8601. */
  date: string;
  subject: string;
  set: ItemState[];
  removed: number[];
}

export interface History {
  /** The commit replayed up to. */
  head: string | null;
  /** By collection path. */
  changes: Record<string, Change[]>;
}

const CACHE_VERSION = 1;

/** The fields of the parsed file the report uses. */
function readItem(text: string, path: string, number: number, statuses: Record<string, string> | undefined, folderStatus: string | undefined, collections: string[]): ItemState {
  const { fmText, body } = splitFrontMatter(text);
  const { data: fm } = parseFrontMatter(fmText);
  const word = typeof fm["status"] === "string" ? (fm["status"] as string) : undefined;
  const status = normaliseStatus(word, statuses) ?? (word === undefined ? folderStatus : undefined);
  const fields: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(fm)) if (typeof v === "string" || typeof v === "number") fields[k] = v;
  const dir = posix.dirname(path);
  const dependsOn: string[] = [];
  for (const l of sectionLinks(body, DEPENDENCIES)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(l.href) || l.href.startsWith("#")) continue;
    const target = posix.normalize(posix.join(dir, decodeURIComponentSafe(l.href.split("#")[0]!)));
    const m = INITIATIVE_FILE.exec(posix.basename(target));
    if (!m) continue;
    const c = collections.filter((p) => target.startsWith(p === "." ? "" : p + "/")).sort((a, b) => b.length - a.length)[0];
    if (c !== undefined) dependsOn.push(`${c}#${Number(m[1])}`);
  }
  return {
    number,
    path,
    title: h1(body) ?? posix.basename(path, ".md"),
    status,
    tags: Array.isArray(fm["tags"]) ? (fm["tags"] as unknown[]).map(String) : typeof fm["tags"] === "string" ? [fm["tags"] as string] : [],
    fields,
    note: typeof fm["status_note"] === "string" ? (fm["status_note"] as string) : undefined,
    openQuestions: parseQuestions(body).filter((q) => !q.resolved && !q.implementation).length,
    dependsOn,
  };
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Blobs for `<sha>:<path>` specs, all through one `git cat-file --batch`. */
function readBlobs(repoRoot: string, specs: string[]): (string | null)[] {
  if (specs.length === 0) return [];
  const out = execFileSync("git", ["cat-file", "--batch"], { cwd: repoRoot, input: specs.join("\n") + "\n", maxBuffer: 1 << 30 });
  const texts: (string | null)[] = [];
  let at = 0;
  for (let k = 0; k < specs.length; k++) {
    const nl = out.indexOf(10, at);
    const header = out.subarray(at, nl).toString("utf8");
    if (header.endsWith(" missing")) {
      texts.push(null);
      at = nl + 1;
      continue;
    }
    const size = Number(header.split(" ")[2]);
    texts.push(out.subarray(nl + 1, nl + 1 + size).toString("utf8"));
    at = nl + 1 + size + 1;
  }
  return texts;
}

/** Which repo paths are a collection's initiatives: the folder or its immediate sub-folders, not ignored, not another collection. */
function initiativeMatcher(root: Root, c: Collection): (path: string) => { number: number; folder?: string } | null {
  const prefix = c.path === "." ? "" : c.path + "/";
  const ignored = ignoreMatcher(c.meta.ignore);
  const others = new Set(root.collections.filter((o) => o !== c).map((o) => o.path));
  return (path) => {
    if (!path.startsWith(prefix)) return null;
    const rest = path.slice(prefix.length).split("/");
    if (rest.length > 2) return null;
    const m = INITIATIVE_FILE.exec(rest.at(-1)!);
    if (!m) return null;
    if (rest.length === 2 && others.has(prefix + rest[0])) return null;
    if (ignored(rest.join("/"))) return null;
    return { number: Number(m[1]), folder: rest.length === 2 ? rest[0] : undefined };
  };
}

/** Commits on the first-parent line of `head` after `from` (exclusive), oldest first, that touch `paths`. */
function logChanges(repoRoot: string, range: string, paths: string[]) {
  const out = git(repoRoot, ["log", "--first-parent", "--diff-merges=first-parent", "--reverse", "--no-renames", "--format=%x00%H %cI %s", "--name-status", range, "--", ...paths]) ?? "";
  return out
    .split("\0")
    .filter((b) => b.trim())
    .map((block) => {
      const [head, ...lines] = block.split("\n");
      const [sha, date, ...subject] = head!.split(" ");
      const files = lines.filter(Boolean).map((l) => {
        const [kind, path] = l.split("\t");
        return { deleted: kind!.startsWith("D"), path: path! };
      });
      return { sha: sha!, date: date!, subject: subject.join(" "), files };
    });
}

/**
 * The history of every collection on the checked-out branch's first-parent line: each commit that
 * changed one, with the initiatives it set or removed. Read once from git (one `git log`, one
 * `git cat-file --batch`), then cached in `cacheFile`; a later call replays only newer commits.
 */
export function readHistory(root: Root, cacheFile?: string): History {
  const head = git(root.repoRoot, ["rev-parse", "HEAD"])?.trim() ?? null;
  if (!head) return { head: null, changes: {} };
  const paths = root.collections.map((c) => c.path);
  const key = JSON.stringify(root.collections.map((c) => [c.path, c.meta.statuses ?? null, c.meta.ignore ?? null, c.meta.folders ?? null]));
  let cached: (History & { version: number; key: string }) | null = null;
  if (cacheFile && existsSync(cacheFile)) {
    try {
      cached = JSON.parse(readFileSync(cacheFile, "utf8"));
    } catch {
      cached = null;
    }
  }
  let base: History = { head: null, changes: {} };
  if (cached && cached.version === CACHE_VERSION && cached.key === key && cached.head) {
    if (cached.head === head) return { head, changes: cached.changes };
    const isAncestor = git(root.repoRoot, ["merge-base", "--is-ancestor", cached.head, head]) !== null;
    if (isAncestor) base = { head: cached.head, changes: cached.changes };
  }
  const commits = logChanges(root.repoRoot, base.head ? `${base.head}..${head}` : head, paths);
  const matchers = root.collections.map((c) => ({ c, match: initiativeMatcher(root, c), folders: folderStatuses(parseFolders(c.meta.folders, c.meta.statuses).map) }));
  // Every file to read, in order.
  const specs: string[] = [];
  const plan = commits.map((commit) =>
    matchers.map(({ c, match, folders }) => {
      const set: { path: string; number: number; folderStatus?: string; spec: number }[] = [];
      const deleted: { path: string; number: number }[] = [];
      for (const f of commit.files) {
        const m = match(f.path);
        if (!m) continue;
        if (f.deleted) deleted.push({ path: f.path, number: m.number });
        else {
          const folderStatus = m.folder ? (folders[m.folder] ?? normaliseStatus(m.folder, c.meta.statuses)) : undefined;
          set.push({ path: f.path, number: m.number, folderStatus, spec: specs.push(`${commit.sha}:${f.path}`) - 1 });
        }
      }
      return { c, set, deleted };
    }),
  );
  const texts = readBlobs(root.repoRoot, specs);
  const changes: Record<string, Change[]> = Object.fromEntries(paths.map((p) => [p, [...(base.changes[p] ?? [])]]));
  // Where each number lives now, per collection, so a deletion only removes the file that was there.
  const where = new Map<string, Map<number, string>>();
  for (const p of paths) {
    const m = new Map<number, string>();
    for (const ch of changes[p]!) {
      for (const n of ch.removed) m.delete(n);
      for (const s of ch.set) m.set(s.number, s.path);
    }
    where.set(p, m);
  }
  commits.forEach((commit, k) => {
    for (const { c, set, deleted } of plan[k]!) {
      if (!set.length && !deleted.length) continue;
      const at = where.get(c.path)!;
      const states: ItemState[] = [];
      for (const s of set) {
        const text = texts[s.spec];
        if (text == null) continue;
        states.push(readItem(text, s.path, s.number, c.meta.statuses, s.folderStatus, paths));
        at.set(s.number, s.path);
      }
      const setNumbers = new Set(states.map((s) => s.number));
      const removed = deleted.filter((d) => at.get(d.number) === d.path && !setNumbers.has(d.number)).map((d) => d.number);
      for (const n of removed) at.delete(n);
      if (states.length || removed.length) changes[c.path]!.push({ sha: commit.sha, date: commit.date, subject: commit.subject, set: states, removed });
    }
  });
  const history: History = { head, changes };
  if (cacheFile) {
    try {
      mkdirSync(dirname(cacheFile), { recursive: true });
      writeFileSync(cacheFile, JSON.stringify({ version: CACHE_VERSION, key, ...history }));
    } catch {
      /* a cache that can't be written only costs time */
    }
  }
  return history;
}

/** The default cache location: next to the report, in the repo's build folder. */
export function defaultCacheFile(repoRoot: string): string {
  return join(repoRoot, "build", ".brindley-report-cache.json");
}
