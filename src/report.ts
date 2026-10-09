import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { Collection, Root } from "./model.js";
import { BrindleyError, findCollection, toPosix } from "./repo.js";
import { dimensionsOf } from "./dimensions.js";
import { currentBranch, git } from "./git.js";
import { defaultCacheFile, readHistory, type Change, type ItemState } from "./history.js";
import { inProgressElsewhere, type Elsewhere } from "./elsewhere.js";
import { formatWhen } from "./axis.js";
import { renderReport } from "./report-html.js";

// --- Settings (the collection README's `report:`) ----------------------------------------------

/** Words the page uses, renameable with `report: { labels: { … } }`. */
export const DEFAULT_LABELS = {
  work_item: "work item",
  work_items: "work items",
  area: "area",
  areas: "areas",
  not_started: "Not started",
  in_progress: "In progress",
  complete: "Complete",
  draft: "Planning",
  designed: "Ready to start",
  "in-progress": "In progress",
  done: "Delivered",
  deferred: "Parked",
  abandoned: "Dropped",
  superseded: "Replaced",
} as const;
export type Labels = Record<keyof typeof DEFAULT_LABELS, string>;

export interface ReportSettings {
  /** The field work is sized by: a scoring dimension. */
  size: string;
  /** Points for word values of the size dimension. */
  points: Record<string, number>;
  labels: Partial<Labels>;
  workstreams?: "tags" | "collections";
}

const REPORT_KEYS = ["size", "points", "labels", "workstreams"];

/** Read a collection's `report:` leniently; anything unusable is reported for `validate` and ignored. */
export function parseReport(c: Collection): { settings: ReportSettings; problems: string[] } {
  const settings: ReportSettings = { size: "size", points: {}, labels: {} };
  const problems: string[] = [];
  const raw = c.meta.report;
  const dims = dimensionsOf(c);
  if (raw !== undefined && raw !== null) {
    if (typeof raw !== "object" || Array.isArray(raw)) problems.push("`report` must be a set of settings, e.g. `report: { size: job_size }`.");
    else {
      const r = raw as Record<string, unknown>;
      for (const k of Object.keys(r)) if (!REPORT_KEYS.includes(k)) problems.push(`Unknown \`report\` setting "${k}" (known: ${REPORT_KEYS.join(", ")}).`);
      if (r["size"] !== undefined) {
        const name = String(r["size"]);
        if (dims.some((d) => d.name === name)) settings.size = name;
        else problems.push(`\`report.size: ${name}\` is not a scoring dimension of this collection (${dims.map((d) => d.name).join(", ")}).`);
      }
      if (r["points"] !== undefined) {
        const dim = dims.find((d) => d.name === settings.size);
        if (typeof r["points"] !== "object" || Array.isArray(r["points"]) || r["points"] === null)
          problems.push("`report.points` must map size values to numbers, e.g. `points: { low: 1, medium: 3, high: 8 }`.");
        else
          for (const [word, v] of Object.entries(r["points"] as Record<string, unknown>)) {
            if (typeof v !== "number" || !(v >= 0)) problems.push(`\`report.points.${word}\` must be a number of points (got ${JSON.stringify(v)}).`);
            else if (dim && !dim.values.some((x) => String(x) === word))
              problems.push(`\`report.points\` gives points for "${word}", which is not a value of ${dim.name} (${dim.values.join(", ")}).`);
            else settings.points[word] = v;
          }
      }
      if (r["labels"] !== undefined) {
        if (typeof r["labels"] !== "object" || Array.isArray(r["labels"]) || r["labels"] === null) problems.push("`report.labels` must map words to replacements.");
        else
          for (const [k, v] of Object.entries(r["labels"] as Record<string, unknown>)) {
            const key = ([k, k.replace(/-/g, "_")].find((w) => w in DEFAULT_LABELS) ?? null) as keyof Labels | null;
            if (!key) problems.push(`\`report.labels\` has "${k}", which the report doesn't use (it uses: ${Object.keys(DEFAULT_LABELS).join(", ")}).`);
            else if (typeof v !== "string" || !v.trim()) problems.push(`\`report.labels.${k}\` must be some words.`);
            else settings.labels[key] = v.trim();
          }
      }
      if (r["workstreams"] !== undefined) {
        if (r["workstreams"] === "tags" || r["workstreams"] === "collections") settings.workstreams = r["workstreams"];
        else problems.push(`\`report.workstreams: ${String(r["workstreams"])}\` must be tags or collections.`);
      }
    }
  }
  // Word values of the size dimension without points.
  const dim = dims.find((d) => d.name === settings.size);
  if (dim && r0(raw)) {
    const words = dim.values.filter((v) => typeof v === "string" && !/^\d+(\.\d+)?$/.test(v)) as string[];
    const missing = words.filter((w) => settings.points[w] === undefined);
    if (missing.length && missing.length < dim.values.length)
      problems.push(`\`report.points\` has no points for ${missing.map((w) => `"${w}"`).join(", ")}: work sized that way counts as unsized.`);
  }
  return { settings, problems };
}
const r0 = (raw: unknown) => !!raw && typeof raw === "object" && !Array.isArray(raw) && "points" in (raw as object);

