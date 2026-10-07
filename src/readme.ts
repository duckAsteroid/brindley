import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { posix } from "node:path";
import type { Collection, Initiative, Root, Theme } from "./model.js";
import { blockers, dependencyReport, displayRef, isActive, isReady, target } from "./deps.js";
import { allInitiatives, declaredTags, initiativeKey, lookup, themeFor } from "./repo.js";
import { DEFAULT_GRAPH, mermaidDirection, parseGraph, type GraphSettings } from "./graph.js";
import { dimensionsOf, effectiveValue } from "./dimensions.js";

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

/** Markdown link to an initiative from a file in repo-relative folder `fromDir`. */
function link(i: Initiative, fromDir: string): string {
  return `[${esc(titleOf(i))}](${posix.relative(fromDir, i.rel)})`;
}

/** Core status, with the word as written when it differs (e.g. "draft (proposed)"). */
export function statusLabel(i: Initiative): string {
  if (!i.status) return "?";
  const raw = i.statusRaw?.trim();
  return raw && raw.toLowerCase() !== i.status ? `${i.status} (${raw})` : i.status;
}

function openQs(i: Initiative): string {
  const open = i.questions.filter((q) => !q.resolved);
  const blocking = open.filter((q) => !q.implementation).length;
  const impl = open.length - blocking;
  return impl > 0 ? `${blocking} (+${impl} impl.)` : String(blocking);
}

/** Short Markdown link for an external dependency URL ("host/…/last-segment"). */
function externalLink(url: string): string {
  const m = /^https?:\/\/([^/]+)(?:\/.*?([^/]+))?\/?$/.exec(url);
  const label = m ? (m[2] ? `${m[1]}/…/${m[2]}` : m[1]!) : url;
  return `[${esc(label)}](${url})`;
}

function readiness(root: Root, i: Initiative): string {
  const parts: string[] = [];
  const b = blockers(root, i);
  if (isReady(root, i)) parts.push("✅ ready");
  else if (b.length > 0) parts.push(`⛔ ${b.map((d) => d.ref).join(", ")}`);
  const ext = dependencyReport(root, i).filter((d) => d.classification === "external");
  if (ext.length > 0) parts.push(`ext: ${ext.map((d) => externalLink(d.ref)).join(", ")}`);
  return parts.length ? parts.join(" · ") : "—";
}

function nodeId(i: Initiative, from: string): string {
  return i.collection === from ? `n${i.number}` : `c_${i.collection.replace(/[^A-Za-z0-9]/g, "_")}_${i.number}`;
}

/**
 * A node's label: an emoji for its derived state, struck through once it is closed, with optional
 * theme marks (`icons` before the title, `names` after it). No colours, so the graph follows the
 * viewer's Mermaid theme (light or dark).
 */
function nodeLabel(root: Root, i: Initiative, text: string, marks: { icons?: string; names?: string } = {}): string {
  const esc = (x: string) => x.replace(/</g, "#lt;").replace(/>/g, "#gt;");
  const t = esc(text);
  const pre = marks.icons ? `${esc(marks.icons)} ` : "";
  const post = marks.names ? ` · ${esc(marks.names)}` : "";
  const plain = (mark: string) => `${mark} ${pre}${t}${post}`;
  const struck = (mark: string) => `${mark} ${pre}<s>${t}</s>${post}`;
  if (i.status === "done") return struck("✅");
  if (i.status === "abandoned") return struck("🪦");
  if (i.status === "superseded") return struck("↪️");
  if (i.status === "deferred") return plain("⏸️");
  if (i.status === "in-progress") return plain("🚧");
  if (isReady(root, i)) return plain("🟢");
  if (i.status === "designed") return plain("📐");
  return plain("✏️");
}

/** A theme's mark in `icon` mode: its theme doc's icon, else its name in brackets. */
function themeIcon(root: Root, tag: string): string {
  return themeFor(root, tag)?.icon ?? `[${tag}]`;
}

/**
 * Mermaid graph of the given initiatives plus whatever they depend on, shaped by `settings`
 * (a collection README's `graph:`): do-first work on the `direction` side, edges pointing per
 * `arrows`, `## Related` links only when `related`, outside nodes only when `external`, and theme
 * boxes or marks per `themes`. In `icon` mode a legend line follows the block.
 */
