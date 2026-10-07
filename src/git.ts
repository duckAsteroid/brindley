import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

/** Run a read-only git command; returns null if git is unavailable or the command fails. */
export function git(repoRoot: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

export function isGitRepo(repoRoot: string): boolean {
  return git(repoRoot, ["rev-parse", "--is-inside-work-tree"])?.trim() === "true";
}

/** True while a merge or rebase is in progress. */
export function mergeInProgress(repoRoot: string): boolean {
  for (const p of ["MERGE_HEAD", "rebase-merge", "rebase-apply"]) {
    const out = git(repoRoot, ["rev-parse", "--git-path", p])?.trim();
    if (out && existsSync(isAbsolute(out) ? out : join(repoRoot, out))) return true;
  }
  return false;
}

/** Paths of the other worktrees of this repository. */
export function otherWorktrees(repoRoot: string): string[] {
  const out = git(repoRoot, ["worktree", "list", "--porcelain"]);
  if (!out) return [];
  const self = resolve(repoRoot);
  return out
    .split("\n")
    .filter((l) => l.startsWith("worktree "))
    .map((l) => resolve(l.slice("worktree ".length)))
    .filter((p) => p !== self);
}

/** Every worktree of this repository (including this one), with the branch it has checked out, if any. */
export function worktrees(repoRoot: string): { path: string; branch: string | null }[] {
  const out = git(repoRoot, ["worktree", "list", "--porcelain"]);
  if (!out) return [];
  const list: { path: string; branch: string | null }[] = [];
  for (const block of out.split("\n\n")) {
    const path = /^worktree (.+)$/m.exec(block)?.[1];
    if (!path) continue;
    const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? null;
    list.push({ path: resolve(path), branch });
  }
  return list;
}

/** The branch checked out in this checkout, or null when detached or outside git. */
export function currentBranch(repoRoot: string): string | null {
  const b = git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"])?.trim();
  return b && b !== "HEAD" ? b : null;
}

const NUMBERED = /(?:^|\/)(\d+)-[^/]+\.md$/;

/**
 * Highest initiative number ever used for a collection, beyond the current
 * working tree: other worktrees (including uncommitted files), every branch and
 * remote-tracking ref, and history (so deleted numbers are never reused).
 */
export function highestNumberElsewhere(repoRoot: string, collectionRepoPath: string): { max: number; usedGit: boolean } {
  let max = 0;
  if (!isGitRepo(repoRoot)) return { max, usedGit: false };
  const prefix = collectionRepoPath.replace(/\/+$/, "") + "/";
  const consider = (name: string) => {
    if (!name.startsWith(prefix)) return;
    const rest = name.slice(prefix.length);
    // Initiatives sit in the collection folder or one status folder down (e.g. completed/).
    const parts = rest.split("/");
    if (parts.length > 2 || (parts.length === 2 && /^\d+-/.test(parts[0]!))) return;
    const m = NUMBERED.exec(rest);
    if (m) max = Math.max(max, Number(m[1]));
  };
  const log = git(repoRoot, ["log", "--all", "--name-only", "--format=", "--", prefix]);
  for (const line of (log ?? "").split("\n")) consider(line.trim());
  for (const wt of otherWorktrees(repoRoot)) {
    const dir = join(wt, collectionRepoPath);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      consider(prefix + f);
      const sub = join(dir, f);
      if (!/^\d+-/.test(f) && statSync(sub).isDirectory()) for (const g of readdirSync(sub)) consider(`${prefix}${f}/${g}`);
    }
  }
  return { max, usedGit: true };
}

/** Has this file changed relative to HEAD (modified, staged, or new)? */
export function changedSinceHead(repoRoot: string, repoPath: string): boolean | null {
  if (!isGitRepo(repoRoot)) return null;
  const status = git(repoRoot, ["status", "--porcelain", "--", repoPath]);
  if (status === null) return null;
  return status.trim().length > 0;
}

/** Files changed relative to HEAD (tracked modifications and untracked files). */
export function changedFiles(repoRoot: string): string[] {
  const out = git(repoRoot, ["status", "--porcelain", "--untracked-files=all"]);
  if (!out) return [];
  return out
    .split("\n")
    .filter((l) => l.length > 3)
    .map((l) => l.slice(3).replace(/^"|"$/g, ""))
    .map((p) => (p.includes(" -> ") ? p.split(" -> ")[1]! : p));
}