// --- Options ----------------------------------------------------------------------------------

export interface ReportOptions {
  /** Start of "this period": a tag, a date (YYYY-MM-DD) or a window before `until` (4w, 30d, 3m). */
  since?: string;
  /** End of the report: a tag, a date or a window before the latest commit. */
  until?: string;
  collection?: string;
  /** Output file; default build/brindley-report.html at the repo root. */
  out?: string;
  /** A built-in palette name, or a .json / .css palette file. */
  palette?: string;
  /** Where the page's Auto / Light / Dark switch starts. */
  mode?: "auto" | "light" | "dark";
  /** Branch globs to look on for in-progress work (`!` excludes); false: none. Default: all. */
  branches?: string[] | false;
  /** Other worktrees' working files to look in: true for all, or globs. Default: none. */
  worktrees?: boolean | string[];
  /** Where relative option paths resolve from (default the repo root). */
  cwd?: string;
  /** Use the replay cache in the build folder (default true). */
  cache?: boolean;
}

// --- Model ------------------------------------------------------------------------------------

export type Band = "todo" | "doing" | "done" | "parked" | "out";
const BAND: Record<string, Band> = { draft: "todo", designed: "todo", "in-progress": "doing", done: "done", deferred: "parked", abandoned: "out", superseded: "out" };
export const bandOf = (status: string | undefined): Band => BAND[status ?? "draft"] ?? "todo";
const inScope = (b: Band) => b === "todo" || b === "doing" || b === "done";

/** Totals at one point in time, in the report's unit; `est` is the estimated (unsized) part of each. */
export interface Point {
  t: number;
  date: string;
  subject: string;
  todo: number;
  doing: number;
  done: number;
  parked: number;
  scope: number;
  est: { todo: number; doing: number; done: number; parked: number };
}

export type EventKind = "added" | "delivered" | "started" | "parked" | "dropped" | "replaced" | "removed" | "resumed" | "resized";
export interface ReportEvent {
  kind: EventKind;
  t: number;
  date: string;
  collection: string;
  item: Item;
  /** Change in scope, in the report's unit. */
  scope: number;
}

/** An initiative as the report shows it. */
export interface Item {
  collection: string;
  number: number;
  title: string;
  path: string;
  url?: string;
  status?: string;
  tags: string[];
  /** Size in points, or null when unsized. */
  size: number | null;
  note?: string;
  openQuestions: number;
  dependsOn: string[];
  /** Where it is in progress outside the default branch. */
  elsewhere?: Elsewhere[];
}

export interface Workstream {
  name: string;
  label: string;
  series: Point[];
  items: Item[];
}

export interface Attention {
  item: Item;
  why: string;
}

export interface Section {
  /** Collection name, or null for the combined headline. */
  collection: string | null;
  title: string;
  unit: "points" | "count";
  /** Share of current scope that is estimated (0–1). */
  estimatedShare: number;
  /** The median used for unsized work, in points. */
  median: number | null;
  series: Point[];
  now: Point;
  start: Point;
  events: ReportEvent[];
  period: ReportEvent[];
  items: Item[];
  workstreams: Workstream[];
  workstreamKind: "tags" | "collections" | null;
  attention: Attention[];
  /** In progress outside the default branch, counted in `now`. */
  inProgressElsewhere: Item[];
}

export interface Release {
  tag: string;
  date: string;
  t: number;
}