export function mermaid(root: Root, items: Initiative[], from: string, settings: GraphSettings = DEFAULT_GRAPH, fromDir?: string): string | null {
  // Node links are relative to the file the graph is written into: a collection's README, else the repo root.
  const linkDir = fromDir ?? root.collections.find((c) => c.name === from)?.path ?? ".";
  const outside = (i: Initiative) => !settings.external && from !== "" && i.collection !== from;
  const shown = items.filter((i) => !outside(i));
  if (shown.length === 0) return null;
  const nodes = new Map<string, Initiative>();
  const lines = new Map<string, string>();
  const edges: string[] = [];
  const externals = new Map<string, string>();
  const icons = new Set<string>();
  const addNode = (i: Initiative) => {
    const id = nodeId(i, from);
    if (nodes.has(id)) return id;
    const prefix = i.collection === from ? `${i.number}` : `${i.collection}#${i.number}`;
    const marks: { icons?: string; names?: string } = {};
    if (settings.mark === "icon" && i.tags.length) {
      marks.icons = i.tags.map((t) => themeIcon(root, t)).join("");
      for (const t of i.tags) if (themeFor(root, t)?.icon) icons.add(t);
    } else if (settings.mark === "label" && i.tags.length) marks.names = i.tags.join(", ");
    nodes.set(id, i);
    lines.set(id, `  ${id}["${nodeLabel(root, i, label(`${prefix} ${titleOf(i)}`), marks)}"]`);
    return id;
  };
  // An edge between the initiative whose file holds the link and the thing it links to.
  const edge = (holder: string, other: string, style: "-->" | "-.->") =>
    edges.push(settings.arrows === "from" ? `  ${holder} ${style} ${other}` : `  ${other} ${style} ${holder}`);
  const sorted = [...shown].sort((a, b) => a.collection.localeCompare(b.collection) || a.number - b.number);
  for (const i of sorted) addNode(i);
  for (const i of sorted) {
    const id = nodeId(i, from);
    for (const r of i.dependsOn) {
      if (r.kind === "external") {
        if (!settings.external) continue;
        let x = externals.get(r.raw);
        if (!x) {
          x = `x${externals.size + 1}`;
          externals.set(r.raw, x);
        }
        edge(id, x, "-->");
        continue;
      }
      const t = target(root, r);
      if (!t || outside(t)) continue;
      edge(id, addNode(t), "-->");
    }
    for (const r of settings.related ? i.related : []) {
      if (r.kind !== "initiative") continue;
      const t = target(root, r);
      if (!t || !nodes.has(nodeId(t, from))) continue;
      edge(id, nodeId(t, from), "-.->");
    }
  }
  const out = ["```mermaid", `flowchart ${mermaidDirection(settings)}`];
  if (settings.box) {
    // A node can sit in one box only: its first theme's. The marks still show every theme.
    const boxes = new Map<string, string[]>();
    for (const [id, i] of nodes) if (i.tags.length) boxes.set(i.tags[0]!, [...(boxes.get(i.tags[0]!) ?? []), id]);
    for (const [id] of nodes) if (!nodes.get(id)!.tags.length) out.push(lines.get(id)!);
    for (const tag of [...boxes.keys()].sort()) {
      out.push(`  subgraph t_${tag.replace(/[^A-Za-z0-9]/g, "_")}["${label(tag)}"]`);
      for (const id of boxes.get(tag)!) out.push(`  ${lines.get(id)!}`);
      out.push("  end");
    }
  } else out.push(...lines.values());
  out.push(...[...externals.entries()].map(([raw, id]) => `  ${id}{{"🔗 ${label(raw)}"}}`), ...edges);
  if (settings.links) {
    for (const [id, i] of nodes) out.push(`  click ${id} href "${posix.relative(linkDir, i.rel)}"`);
    for (const [raw, id] of externals) if (/^https?:\/\//i.test(raw)) out.push(`  click ${id} href "${raw.replace(/"/g, "%22")}"`);
  }
  out.push("```");
  if (icons.size) out.push("", `Themes: ${[...icons].sort().map((t) => `${themeFor(root, t)!.icon} ${t}`).join(" · ")}`);
  return out.join("\n");
}

/** A README table column: its header and how a row's cell is written. */
interface Column {
  header: string;
  cell: (i: Initiative) => string;
}

const TABLES = ["active", "completed"] as const;
const DEFAULT_COLUMNS: Record<(typeof TABLES)[number], string[]> = {
  active: ["number", "title", "type", "status", "ready", "questions", "owner"],
  completed: ["number", "title", "type", "updated"],
};

/** Every column a collection's tables can show: the built-ins and its scoring dimensions. */
function columnsFor(root: Root, c: Collection): Record<string, Column> {
  const cols: Record<string, Column> = {
    number: { header: "#", cell: (i) => String(i.number) },
    title: { header: "Initiative", cell: (i) => link(i, c.path) },
    type: { header: "Type", cell: (i) => esc(i.type ?? "—") },
    status: {
      header: "Status",
      cell: (i) => {
        // Under the status: its note, and for work in progress, the branch it is being built on.
        const under = [i.statusNote, i.status === "in-progress" && i.branch ? `on ${i.branch}` : undefined].filter(Boolean).join(" · ");
        return under ? `${esc(statusLabel(i))}<br><sub>${esc(under)}</sub>` : esc(statusLabel(i));
      },
    },
    ready: { header: "Ready / blocked by", cell: (i) => readiness(root, i) },
    questions: { header: "Open Qs", cell: (i) => openQs(i) },
    owner: { header: "Owner", cell: (i) => (i.owner ? `\`${esc(i.owner)}\`` : "—") },
    tags: { header: "Tags", cell: (i) => (i.tags.length ? i.tags.map((t) => `\`${esc(t)}\``).join(", ") : "—") },
    updated: { header: "Updated", cell: (i) => i.updated ?? "—" },
  };
  for (const d of dimensionsOf(c)) {
    if (cols[d.name]) continue;
    cols[d.name] = {
      header: d.name.charAt(0).toUpperCase() + d.name.slice(1).replace(/_/g, " "),
      cell: (i) => {
        const e = effectiveValue(i, d);
        return !e ? "—" : e.source === "default" ? `_${esc(String(e.value))}_` : esc(String(e.value));
      },
    };
  }
  return cols;
}

/**
 * A collection README's `columns:` — an ordered list per table (`active`, `completed`) replacing
 * that table's defaults — with anything unusable reported for `validate` and left out.
 */
export function readmeColumns(root: Root, c: Collection): { tables: Record<(typeof TABLES)[number], string[]>; problems: string[] } {
  const tables = { active: [...DEFAULT_COLUMNS.active], completed: [...DEFAULT_COLUMNS.completed] };
  const problems: string[] = [];
  const raw = c.meta.columns;
  if (raw === undefined || raw === null) return { tables, problems };
  if (typeof raw !== "object" || Array.isArray(raw)) return { tables, problems: ["`columns` must map tables (active, completed) to lists of columns."] };
  const known = columnsFor(root, c);
  for (const [table, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!(TABLES as readonly string[]).includes(table)) {
      problems.push(`Unknown table "${table}" under \`columns\` (tables: ${TABLES.join(", ")}).`);
      continue;
    }
    if (!Array.isArray(list)) {
      problems.push(`\`columns.${table}\` must be a list of columns.`);
      continue;
    }
    const keys = list.map(String);
    for (const k of keys) if (!known[k]) problems.push(`Unknown column "${k}" in \`columns.${table}\` (known: ${Object.keys(known).join(", ")}).`);
    tables[table as (typeof TABLES)[number]] = keys.filter((k) => known[k]);
  }
  return { tables, problems };
}

/** A Markdown table of `items` with the given column keys. */
function table(root: Root, c: Collection, keys: string[], items: Initiative[]): string[] {
  const cols = columnsFor(root, c);
  const use = keys.map((k) => cols[k]!).filter(Boolean);
  return [
    `| ${use.map((x) => x.header).join(" | ")} |`,
    `|${use.map((x) => "-".repeat(x.header.length + 2)).join("|")}|`,
    ...items.map((i) => `| ${use.map((x) => x.cell(i)).join(" | ")} |`),
  ];
}

/**
 * The collection's themes: each tag its initiatives use, linked to the theme's overview doc when
 * there is one, with its description and this collection's open and closed counts.
 */
function themesSection(root: Root, c: Collection): string[] {
  const tags = [...new Set(c.initiatives.flatMap((i) => i.tags))].sort();
  if (!tags.length) return [];
  const described = declaredTags(root) ?? {};
  const out = ["", "### Themes", ""];
  for (const tag of tags) {
    const doc = themeFor(root, tag);
    const name = doc ? `[**${esc(tag)}**](${posix.relative(c.path, doc.rel)})` : `**${esc(tag)}**`;
    // This collection's own description first, then another collection's, then the theme doc's summary.
    const desc = c.meta.tags?.[tag] || (described[tag] && described[tag] !== doc?.title ? described[tag] : undefined) || doc?.summary;
    const items = c.initiatives.filter((i) => i.tags.includes(tag));
    const open = items.filter(isActive).length;
    out.push(`- ${name}${desc ? ` — ${esc(desc)}` : ""} · ${open} open, ${items.length - open} closed or deferred`);
  }
  return out;
}

export function collectionBlock(root: Root, c: Collection): string {
  const out: string[] = [];
  const active = c.initiatives.filter(isActive);
  const done = c.initiatives.filter((i) => i.status === "done");
  const deferred = c.initiatives.filter((i) => i.status === "deferred");
  const closed = c.initiatives.filter((i) => i.status === "abandoned" || i.status === "superseded");
  const columns = readmeColumns(root, c).tables;

  out.push("### Active", "");
  if (active.length === 0) out.push("_None._");
  else {
    out.push(...table(root, c, columns.active, active));
  }
  const settings = parseGraph(c.meta.graph, c.meta.statuses).settings;
  const graph = settings.enabled
    ? mermaid(root, [...active, ...c.initiatives.filter((i) => !isActive(i) && settings.show.includes(i.status ?? ""))], c.name, settings)
    : null;
  if (graph) out.push("", "### Dependencies", "", graph);
  out.push(...themesSection(root, c));
  if (deferred.length > 0) {
    out.push("", "### Deferred", "");
    for (const i of deferred) out.push(`- ${i.number} ${link(i, c.path)}${i.statusNote ? ` — ${esc(i.statusNote)}` : ""}`);
  }
  out.push("", "### Completed", "");
  if (done.length === 0) out.push("_None._");
  else {
    out.push(...table(root, c, columns.completed, done));
  }
  if (closed.length > 0) {
    out.push("", "### Closed", "");
    for (const i of closed) {
      const by =
        i.status === "superseded" && i.supersededBy ? ` — superseded by ${displayRef(i.supersededBy, c.name)}` : "";
      out.push(`- ${i.number} ${link(i, c.path)} (${i.status}${by}${i.statusNote ? ` — ${esc(i.statusNote)}` : ""})`);
    }
  }
  return out.join("\n");
}

/** Overview of every collection (served as the brindley://index resource), with links relative to `fromDir`. */
export function rootBlock(root: Root, fromDir = "."): string {
  const out: string[] = ["### Collections", ""];
  if (root.collections.length === 0) out.push("_None yet._");
  else {
    out.push("| Collection | Aliases | Title | Status | Draft | Designed | In progress | Deferred | Done | Ready |");
    out.push("|------------|---------|-------|--------|-------|----------|-------------|----------|------|-------|");
    for (const c of root.collections) {
      const n = (s: string) => c.initiatives.filter((i) => i.status === s).length;
      const ready = c.initiatives.filter((i) => isReady(root, i)).length;
      const href = posix.relative(fromDir, `${c.path}/README.md`);
      out.push(
        `| [${c.name}](${href}) | ${c.aliases.map((a) => `\`${a}\``).join(", ") || "—"} | ${esc(c.meta.title)} | ${c.meta.status} | ${n("draft")} | ${n("designed")} | ${n("in-progress")} | ${n("deferred")} | ${n("done")} | ${ready} |`,
      );
    }
  }

  // Cross-collection dependency edges, collapsed to collection level, drawn with the default graph
  // settings (no collection owns this graph): each edge points from a collection to one it depends on.
  const edges = new Map<string, string[]>();
  for (const i of allInitiatives(root).filter(isActive)) {
    for (const r of i.dependsOn) {
      if (r.kind !== "initiative" || r.collection === i.collection) continue;
      if (!lookup(root, r.collection, r.number)) continue;
      const key = `${i.collection}\u0000${r.collection}`;
      edges.set(key, [...(edges.get(key) ?? []), `${i.number}→${r.number}`]);
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
    out.push("", "### Cross-collection dependencies", "", "```mermaid", `flowchart ${mermaidDirection(DEFAULT_GRAPH)}`, ...nodes, ...lines, "```");
  }

  const tagNames = new Set<string>(allInitiatives(root).flatMap((i) => i.tags));
  if (tagNames.size > 0) {
    out.push("", "### Themes");
    for (const tag of [...tagNames].sort()) {
      out.push("", `#### \`${tag}\``, "");
      const doc = themeFor(root, tag);
      const desc = declaredTags(root)?.[tag];
      if (doc) out.push(`Overview: [${esc(doc.title)}](${posix.relative(fromDir, doc.rel)})${desc && desc !== doc.title ? ` — ${desc}` : ""}`, "");
      else if (desc) out.push(desc, "");
      const items = allInitiatives(root).filter((i) => i.tags.includes(tag));
      const ordered = [...items.filter(isActive), ...items.filter((i) => !isActive(i))];
      for (const i of ordered) {
        out.push(`- \`${initiativeKey(i)}\` ${link(i, fromDir)} — ${i.type ?? "untyped"}, ${i.status ?? "?"}`);
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

/** Generated member list for a theme doc: every initiative tagged with the theme, across collections. */
export function themeBlock(root: Root, theme: Theme): string {
  const fromDir = posix.dirname(theme.rel);
  const items = allInitiatives(root).filter((i) => i.tags.includes(theme.tag));
  if (items.length === 0) return `### Initiatives in this theme\n\n_None tagged \`${theme.tag}\` yet._`;
  const row = (i: Initiative) =>
    `| \`${initiativeKey(i)}\` | ${link(i, fromDir)} | ${esc(i.type ?? "—")} | ${esc(statusLabel(i))} | ${isActive(i) ? readiness(root, i) : "—"} |`;
  const active = items.filter(isActive);
  const rest = items.filter((i) => !isActive(i));
  return [
    `### Initiatives in this theme`,
    "",
    `Tagged \`${theme.tag}\`: ${active.length} open, ${rest.length} closed or deferred.`,
    "",
    "| Ref | Initiative | Type | Status | Ready / blocked by |",
    "|-----|------------|------|--------|--------------------|",
    ...active.map(row),
    ...rest.map(row),
  ].join("\n");
}

export interface ReadmeChange {
  path: string;
  reason: "updated" | "created" | "conflict";
}

/**
 * Regenerate generated blocks: each collection README's, and each theme doc's member list. With onlyConflicted,
 * only blocks containing conflict markers are rewritten (used during merges/rebases).
 */
export function regenerate(
  root: Root,
  opts: { collections?: Collection[]; onlyConflicted?: boolean; check?: boolean } = {},
): ReadmeChange[] {
  const changes: ReadmeChange[] = [];
  const handle = (path: string, block: string, initial: string) => {
    const current = existsSync(path) ? readFileSync(path, "utf8") : null;
    const conflicted = current !== null && hasConflictMarkers(blockOf(current) ?? "");
    if (opts.onlyConflicted && !conflicted) return;
    const next = applyBlock(current ?? initial, block);
    if (next === current) return;
    changes.push({ path, reason: current === null ? "created" : conflicted ? "conflict" : "updated" });
    if (!opts.check) writeFileSync(path, next);
  };
  const collections = opts.collections ?? root.collections;
  for (const c of collections) handle(c.readme, collectionBlock(root, c), `# ${c.meta.title}\n`);
  // Theme docs in those collections get their member list kept current too.
  const names = new Set(collections.map((c) => c.name));
  for (const t of root.themes) if (names.has(t.collection)) handle(t.file, themeBlock(root, t), `# ${t.title}\n`);
  return changes;
}
