import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { Collection, Initiative, Root } from "./model.js";
import { currentBranch, git, worktrees } from "./git.js";
import { globToRegExp } from "./repo.js";

/** Where an initiative is in progress outside this checkout. */
export interface Elsewhere {
  /** The branch it is being built on, as recorded (`branch:`) or as checked out there. */
  branch: string | null;
  /** The other worktree it was found in, if it was found in one. */
  worktree?: string;
}

// Extended regex (git grep -E): an optional quote either side of the status word.
const IN_PROGRESS = "^status:[ \t]*[\"']?in-progress[\"']?[ \t]*$";
const numberOf = (path: string) => Number(/(?:^|\/)(\d+)-[^/]*\.md$/.exec(path)?.[1] ?? NaN);
const branchLine = (text: string) => /^branch:[ \t]*["']?([^"'\n]+?)["']?[ \t]*$/m.exec(text)?.[1] ?? null;

/** Every local and remote-tracking branch name (`main`, `origin/main`). */
export function branchNames(repoRoot: string): Set<string> {
  const out = git(repoRoot, ["for-each-ref", "--format=%(refname:short)", "refs/heads", "refs/remotes"]) ?? "";
  return new Set(out.split("\n").map((s) => s.trim()).filter((s) => s && !s.endsWith("/HEAD")));
}

/** Which other branches and worktrees to look in: all of each unless narrowed. */
export interface LookIn {
  /** Globs over branch names (`!` excludes; a branch matches with or without its remote prefix); false: none. */
  branches?: string[] | false;
  /** true: every other worktree; globs over a worktree's path, folder name or branch; false: none. */
  worktrees?: boolean | string[];
}

/**
 * Does an ordered glob list select any of these names? Patterns apply in order, `!` excludes and
 * the last match wins; a list of only exclusions starts from everything.
 */
export function selects(globs: string[], names: string[]): boolean {
  let selected = globs.every((g) => g.startsWith("!"));
  for (const g of globs) {
    const negated = g.startsWith("!");
    const re = globToRegExp(negated ? g.slice(1) : g);
    if (names.some((n) => re.test(n))) selected = !negated;
  }
  return selected;
}

/**
 * Initiatives of a collection that are in progress in another worktree's working files or on
 * another local or remote-tracking branch — but not in this checkout — by number. One `git grep`
 * per worktree and one across the branches. `look` narrows where it looks; by default, everywhere.
 */
export function inProgressElsewhere(root: Root, c: Collection, look: LookIn = {}): Map<number, Elsewhere[]> {
  const here = new Map(c.initiatives.map((i) => [i.number, i.status]));
  const found = new Map<number, Elsewhere[]>();
  const add = (n: number, e: Elsewhere) => {
    if (Number.isNaN(n) || here.get(n) === "in-progress") return;
    const list = found.get(n) ?? [];
    if (!list.some((x) => x.branch === e.branch && x.worktree === e.worktree)) list.push(e);
    found.set(n, list);
  };
  const self = resolve(root.repoRoot);
  const seenBranches = new Set<string>();
  // Other worktrees: their working files, so a start that isn't committed yet still counts.
  const wantTrees = look.worktrees ?? true;
  for (const w of worktrees(root.repoRoot)) {
    if (w.path === self || !existsSync(w.path)) continue;
    if (wantTrees === false) continue;
    if (Array.isArray(wantTrees) && !selects(wantTrees, [w.path, basename(w.path), ...(w.branch ? [w.branch] : [])])) continue;
    if (w.branch) seenBranches.add(w.branch);
    const out = git(w.path, ["grep", "-l", "-E", "--untracked", "-e", IN_PROGRESS, "--", c.path]) ?? "";
    for (const f of out.split("\n").filter(Boolean)) {
      const recorded = branchLine(readFileSync(join(w.path, f), "utf8"));
      add(numberOf(f), { branch: recorded ?? w.branch, worktree: w.path });
    }
  }
  // Branches, apart from this checkout's own (and its upstream) and those already seen in a worktree.
  const current = currentBranch(root.repoRoot);
  const upstream = git(root.repoRoot, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])?.trim();
  const remotes = new Set((git(root.repoRoot, ["remote"]) ?? "").split("\n").filter(Boolean));
  const short = (b: string) => (remotes.has(b.split("/")[0]!) ? b.slice(b.indexOf("/") + 1) : b);
  const wantBranches = look.branches;
  const refs =
    wantBranches === false
      ? []
      : [...branchNames(root.repoRoot)].filter(
          (b) =>
            b !== current &&
            b !== upstream &&
            !seenBranches.has(b) &&
            !seenBranches.has(short(b)) &&
            (wantBranches === undefined || selects(wantBranches, [b, short(b)])),
        );
  if (refs.length) {
    const out = git(root.repoRoot, ["grep", "-l", "-E", "-e", IN_PROGRESS, ...refs, "--", c.path]) ?? "";
    for (const line of out.split("\n").filter(Boolean)) {
      const k = line.indexOf(":");
      add(numberOf(line.slice(k + 1)), { branch: line.slice(0, k) });
    }
  }
  return found;
}

// One look per collection per loaded repo: a tool call asking about many initiatives (list, ready)
// greps once.
const cache = new WeakMap<Root, Map<string, Map<number, Elsewhere[]>>>();

/** Where one initiative is in progress outside this checkout. */
export function elsewhereFor(root: Root, c: Collection, i: Initiative): Elsewhere[] {
  let byCollection = cache.get(root);
  if (!byCollection) cache.set(root, (byCollection = new Map()));
  let found = byCollection.get(c.name);
  if (!found) byCollection.set(c.name, (found = inProgressElsewhere(root, c)));
  return found.get(i.number) ?? [];
}

/** "on feature/x (worktree ../repo-wt)" */
export function describeElsewhere(list: Elsewhere[]): string {
  return list.map((e) => `on ${e.branch ?? "a detached checkout"}${e.worktree ? ` (worktree ${e.worktree})` : ""}`).join("; ");
}