export interface Report {
  name: string;
  now: string;
  first: string | null;
  period: { since: string; t: number; label: string; tag?: string; steppedBackFrom?: string; explicit: boolean };
  releases: Release[];
  labels: Labels;
  sections: Section[];
  combined: Section | null;
  /** Branches and worktrees whose in-progress work was counted. */
  lookedIn: string[];
  /** History was available (git, with commits). */
  history: boolean;
  commits: number;
  palette: string;
  mode: "auto" | "light" | "dark";
}

const DAY = 864e5;

/** A tag's, date's or window's instant. Windows count back from `ref`. */
function resolveWhen(root: Root, s: string, ref: number, what: string): { t: number; tag?: string } {
  const w = /^(\d+)\s*([dwm])$/i.exec(s.trim());
  if (w) {
    const n = Number(w[1]);
    const unit = w[2]!.toLowerCase();
    if (unit === "m") {
      const d = new Date(ref);
      return { t: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()) };
    }
    return { t: ref - n * (unit === "w" ? 7 : 1) * DAY };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const t = Date.parse(`${s}T00:00:00Z`);
    if (!Number.isNaN(t)) return { t };
  }
  const tagDate = git(root.repoRoot, ["log", "-1", "--format=%cI", `${s}^{commit}`, "--"])?.trim();
  if (tagDate) return { t: Date.parse(tagDate), tag: s };
  throw new BrindleyError(`${what} "${s}" is not a tag, a date (YYYY-MM-DD) or a window such as 4w, 30d or 3m.`);
}

/** Release tags (vX.Y.Z) on the checked-out line, oldest first. */
function releases(root: Root): Release[] {
  const out =
    git(root.repoRoot, [
      "for-each-ref",
      "--merged",
      "HEAD",
      "--format=%(refname:short)%09%(if)%(*committerdate)%(then)%(*committerdate:iso-strict)%(else)%(committerdate:iso-strict)%(end)",
      "refs/tags",
    ]) ?? "";
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [tag, date] = l.split("\t");
      return { tag: tag!, date: date!, t: Date.parse(date!) };
    })
    .filter((r) => /^v\d+\.\d+\.\d+$/.test(r.tag))
    .sort((a, b) => a.t - b.t || a.tag.localeCompare(b.tag, undefined, { numeric: true }));
}

