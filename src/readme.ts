import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Collection, Initiative, Root } from "./model.js";
import { blockers, dependencyReport, displayRef, isActive, isReady, target } from "./deps.js";
import { allInitiatives, initiativeKey, lookup } from "./repo.js";
import { joinFrontMatter } from "./markdown.js";

export const BEGIN = "<!-- brindley:generated:begin — do not edit by hand; regenerate instead -->";
export const END = "<!-- brindley:generated:end -->";
const BEGIN_RE = /^<!-- brindley:generated:begin\b.*-->\s*$/;
const END_RE = /^<!-- brindley:generated:end\b.*-->\s*$/;
const CONFLICT_RE = /^(<{7}|={7}|>{7}|\|{7})( |$)/;

const esc = (s: string) => s.replace(/\|/g, "\\|");
const label = (s: string) => s.replace(/"/g, "'");

function titleOf(i: Initiative): string {
  return i.title ?? i.slug;
}

function link(i: Initiative, fromCollection?: string): string {
  const href = fromCollection === i.collection ? i.rel.split("/").pop()! : i.rel;
  return `[${esc(titleOf(i))}](${href})`;
}

function openQs(i: Initiative): string {
  const open = i.questions.filter((q) => !q.resolved);
  const blocking = open.filter((q) => !q.implementation).length;
  const impl = open.length - blocking;
  return impl > 0 ? `${blocking} (+${impl} impl.)` : String(blocking);
}

function readiness(root: Root, i: Initiative): string {
  const parts: string[] = [];
  const b = blockers(root, i);
  if (isReady(root, i)) parts.push("✅ ready");
  else if (b.length > 0) parts.push(`⛔ ${b.map((d) => d.ref).join(", ")}`);
  const ext = dependencyReport(root, i).filter((d) => d.classification === "external");
  if (ext.length > 0) parts.push(`ext: ${ext.map((d) => `\`${esc(d.ref)}\``).join(", ")}`);
  return parts.length ? parts.join(" · ") : "—";
}

function nodeId(i: Initiative, from: string): string {
  return i.collection === from ? `n${i.number}` : `c_${i.collection.replace(/[^A-Za-z0-9]/g, "_")}_${i.number}`;
}

function nodeClass(root: Root, i: Initiative): string {
  if (i.status === "done") return "done";
  if (isReady(root, i)) return "ready";
  if (i.status === "in-progress") return "inprogress";
  if (i.status === "designed") return "designed";
  return "draft";
}

const CLASS_DEFS = [
  "  classDef done fill:#e6e6e6,color:#777,stroke:#bbb",
  "  classDef draft fill:#fff,stroke:#999,stroke-dasharray:4 3",
  "  classDef designed fill:#e8f0fe,stroke:#4a7bd0",
  "  classDef ready fill:#d9f2e3,stroke:#2e8b57,stroke-width:2px",
  "  classDef inprogress fill:#fff4d6,stroke:#d49a00,stroke-width:2px",
  "  classDef external fill:#fafafa,stroke:#999",
];

/** Mermaid graph of the given active initiatives plus the done initiatives they depend on. */
export function mermaid(root: Root, active: Initiative[], from: string): string | null {
  if (active.length === 0) return null;
  const nodes = new Map<string, string>();
  const edges: string[] = [];
  const externals = new Map<string, string>();
  const addNode = (i: Initiative) => {
    const id = nodeId(i, from);
    if (nodes.has(id)) return id;
    const prefix = i.collection === from ? `${i.number}` : `${i.collection}#${i.number}`;
    nodes.set(id, `  ${id}["${label(`${prefix} ${titleOf(i)}`)}"]:::${nodeClass(root, i)}`);
    return id;
  };
  const sorted = [...active].sort((a, b) => a.collection.localeCompare(b.collection) || a.number - b.number);
  for (const i of sorted) addNode(i);
  for (const i of sorted) {
    const to = nodeId(i, from);
    for (const r of i.dependsOn) {
      if (r.kind === "external") {
        let id = externals.get(r.raw);
        if (!id) {
          id = `x${externals.size + 1}`;
          externals.set(r.raw, id);
        }
        edges.push(`  ${id} --> ${to}`);
        continue;
      }
      const t = target(root, r);
      if (!t) continue;
      edges.push(`  ${addNode(t)} --> ${to}`);
    }
    for (const r of i.related) {
      if (r.kind !== "initiative") continue;
      const t = target(root, r);
      if (!t || !nodes.has(nodeId(t, from))) continue;
      edges.push(`  ${nodeId(t, from)} -.-> ${to}`);
    }
  }
  const ext = [...externals.entries()].map(([raw, id]) => `  ${id}{{"${label(raw)}"}}:::external`);
  return ["```mermaid", "flowchart LR", ...nodes.values(), ...ext, ...edges, ...CLASS_DEFS, "```"].join("\n");
}

