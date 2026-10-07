import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { STATUSES, normaliseStatus, type Collection, type Initiative, type Root } from "./model.js";
import { BrindleyError, toPosix } from "./repo.js";
import { planRelink, type Move, type RelinkPlan } from "./relink.js";

/**
 * A collection's `folders:` — core status → folder name (opting in to Brindley moving initiatives
 * into status folders) — with entries it can't use reported for `validate`. Null when not declared.
 */
export function parseFolders(raw: unknown, statuses?: Record<string, string>): { map: Record<string, string> | null; problems: string[] } {
  if (raw === undefined || raw === null) return { map: null, problems: [] };
  if (typeof raw !== "object" || Array.isArray(raw)) return { map: null, problems: ["`folders` must map statuses to folder names, e.g. `folders: { done: completed }`."] };
  const map: Record<string, string> = {};
  const problems: string[] = [];
  for (const [word, folder] of Object.entries(raw as Record<string, unknown>)) {
    const status = normaliseStatus(word, statuses);
    if (!status) {
      problems.push(`\`folders\` lists "${word}", which is not a status (${STATUSES.join(", ")}) or alias.`);
      continue;
    }
    const name = String(folder ?? "").replace(/^\/+|\/+$/g, "");
    if (!name || name.includes("/") || name.startsWith(".") || /^\d+-/.test(name)) {
      problems.push(`\`folders.${word}\` must be a plain folder name (got "${String(folder)}").`);
      continue;
    }
    map[status] = name;
  }
  return { map, problems };
}

/** Folders named in `folders:` that hold exactly one status: a file there without a status takes it. */
export function folderStatuses(map: Record<string, string> | null): Record<string, string> {
  if (!map) return {};
  const byFolder = new Map<string, string[]>();
  for (const [status, folder] of Object.entries(map)) byFolder.set(folder, [...(byFolder.get(folder) ?? []), status]);
  return Object.fromEntries([...byFolder].filter(([, s]) => s.length === 1).map(([folder, s]) => [folder, s[0]!]));
}

/** Where an initiative in `status` belongs: its folder, or "" for the top of the collection. */
export function homeFolder(map: Record<string, string>, status: string | undefined): string {
  return (status && map[status]) || "";
}

/**
 * The moves that put an initiative where `status` belongs in a collection with `folders:` — its
 * file and its asset folder(s) — or none if it is already there or the collection hasn't opted in.
 */
export function movesFor(root: Root, c: Collection, i: Initiative, status: string | undefined): Move[] {
  const { map } = parseFolders(c.meta.folders, c.meta.statuses);
  if (!map) return [];
  const want = homeFolder(map, status);
  if ((i.folder ?? "") === want) return [];
  const base = i.rel.split("/").pop()!;
  const slug = /^\d+-(.*)\.md$/.exec(base)![1]!;
  const toDir = want ? `${c.path}/${want}` : c.path;
  const moves: Move[] = [{ from: i.rel, to: `${toDir}/${base}` }];
  const shared = c.initiatives.filter((x) => x.number === i.number).length > 1;
  const dir = dirname(i.file);
  for (const e of readdirSync(dir)) {
    const m = /^(\d+)-(.*)$/.exec(e);
    if (!m || Number(m[1]) !== i.number || !statSync(join(dir, e)).isDirectory()) continue;
    if (shared && m[2] !== slug) continue;
    moves.push({ from: toPosix(relative(root.repoRoot, join(dir, e))), to: `${toDir}/${e}` });
  }
  for (const m of moves)
    if (existsSync(join(root.repoRoot, m.to))) throw new BrindleyError(`Can't move ${m.from} to ${m.to}: something is already there.`);
  return moves;
}

/** A plan for moves (and their link rewrites), creating the target folder when applied. */
export function planFolderMoves(root: Root, moves: Move[]): RelinkPlan {
  return planRelink(root, moves);
}