/** Links to files on the repository host, when `origin` is GitHub, GitLab or Bitbucket. */
function hostLink(root: Root): ((path: string) => string) | undefined {
  const url = git(root.repoRoot, ["remote", "get-url", "origin"])?.trim();
  if (!url) return undefined;
  const m = /^(?:https?:\/\/(?:[^@/]+@)?|git@|ssh:\/\/git@)(github\.com|gitlab\.com|bitbucket\.org)[:/](.+?)(?:\.git)?\/?$/.exec(url);
  if (!m) return undefined;
  const ref = currentBranch(root.repoRoot) ?? git(root.repoRoot, ["rev-parse", "HEAD"])?.trim() ?? "HEAD";
  const base = `https://${m[1]}/${m[2]}`;
  const blob = m[1] === "gitlab.com" ? "-/blob" : m[1] === "bitbucket.org" ? "src" : "blob";
  return (path) => `${base}/${blob}/${ref.split("/").map(encodeURIComponent).join("/")}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k]! : (s[k - 1]! + s[k]!) / 2;
};

/** Points for a size value: numbers as they are, words through `points`. */
function pointsOf(settings: ReportSettings, state: ItemState): number | null {
  const v = state.fields[settings.size];
  if (typeof v === "number") return v >= 0 ? v : null;
  if (typeof v === "string") {
    if (/^\d+(\.\d+)?$/.test(v.trim())) return Number(v);
    return settings.points[v] ?? null;
  }
  return null;
}

interface CollectionRun {
  c: Collection;
  settings: ReportSettings;
  /** States after each change, by number. */
  states: Map<number, ItemState>;
  changes: Change[];
}

function emptyPoint(t: number, date: string, subject: string): Point {
  return { t, date, subject, todo: 0, doing: 0, done: 0, parked: 0, scope: 0, est: { todo: 0, doing: 0, done: 0, parked: 0 } };
}

/** Totals of a set of items (each with its measure and whether it is estimated). */
function total(t: number, date: string, subject: string, items: { band: Band; value: number; estimated: boolean }[]): Point {
  const p = emptyPoint(t, date, subject);
  for (const i of items) {
    if (i.band === "out") continue;
    p[i.band] += i.value;
    if (i.estimated) p.est[i.band] += i.value;
  }
  p.scope = p.todo + p.doing + p.done;
  return p;
}

const round = (n: number) => Math.round(n * 100) / 100;
function roundPoint(p: Point): Point {
  return { ...p, todo: round(p.todo), doing: round(p.doing), done: round(p.done), parked: round(p.parked), scope: round(p.scope), est: { todo: round(p.est.todo), doing: round(p.est.doing), done: round(p.est.done), parked: round(p.est.parked) } };
}

// --- Building the report --------------------------------------------------------------------

export function buildReport(root: Root, opts: ReportOptions = {}): Report {
  const chosen = opts.collection ? [findCollection(root, opts.collection) ?? fail(`No collection "${opts.collection}".`)] : root.collections;
  if (!chosen.length) throw new BrindleyError("No collections to report on: mark a folder with `brindley init` first.");
  const head = git(root.repoRoot, ["log", "-1", "--format=%cI"])?.trim();
  const cacheFile = opts.cache === false || !head ? undefined : defaultCacheFile(root.repoRoot);
  const history = head ? readHistory(root, cacheFile) : { head: null, changes: {} };
  const latest = head ? Date.parse(head) : 0;
  const untilAt = opts.until ? resolveWhen(root, opts.until, latest, "--until").t : latest;
  const nowDate = head ? (opts.until ? new Date(untilAt).toISOString().replace(/\.\d{3}Z$/, "Z") : head) : new Date(0).toISOString();
  const now = head ? untilAt : 0;
  const link = hostLink(root);

  const runs: CollectionRun[] = chosen.map((c) => ({
    c,
    settings: parseReport(c).settings,
    states: new Map(),
    changes: (history.changes[c.path] ?? []).filter((ch) => Date.parse(ch.date) <= now),
  }));
  const hasHistory = runs.some((r) => r.changes.length > 0);
  // Without history (no git, or never committed), the current files are the only point.
  if (!hasHistory)
    for (const r of runs)
      r.changes = [
        {
          sha: "",
          date: nowDate,
          subject: "Current files",
          removed: [],
          set: r.c.initiatives.map((i) => ({
            number: i.number,
            path: i.rel,
            title: i.title ?? i.slug,
            status: i.status,
            tags: i.tags,
            fields: Object.fromEntries(Object.entries(i.fm).filter(([, v]) => typeof v === "string" || typeof v === "number")) as Record<string, string | number>,
            note: i.statusNote,
            openQuestions: i.questions.filter((q) => !q.resolved && !q.implementation).length,
            dependsOn: i.dependsOn.flatMap((d) => (d.kind === "initiative" ? [`${findCollection(root, d.collection)?.path ?? d.collection}#${d.number}`] : [])),
          })),
        },
      ];

  // Final states, for sizing decisions (unit, median).
  const finalStates = runs.map((r) => {
    const m = new Map<number, ItemState>();
    for (const ch of r.changes) {
      for (const n of ch.removed) m.delete(n);
      for (const s of ch.set) m.set(s.number, s);
    }
    return m;
  });
  const sized = runs.map((r, k) => [...finalStates[k]!.values()].some((s) => pointsOf(r.settings, s) !== null));
  const combinedUnit: "points" | "count" = sized.every(Boolean) ? "points" : "count";
  const labels: Labels = { ...DEFAULT_LABELS, ...Object.assign({}, ...[...runs].reverse().map((r) => r.settings.labels)) };

  const toItem = (r: CollectionRun, s: ItemState): Item => ({
    collection: r.c.name,
    number: s.number,
    title: s.title.replace(/^\d+\s+/, ""),
    path: s.path,
    url: link?.(s.path),
    status: s.status,
    tags: s.tags,
    size: pointsOf(r.settings, s),
    note: s.note,
    openQuestions: s.openQuestions,
    dependsOn: s.dependsOn,
  });

  // A timeline across collections: each change, in commit order (same-date changes keep their order).
  const timeline = runs.flatMap((r, k) => r.changes.map((ch, j) => ({ k, j, ch, t: Date.parse(ch.date) }))).sort((a, b) => a.t - b.t || a.k - b.k || a.j - b.j);

  const perRun = runs.map((r) => ({ series: [] as Point[], combinedSeries: [] as Point[], events: [] as ReportEvent[], tagSeries: new Map<string, Point[]>(), startedAt: new Map<number, number>() }));
  const combinedSeries: Point[] = [];
  const unitOf = (k: number) => (sized[k] ? "points" : "count");

  /** Each item's measure in a unit: points (unsized at the median), or 1. */
  const measure = (k: number, states: Map<number, ItemState>, unit: "points" | "count") => {
    const r = runs[k]!;
    if (unit === "count") return (s: ItemState) => ({ value: 1, estimated: false, size: pointsOf(r.settings, s) });
    const inScopeSizes = [...states.values()].filter((s) => inScope(bandOf(s.status))).map((s) => pointsOf(r.settings, s)).filter((x): x is number => x !== null);
    const fallback = median([...finalStates[k]!.values()].map((s) => pointsOf(r.settings, s)).filter((x): x is number => x !== null)) ?? 1;
    const med = median(inScopeSizes) ?? fallback;
    return (s: ItemState) => {
      const p = pointsOf(r.settings, s);
      return { value: p ?? med, estimated: p === null, size: p };
    };
  };

  for (const { k, ch, t } of timeline) {
    const r = runs[k]!;
    const before = new Map(r.states);
    for (const n of ch.removed) r.states.delete(n);
    for (const s of ch.set) r.states.set(s.number, s);
    const own = measure(k, r.states, unitOf(k));
    const ownBefore = measure(k, before, unitOf(k));
    // Events: what changed for each initiative this commit touched.
    const touched = [...new Set([...ch.removed, ...ch.set.map((s) => s.number)])].sort((a, b) => a - b);
    for (const n of touched) {
      const was = before.get(n);
      const is = r.states.get(n);
      const a = was ? bandOf(was.status) : null;
      const b = is ? bandOf(is.status) : null;
      const item = toItem(r, (is ?? was)!);
      const push = (kind: EventKind, scope: number) => perRun[k]!.events.push({ kind, t, date: ch.date, collection: r.c.name, item, scope: round(scope) });
      if (is && b === "doing" && a !== "doing") perRun[k]!.startedAt.set(n, t);
      if (!was && is) {
        if (inScope(b!)) push("added", own(is).value);
        if (b === "done") push("delivered", 0);
        continue;
      }
      if (was && !is) {
        if (inScope(a!)) push("removed", -ownBefore(was).value);
        continue;
      }
      if (!was || !is) continue;
      if (a !== b) {
        if (b === "done") push("delivered", 0);
        else if (b === "doing" && a === "todo") push("started", 0);
        else if (b === "parked" && inScope(a!)) push("parked", -ownBefore(was).value);
        else if (b === "out" && inScope(a!) || b === "out" && a === "parked") push(is.status === "superseded" ? "replaced" : "dropped", inScope(a!) ? -ownBefore(was).value : 0);
        else if (inScope(b!) && (a === "parked" || a === "out")) push("resumed", own(is).value);
      }
      if (inScope(b!) && inScope(a!) && unitOf(k) === "points") {
        const p0 = pointsOf(r.settings, was);
        const p1 = pointsOf(r.settings, is);
        if (p0 !== p1 && (p0 !== null || p1 !== null)) push("resized", own(is).value - ownBefore(was).value);
      }
    }
    const pointOf = (states: Map<number, ItemState>, m: ReturnType<typeof measure>, filter: (s: ItemState) => boolean = () => true) =>
      total(t, ch.date, ch.subject, [...states.values()].filter(filter).map((s) => ({ band: bandOf(s.status), ...m(s) })));
    perRun[k]!.series.push(pointOf(r.states, own));
    perRun[k]!.combinedSeries.push(pointOf(r.states, measure(k, r.states, combinedUnit)));
    // Tag workstreams within the collection.
    const tags = new Set([...finalStates[k]!.values()].flatMap((s) => (s.tags.length ? s.tags : [""])));
    for (const tag of tags) {
      const list = perRun[k]!.tagSeries.get(tag) ?? [];
      list.push(pointOf(r.states, own, (s) => (tag === "" ? s.tags.length === 0 : s.tags.includes(tag))));
      perRun[k]!.tagSeries.set(tag, list);
    }
    // Combined: each collection's latest point, summed.
    const sum = emptyPoint(t, ch.date, ch.subject);
    for (const pr of perRun) {
      const last = pr.combinedSeries.at(-1);
      if (!last) continue;
      for (const key of ["todo", "doing", "done", "parked", "scope"] as const) sum[key] += last[key];
      for (const key of ["todo", "doing", "done", "parked"] as const) sum.est[key] += last.est[key];
    }
    combinedSeries.push(sum);
  }

  // --- The period --------------------------------------------------------------------------
  const rel = releases(root).filter((x) => x.t <= now);
  const allEvents = perRun.flatMap((p) => p.events).filter((e) => e.kind !== "started");
  const changedAfter = (t: number) => allEvents.some((e) => e.t > t && e.t <= now);
  let period: Report["period"];
  if (opts.since) {
    const w = resolveWhen(root, opts.since, now, "--since");
    period = { since: new Date(w.t).toISOString(), t: w.t, tag: w.tag, label: w.tag ? `since ${w.tag}` : /^\d+\s*[dwm]$/i.test(opts.since) ? `last ${windowWords(opts.since)}` : `since ${formatWhen(new Date(w.t).toISOString(), false)}`, explicit: true };
  } else if (rel.length) {
    let k = rel.length - 1;
    while (k > 0 && !changedAfter(rel[k]!.t)) k--;
    const r = rel[k]!;
    period = { since: r.date, t: r.t, tag: r.tag, label: `since ${r.tag}`, explicit: false, ...(k < rel.length - 1 ? { steppedBackFrom: rel.at(-1)!.tag } : {}) };
  } else {
    const t = now - 28 * DAY;
    period = { since: new Date(t).toISOString(), t, label: "last 4 weeks", explicit: false };
  }

  // --- In progress elsewhere (only for a report of now) --------------------------------------
  const lookedIn = new Set<string>();
  const elsewhere = runs.map((r) => {
    if (opts.until || (opts.branches === false && !opts.worktrees) || !head) return new Map<number, Elsewhere[]>();
    const found = inProgressElsewhere(root, r.c, { branches: opts.branches, worktrees: opts.worktrees ?? false });
    for (const list of found.values()) for (const e of list) lookedIn.add(e.worktree ? `worktree ${e.worktree}` : (e.branch ?? "a detached checkout"));
    return found;
  });

  // --- Sections ------------------------------------------------------------------------------
  const sections: Section[] = runs.map((r, k) => {
    const pr = perRun[k]!;
    const unit = unitOf(k);
    const m = measure(k, r.states, unit);
    const elsewhereHere = elsewhere[k]!;
    const items = [...r.states.values()].sort((a, b) => a.number - b.number).map((s) => {
      const it = toItem(r, s);
      const e = elsewhereHere.get(s.number);
      if (e && bandOf(s.status) === "todo") it.elsewhere = e;
      return it;
    });
    const series = pr.series.length ? pr.series.map(roundPoint) : [emptyPoint(now, nowDate, "")];
    const last = series.at(-1)!;
    // Now: the last point, with work in progress on branches moved from not started to in progress.
    const nowPoint = { ...last, t: now, date: nowDate, est: { ...last.est } };
    const moved = items.filter((i) => i.elsewhere);
    for (const i of moved) {
      const s = r.states.get(i.number)!;
      const v = m(s);
      nowPoint.todo = round(nowPoint.todo - v.value);
      nowPoint.doing = round(nowPoint.doing + v.value);
      if (v.estimated) {
        nowPoint.est.todo = round(nowPoint.est.todo - v.value);
        nowPoint.est.doing = round(nowPoint.est.doing + v.value);
      }
    }
    const sizes = items.filter((i) => inScope(bandOf(i.status))).map((i) => i.size).filter((x): x is number => x !== null);
    const med = unit === "points" ? (median(sizes) ?? median(items.map((i) => i.size).filter((x): x is number => x !== null))) : null;
    const scopeEst = nowPoint.est.todo + nowPoint.est.doing + nowPoint.est.done;
    // Workstreams: tags if any are used (or asked for), unless the collection asks for none.
    const tagged = items.some((i) => i.tags.length);
    const wsKind = r.settings.workstreams === "collections" ? null : tagged ? "tags" : null;
    const workstreams: Workstream[] = wsKind
      ? [...pr.tagSeries.entries()]
          .map(([tag, s]) => ({
            name: tag,
            label: tag === "" ? `Not in a workstream` : humaniseTag(tag),
            series: s.map(roundPoint),
            items: items.filter((i) => (tag === "" ? i.tags.length === 0 : i.tags.includes(tag))),
          }))
          .filter((w) => w.items.length)
          .sort((a, b) => (a.name === "") === (b.name === "") ? b.series.at(-1)!.scope - a.series.at(-1)!.scope || a.name.localeCompare(b.name) : a.name === "" ? 1 : -1)
      : [];
    return {
      collection: r.c.name,
      title: r.c.meta.title,
      unit,
      estimatedShare: nowPoint.scope ? round(scopeEst / nowPoint.scope) : 0,
      median: med,
      series,
      now: nowPoint,
      start: pointAt(series, period.t),
      events: pr.events,
      period: pr.events.filter((e) => e.t > period.t && e.t <= now),
      items,
      workstreams,
      workstreamKind: wsKind,
      attention: attentionFor(r, items, pr.startedAt, now, labels),
      inProgressElsewhere: moved,
    };
  });

  let combined: Section | null = null;
  if (sections.length > 1) {
    const series = combinedSeries.length ? combinedSeries.map(roundPoint) : [emptyPoint(now, nowDate, "")];
    const nowPoint = sections.reduce((acc, s, k) => {
      // Each section's now in the combined unit.
      const factor = combinedUnit === sections[k]!.unit ? 1 : 0;
      const src = factor ? s.now : countNow(s, runs[k]!);
      for (const key of ["todo", "doing", "done", "parked", "scope"] as const) acc[key] = round(acc[key] + src[key]);
      for (const key of ["todo", "doing", "done", "parked"] as const) acc.est[key] = round(acc.est[key] + src.est[key]);
      return acc;
    }, emptyPoint(now, nowDate, ""));
    const events = sections.flatMap((s) => s.events.map((e) => (combinedUnit === s.unit ? e : { ...e, scope: Math.sign(e.scope) })));
    combined = {
      collection: null,
      title: "All areas",
      unit: combinedUnit,
      estimatedShare: nowPoint.scope ? round((nowPoint.est.todo + nowPoint.est.doing + nowPoint.est.done) / nowPoint.scope) : 0,
      median: null,
      series,
      now: nowPoint,
      start: pointAt(series, period.t),
      events,
      period: events.filter((e) => e.t > period.t && e.t <= now),
      items: sections.flatMap((s) => s.items),
      workstreams: sections.map((s, k) => ({
        name: s.collection!,
        label: s.title,
        series: perRun[k]!.combinedSeries.map(roundPoint),
        items: s.items,
      })),
      workstreamKind: "collections",
      attention: sections.flatMap((s) => s.attention),
      inProgressElsewhere: sections.flatMap((s) => s.inProgressElsewhere),
    };
  }

  return {
    name: repoName(root),
    now: nowDate,
    first: timeline[0]?.ch.date ?? null,
    period,
    releases: rel,
    labels,
    sections,
    combined,
    lookedIn: [...lookedIn].sort(),
    history: hasHistory,
    commits: timeline.length,
    palette: opts.palette ?? "sea",
    mode: opts.mode ?? "auto",
  };
}