export function collectionBlock(root: Root, c: Collection): string {
  const out: string[] = [];
  const active = c.initiatives.filter(isActive);
  const done = c.initiatives.filter((i) => i.status === "done");
  const closed = c.initiatives.filter((i) => i.status === "abandoned" || i.status === "superseded");

  out.push("### Active", "");
  if (active.length === 0) out.push("_None._");
  else {
    out.push("| # | Initiative | Type | Status | Ready / blocked by | Open Qs | Owner |");
    out.push("|---|------------|------|--------|--------------------|---------|-------|");
    for (const i of active) {
      const status = i.statusNote ? `${i.status ?? "?"}<br><sub>${esc(i.statusNote)}</sub>` : (i.status ?? "?");
      out.push(
        `| ${i.number} | ${link(i, c.path)} | ${esc(i.type ?? "—")} | ${status} | ${readiness(root, i)} | ${openQs(i)} | ${i.owner ? `\`${esc(i.owner)}\`` : "—"} |`,
      );
    }
  }
  const graph = mermaid(root, active, c.path);
  if (graph) out.push("", "### Dependencies", "", graph);
  out.push("", "### Completed", "");
  if (done.length === 0) out.push("_None._");
  else {
    out.push("| # | Initiative | Type | Updated |", "|---|------------|------|---------|");
    for (const i of done) out.push(`| ${i.number} | ${link(i, c.path)} | ${esc(i.type ?? "—")} | ${i.updated ?? "—"} |`);
  }
  if (closed.length > 0) {
    out.push("", "### Closed", "");
    for (const i of closed) {
      const by =
        i.status === "superseded" && i.supersededBy ? ` — superseded by ${displayRef(i.supersededBy, c.path)}` : "";
      out.push(`- ${i.number} ${link(i, c.path)} (${i.status}${by})`);
    }
  }
  return out.join("\n");
}

export function rootBlock(root: Root): string {
  const out: string[] = ["### Collections", ""];
  if (root.collections.length === 0) out.push("_None yet._");
  else {
    out.push("| Collection | Title | Status | Draft | Designed | In progress | Done | Ready |");
    out.push("|------------|-------|--------|-------|----------|-------------|------|-------|");
    for (const c of root.collections) {
      const n = (s: string) => c.initiatives.filter((i) => i.status === s).length;
      const ready = c.initiatives.filter((i) => isReady(root, i)).length;
      const href = `${c.path}/${c.hasReadme ? "README.md" : ""}`;
      out.push(
        `| [${c.path}](${href}) | ${esc(c.meta.title)} | ${c.meta.status} | ${n("draft")} | ${n("designed")} | ${n("in-progress")} | ${n("done")} | ${ready} |`,
      );
    }
  }

  // Cross-collection dependency edges, collapsed to collection level.
  const edges = new Map<string, string[]>();
  for (const i of allInitiatives(root).filter(isActive)) {
    for (const r of i.dependsOn) {
      if (r.kind !== "initiative" || r.collection === i.collection) continue;
      if (!lookup(root, r.collection, r.number)) continue;
      const key = `${r.collection}\u0000${i.collection}`;
      edges.set(key, [...(edges.get(key) ?? []), `${r.number}→${i.number}`]);
    }
  }
  if (edges.size > 0) {
    const id = (p: string) => `c_${p.replace(/[^A-Za-z0-9]/g, "_")}`;
    const used = new Set<string>();
    const lines: string[] = [];
    for (const [k, v] of [...edges.entries()].sort()) {
      const [from, to] = k.split("\u0000") as [string, string];
      used.add(from);
      used.add(to);
      lines.push(`  ${id(from)} -->|"${v.sort().join(", ")}"| ${id(to)}`);
    }
    const nodes = [...used].sort().map((p) => `  ${id(p)}["${label(p)}"]`);
    out.push("", "### Cross-collection dependencies", "", "```mermaid", "flowchart LR", ...nodes, ...lines, "```");
  }

  const tagNames = new Set<string>(allInitiatives(root).flatMap((i) => i.tags));
  if (tagNames.size > 0) {
    out.push("", "### Themes");
    for (const tag of [...tagNames].sort()) {
      out.push("", `#### \`${tag}\``, "");
      const desc = root.meta.tags?.[tag];
      if (desc) out.push(desc, "");
      const items = allInitiatives(root).filter((i) => i.tags.includes(tag));
      const ordered = [...items.filter(isActive), ...items.filter((i) => !isActive(i))];
      for (const i of ordered) {
        out.push(`- \`${initiativeKey(i)}\` ${link(i)} — ${i.type ?? "untyped"}, ${i.status ?? "?"}`);
      }
    }
  }
  return out.join("\n");
}

