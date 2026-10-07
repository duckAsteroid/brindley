import { existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { Root } from "./model.js";
import { git } from "./git.js";
import { BrindleyError, toPosix } from "./repo.js";
import { lines, stripCodeFences, withoutInlineCode } from "./markdown.js";

/** A file or folder moving within the repository; paths relative to the repo root. */
export interface Move {
  from: string;
  to: string;
}

/** One link rewritten in one file. `file` is where the file is before the moves; `line` is 1-based. */
export interface Rewrite {
  file: string;
  line: number;
  /** 0-based position of the link target in the line, so only that occurrence is rewritten. */
  column: number;
  before: string;
  after: string;
}

export interface RelinkPlan {
  moves: Move[];
  rewrites: Rewrite[];
}

/** Every Markdown file in the working tree that git doesn't ignore (falls back to a walk outside git). */
function markdownFiles(root: Root): string[] {
  const listed = git(root.repoRoot, ["ls-files", "--cached", "--others", "--exclude-standard", "--", "*.md"]);
  if (listed !== null) return [...new Set(listed.split("\n").filter(Boolean))].filter((p) => existsSync(join(root.repoRoot, p))).sort();
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      if (e.startsWith(".") || e === "node_modules") continue;
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (e.endsWith(".md")) out.push(toPosix(relative(root.repoRoot, p)));
    }
  };
  walk(root.repoRoot);
  return out.sort();
}

/** Where an absolute path ends up after the moves (a moved folder carries its contents). */
function moved(abs: string, moves: { from: string; to: string }[]): string {
  for (const m of moves) {
    if (abs === m.from) return m.to;
    if (abs.startsWith(m.from + sep)) return m.to + abs.slice(m.from.length);
  }
  return abs;
}

/**
 * Plan moves and the link rewrites they need, across every Markdown file in the repository: links
 * pointing at a moved file or into a moved folder, and relative links out of a file that moves.
 * Links that don't resolve to anything stay as they are. Nothing is written.
 */
export function planRelink(root: Root, moves: Move[]): RelinkPlan {
  const abs = moves.map((m) => ({ from: resolve(root.repoRoot, m.from), to: resolve(root.repoRoot, m.to) }));
  for (const m of abs) {
    if (!existsSync(m.from)) throw new BrindleyError(`Can't move ${toPosix(relative(root.repoRoot, m.from))}: it doesn't exist.`);
    if (existsSync(m.to)) throw new BrindleyError(`Can't move to ${toPosix(relative(root.repoRoot, m.to))}: it already exists.`);
  }
  const rewrites: Rewrite[] = [];
  for (const rel of markdownFiles(root)) {
    const file = join(root.repoRoot, rel);
    const fromDir = dirname(file);
    const toDir = dirname(moved(file, abs));
    const text = readFileSync(file, "utf8");
    for (const { line, text: l } of stripCodeFences(text)) {
      for (const m of withoutInlineCode(l).matchAll(/\]\(\s*<?([^)\s>]+)>?/g)) {
        const href = m[1]!;
        if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#") || href.startsWith("/")) continue;
        const [path, fragment] = href.split(/(?=#)/);
        const target = resolve(fromDir, decodeURIComponent(path!));
        const newTarget = moved(target, abs);
        if (newTarget === target && toDir === fromDir) continue;
        if (!existsSync(target)) continue;
        let next = toPosix(relative(toDir, newTarget)) || ".";
        if (path!.startsWith("./") && !next.startsWith("../")) next = `./${next}`;
        const replacement = `${next}${fragment ?? ""}`;
        const column = m.index! + m[0].indexOf(href);
        if (replacement !== href) rewrites.push({ file: rel, line: line + 1, column, before: href, after: replacement });
      }
    }
  }
  return { moves, rewrites };
}

/** Apply a plan: rewrite the links in place, then make the moves. */
export function applyRelink(root: Root, plan: RelinkPlan): string[] {
  const touched = new Set<string>();
  const byFile = new Map<string, Rewrite[]>();
  for (const r of plan.rewrites) byFile.set(r.file, [...(byFile.get(r.file) ?? []), r]);
  for (const [rel, rs] of byFile) {
    const file = join(root.repoRoot, rel);
    const ls = lines(readFileSync(file, "utf8"));
    // Right to left within a line, so earlier columns stay valid.
    for (const r of [...rs].sort((a, b) => a.line - b.line || b.column - a.column)) {
      const l = ls[r.line - 1]!;
      if (l.slice(r.column, r.column + r.before.length) !== r.before) throw new BrindleyError(`${r.file}:${r.line} changed since it was planned; plan again.`);
      ls[r.line - 1] = l.slice(0, r.column) + r.after + l.slice(r.column + r.before.length);
    }
    writeFileSync(file, ls.join("\n"));
    touched.add(file);
  }
  for (const m of plan.moves) {
    renameSync(join(root.repoRoot, m.from), join(root.repoRoot, m.to));
    touched.add(join(root.repoRoot, m.to));
  }
  return [...touched];
}