/** A section's now, counted (one per work item) — for a combined headline in work items. */
function countNow(s: Section, r: CollectionRun): Point {
  const p = emptyPoint(s.now.t, s.now.date, "");
  for (const i of s.items) {
    const b = i.elsewhere ? "doing" : bandOf(i.status);
    if (b === "out") continue;
    p[b] += 1;
  }
  p.scope = p.todo + p.doing + p.done;
  void r;
  return p;
}

function pointAt(series: Point[], t: number): Point {
  let p = series[0]!;
  for (const x of series) if (x.t <= t) p = x;
  return series[0]!.t > t ? { ...emptyPoint(t, new Date(t).toISOString(), ""), est: { todo: 0, doing: 0, done: 0, parked: 0 } } : p;
}

function attentionFor(r: CollectionRun, items: Item[], startedAt: Map<number, number>, now: number, labels: Labels): Attention[] {
  const byKey = new Map(items.map((i) => [`${r.c.path}#${i.number}`, i]));
  const out: Attention[] = [];
  for (const i of items) {
    const b = bandOf(i.status);
    if (i.elsewhere) out.push({ item: i, why: `${labels["in-progress"].toLowerCase()} on ${i.elsewhere.map((e) => e.branch ?? "a detached checkout").join(", ")}` });
    else if (b === "doing") {
      const since = startedAt.get(i.number);
      const weeks = since ? Math.floor((now - since) / (7 * DAY)) : 0;
      if (weeks >= 4) out.push({ item: i, why: `${labels["in-progress"].toLowerCase()} for ${weeks} weeks` });
    }
  }
  for (const i of items) {
    if (bandOf(i.status) !== "todo" || i.elsewhere) continue;
    const waiting = i.dependsOn.map((d) => byKey.get(d)).filter((d): d is Item => !!d && bandOf(d.status) !== "done");
    if (i.openQuestions) out.push({ item: i, why: `${i.openQuestions} open question${i.openQuestions > 1 ? "s" : ""} to settle before it can start` });
    else if (i.status === "designed" && waiting.length) out.push({ item: i, why: `${labels.designed.toLowerCase()}, waiting on ${waiting.map((w) => w.title).join(", ")}` });
  }
  for (const i of items) if (i.status === "deferred") out.push({ item: i, why: `${labels.deferred.toLowerCase()}${i.note ? `: ${firstSentence(i.note)}` : ""}` });
  return out;
}