export function hasConflictMarkers(text: string): boolean {
  return text.split("\n").some((l) => CONFLICT_RE.test(l));
}

/**
 * Put `block` between the markers in `text` (appending markers if absent).
 * Conflict markers inside or straddling the block are discarded.
 */
export function applyBlock(text: string, block: string): string {
  const ls = text.split("\n");
  const begin = ls.findIndex((l) => BEGIN_RE.test(l));
  let end = -1;
  for (let k = ls.length - 1; k >= 0; k--) if (END_RE.test(ls[k]!)) { end = k; break; }
  const content = [BEGIN, "", block, "", END];
  if (begin < 0 || end < begin) {
    const trimmed = text.replace(/\s+$/, "");
    return `${trimmed}${trimmed ? "\n\n" : ""}${content.join("\n")}\n`;
  }
  // Widen over conflict markers immediately around the block.
  let b = begin;
  let e = end;
  while (b > 0 && CONFLICT_RE.test(ls[b - 1]!)) b--;
  while (e < ls.length - 1 && CONFLICT_RE.test(ls[e + 1]!)) e++;
  ls.splice(b, e - b + 1, ...content);
  return ls.join("\n");
}

export function blockOf(text: string): string | null {
  const ls = text.split("\n");
  const begin = ls.findIndex((l) => BEGIN_RE.test(l));
  const end = ls.findIndex((l, k) => k > begin && END_RE.test(l));
  if (begin < 0 || end < 0) return null;
  return ls.slice(begin, end + 1).join("\n");
}

export interface ReadmeChange {
  path: string;
  reason: "updated" | "created" | "conflict";
}

/**
 * Regenerate generated blocks. With onlyConflicted, only blocks containing
 * conflict markers are rewritten (used during merges/rebases).
 */
export function regenerate(
  root: Root,
  opts: {
    collections?: Collection[];
    includeRoot?: boolean;
    onlyConflicted?: boolean;
    check?: boolean;
    /** Create missing collection READMEs (default true). Self-healing passes false. */
    createMissing?: boolean;
  } = {},
): ReadmeChange[] {
  const changes: ReadmeChange[] = [];
  const handle = (path: string, block: string, initial: () => string) => {
    const exists = existsSync(path);
    if (!exists && opts.createMissing === false) return;
    const current = exists ? readFileSync(path, "utf8") : null;
    const conflicted = current !== null && hasConflictMarkers(blockOf(current) ?? "");
    if (opts.onlyConflicted && !conflicted) return;
    const base = current ?? initial();
    const next = applyBlock(base, block);
    if (next === current) return;
    changes.push({ path, reason: !exists ? "created" : conflicted ? "conflict" : "updated" });
    if (!opts.check) writeFileSync(path, next);
  };
  for (const c of opts.collections ?? root.collections) {
    handle(c.readme, collectionBlock(root, c), () => `# ${c.meta.title}\n`);
  }
  if (opts.includeRoot ?? true) {
    handle(root.readme, rootBlock(root), () => joinFrontMatter("brindley: 1\n", "# Initiatives\n"));
  }
  return changes;
}