export const firstSentence = (s: string) => s.split(/(?<=\.)\s/)[0]!;
const humaniseTag = (t: string) => t.replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase());
const windowWords = (s: string) => {
  const m = /^(\d+)\s*([dwm])$/i.exec(s.trim())!;
  const n = Number(m[1]);
  const unit = { d: "day", w: "week", m: "month" }[m[2]!.toLowerCase() as "d" | "w" | "m"];
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
};

function repoName(root: Root): string {
  const url = git(root.repoRoot, ["remote", "get-url", "origin"])?.trim();
  const fromUrl = url ? /([^/:]+?)(?:\.git)?\/?$/.exec(url)?.[1] : undefined;
  const name = fromUrl ?? root.repoRoot.split(/[\\/]/).filter(Boolean).pop() ?? "Repository";
  return name.replace(/^./, (c) => c.toUpperCase());
}

function fail(message: string): never {
  throw new BrindleyError(message);
}

// --- Writing --------------------------------------------------------------------------------

/** The figures the MCP tool returns alongside the file. */
export function figures(r: Report) {
  const sec = (s: Section) => ({
    ...(s.collection ? { collection: s.collection } : {}),
    title: s.title,
    unit: s.unit === "points" ? "points" : "work items",
    complete: s.now.done,
    in_progress: s.now.doing,
    not_started: s.now.todo,
    scope: s.now.scope,
    parked: s.now.parked,
    percent_complete: s.now.scope ? Math.round((100 * s.now.done) / s.now.scope) : 0,
    ...(s.unit === "points" ? { estimated_share: s.estimatedShare } : {}),
    period: {
      delivered: s.period.filter((e) => e.kind === "delivered").map((e) => e.item.title),
      added: s.period.filter((e) => e.kind === "added" || e.kind === "resumed").map((e) => e.item.title),
      out: s.period.filter((e) => ["parked", "dropped", "replaced", "removed"].includes(e.kind)).map((e) => e.item.title),
      scope_change: round(s.now.scope - s.start.scope),
    },
    in_progress_elsewhere: s.inProgressElsewhere.map((i) => ({ title: i.title, on: i.elsewhere!.map((e) => e.branch ?? e.worktree) })),
    needs_attention: s.attention.map((a) => ({ title: a.item.title, why: a.why })),
  });
  return {
    now: r.now,
    period: { label: r.period.label, since: r.period.since, ...(r.period.steppedBackFrom ? { stepped_back_from: r.period.steppedBackFrom } : {}) },
    ...(r.combined ? { all: sec(r.combined) } : {}),
    collections: r.sections.map(sec),
    looked_in: r.lookedIn,
    history: r.history,
  };
}

/** Build the report and write the page; returns where it went and the figures. */
export function writeReport(root: Root, opts: ReportOptions = {}): { file: string; report: Report } {
  const cwd = opts.cwd ?? root.repoRoot;
  const at = (p: string) => (isAbsolute(p) ? p : resolve(cwd, p));
  const report = buildReport(root, opts);
  const html = renderReport(report, { paletteFile: at });
  const file = opts.out ? at(opts.out) : join(root.repoRoot, "build", "brindley-report.html");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  return { file: toPosix(file), report };
}
