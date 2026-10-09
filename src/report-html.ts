import type { Attention, Item, Point, Report, ReportEvent, Section, Workstream } from "./report.js";
import { firstSentence } from "./report.js";
import { formatDay, formatWhen, timeAxis } from "./axis.js";
import { darkAware, paletteCss } from "./palettes.js";

const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const pts = (n: number) => `${fmt(n)} pt${n === 1 ? "" : "s"}`;
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : "0");
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
const f1 = (n: number) => n.toFixed(1);

/** The page's chart layers, each with a switch in the key. */
const LAYERS = [
  ["done", "b-done", "complete", ".b-done,.done-label"],
  ["doing", "b-doing", "in_progress", ".b-doing"],
  ["todo", "b-todo", "not_started", ".b-todo"],
  ["scope", "line", null, ".scope,.scope-label"],
  ["parked", "parked", "deferred", ".parked,.parked-label"],
  ["estimated", "est", null, ".est"],
  ["period", "period", null, ".period,.period-label"],
] as const;

interface Ctx {
  r: Report;
  /** Show estimated (hatched) layers and their switch. */
  estimated: boolean;
  /** Times matter: the history is short enough that hours show. */
  withTime: boolean;
}

/** Points merged so that no two are closer than `px` at this scale: the last of each run wins. */
function thin(series: Point[], x: (t: number) => number, px = 1.5): Point[] {
  const out: Point[] = [];
  for (const p of series) {
    if (out.length && x(p.t) - x(out.at(-1)!.t) < px) out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}

const niceTop = (max: number) => {
  if (max <= 4) return 4;
  const step = Math.pow(10, Math.floor(Math.log10(max / 5)));
  for (const m of [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10]) if (max <= m * step * 5) return m * step * 5;
  return Math.ceil(max / 5) * 5;
};

/**
 * A burn-up: stacked step areas (Complete, In progress, Not started) whose top is the scope line,
 * estimated parts hatched, parked work as a dashed band above, the period shaded and its start
 * marked; on the full chart, release ticks and labels below the time axis. Hover: a crosshair and
 * a box of each point's figures — no scripts.
 */
function burnup(ctx: Ctx, data: Point[], end: Point, o: { w?: number; h?: number; yMax?: number; mini?: boolean; label: string }): string {
  const { r } = ctx;
  const mini = !!o.mini;
  const w = o.w ?? 880;
  const h = o.h ?? 300;
  const m = mini ? { l: 28, r: 8, t: 8, b: 18 } : { l: 44, r: 128, t: 16, b: 60 };
  const clipT = r.period.explicit ? r.period.t : -Infinity;
  const t0 = Math.max(data[0]!.t, clipT === -Infinity ? data[0]!.t : clipT);
  const now = Math.max(Date.parse(r.now), t0 + 60_000);
  // A little room after now, so the latest commit's change shows rather than sitting on the edge.
  const t1 = now + Math.max((now - t0) * 0.03, 3_600_000);
  const x = (t: number) => m.l + ((Math.min(Math.max(t, t0), t1) - t0) / (t1 - t0)) * (w - m.l - m.r);
  // Points from the chart's start; the one in force at t0 stands in for it.
  let pts = data.filter((p) => p.t > t0);
  const atStart = [...data].reverse().find((p) => p.t <= t0);
  if (atStart) pts = [{ ...atStart, t: t0 }, ...pts];
  if (!pts.length) pts = [{ ...data.at(-1)!, t: t0 }];
  pts = thin(pts, x);
  const max = o.yMax ?? Math.max(...pts.map((p) => p.scope + p.parked), end.scope + end.parked);
  const top = niceTop(max);
  const y = (v: number) => h - m.b - (v / top) * (h - m.t - m.b);
  const nx = (k: number) => x(pts[k + 1]?.t ?? t1);
  const P = (a: number, b: number) => `${f1(a)},${f1(b)}`;
  const area = (hi: (p: Point) => number, lo: (p: Point) => number) => {
    const up = pts.flatMap((p, k) => [P(x(p.t), y(hi(p))), P(nx(k), y(hi(p)))]);
    const down = pts.flatMap((p, k) => [P(x(p.t), y(lo(p))), P(nx(k), y(lo(p)))]).reverse();
    return `M${[...up, ...down].join("L")}Z`;
  };
  const step = (f: (p: Point) => number) => pts.map((p, k) => (k ? `H${f1(x(p.t))}V${f1(y(f(p)))}` : `M${P(x(p.t), y(f(p)))}`)).join("") + `H${f1(x(t1))}`;
  const parts: string[] = [];
  // Period shading, gridlines, axis.
  const sx = x(r.period.t);
  const sinceIn = r.period.t >= t0 && r.period.t <= t1;
  parts.push(`<rect class="period" x="${f1(sx)}" y="${m.t}" width="${f1(x(t1) - sx)}" height="${h - m.t - m.b}"/>`);
  if (!mini && sinceIn) parts.push(`<text class="tick strong period-label" x="${f1(sx + 4)}" y="${m.t + 12}">This period</text>`);
  for (let v = 0; v <= top; v += top / (mini ? 2 : 5))
    parts.push(`<line class="grid" x1="${m.l}" x2="${w - m.r}" y1="${f1(y(v))}" y2="${f1(y(v))}"/>` + `<text class="tick" x="${m.l - 6}" y="${f1(y(v) + 4)}" text-anchor="end">${fmt(v)}</text>`);
  const axis = timeAxis(t0, now);
  for (const g of axis.grid) parts.push(`<line class="grid" x1="${f1(x(g))}" x2="${f1(x(g))}" y1="${m.t}" y2="${h - m.b}"/>`);
  for (const l of axis.labels) if (!mini || axis.labels.length <= 6) parts.push(`<text class="tick" x="${f1(x(l.t))}" y="${h - m.b + 13}" text-anchor="middle">${esc(l.text)}</text>`);
  // Bands, their estimated parts, parked, scope.
  parts.push(`<path class="parked" d="${area((p) => p.scope + p.parked, (p) => p.scope)}"/>`);
  parts.push(`<path class="b-todo" d="${area((p) => p.scope, (p) => p.done + p.doing)}"/>`);
  parts.push(`<path class="b-doing" d="${area((p) => p.done + p.doing, (p) => p.done)}"/>`);
  parts.push(`<path class="b-done" d="${area((p) => p.done, () => 0)}"/>`);
  if (ctx.estimated && pts.some((p) => p.est.todo + p.est.doing + p.est.done > 0)) {
    parts.push(`<path class="est" d="${area((p) => p.scope, (p) => p.scope - p.est.todo)}"/>`);
    parts.push(`<path class="est" d="${area((p) => p.done + p.doing, (p) => p.done + p.doing - p.est.doing)}"/>`);
    parts.push(`<path class="est" d="${area((p) => p.done, (p) => p.done - p.est.done)}"/>`);
  }
  parts.push(`<path class="scope" d="${step((p) => p.scope)}"/>`);
  parts.push(`<line class="axis" x1="${m.l}" x2="${w - m.r}" y1="${f1(y(0))}" y2="${f1(y(0))}"/>`);
  // The period's start: a dashed line, and on the full chart a label nothing overlaps.
  if (sinceIn) parts.push(`<line class="since" x1="${f1(sx)}" x2="${f1(sx)}" y1="${m.t}" y2="${h - m.b + (mini ? 0 : 17)}"/>`);
  if (!mini) parts.push(releaseMarks(r, x, h - m.b, sinceIn ? sx : null, t0, t1));
  // End labels (now, including in-progress work on branches), nudged apart.
  if (!mini) {
    const ends = [
      [end.scope + end.parked, `${fmt(end.parked)} ${r.labels.deferred.toLowerCase()}`, end.parked, "muted parked-label"],
      [end.scope, `Scope ${fmt(end.scope)}`, 1, "strong scope-label"],
      [end.done, `${fmt(end.done)} ${r.labels.complete.toLowerCase()}`, 1, "done-label"],
    ] as const;
    let prev = -Infinity;
    for (const [v, text, show, cls] of ends) {
      if (!show) continue;
      const yy = Math.max(y(v) + 4, prev + 14);
      prev = yy;
      parts.push(`<text class="end ${cls}" x="${f1(x(t1) + 8)}" y="${f1(yy)}">${esc(text)}</text>`);
    }
  }
  // Hover: one column per point, showing its figures in a box (CSS :hover, no script), with dots
  // on the band edges at that point. Drawn last, so the box sits over everything else.
  const fs = mini ? 10 : 12;
  const lh = fs + 4;
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k]!;
    const x0 = x(p.t);
    const rows: [string, string, string][] = [
      ["b-done", r.labels.complete, fmt(p.done)],
      ["b-doing", r.labels.in_progress, fmt(p.doing)],
      ["b-todo", r.labels.not_started, fmt(p.todo)],
      ["line", "Scope", fmt(p.scope)],
      ...(p.parked ? ([["parked", r.labels.deferred, fmt(p.parked)]] as [string, string, string][]) : []),
    ];
    const head = formatWhen(p.date, ctx.withTime);
    const subject = !mini && p.subject ? (p.subject.length > 48 ? `${p.subject.slice(0, 47)}…` : p.subject) : "";
    const textW = Math.max(head.length * fs * 0.62, subject.length * (fs - 1) * 0.6, ...rows.map(([, l, v]) => (l.length + v.length + 2) * fs * 0.6 + 16));
    const bw = Math.ceil(textW + 16);
    const bh = (rows.length + (subject ? 2 : 1)) * lh + 10;
    const bx = x0 + 10 + bw <= w - 4 ? x0 + 10 : x0 - 10 - bw;
    const by = m.t + 2;
    let ty = by + 6 + fs;
    const lines = [`<text class="tip-head" x="${f1(bx + 8)}" y="${f1(ty)}">${esc(head)}</text>`];
    if (subject) lines.push(`<text class="tip-sub" x="${f1(bx + 8)}" y="${f1((ty += lh))}">${esc(subject)}</text>`);
    for (const [cls, label, v] of rows) {
      ty += lh;
      lines.push(
        `<rect class="tip-sw ${cls === "line" ? "tip-line" : cls}" x="${f1(bx + 8)}" y="${f1(ty - fs + (cls === "line" ? fs / 2 - 1 : 2))}" width="${fs - 2}" height="${cls === "line" ? 2 : fs - 2}" rx="${cls === "line" ? 0 : 2}"/>` +
          `<text x="${f1(bx + 8 + fs + 2)}" y="${f1(ty)}">${esc(label)}</text><text class="tip-v" x="${f1(bx + bw - 8)}" y="${f1(ty)}" text-anchor="end">${esc(v)}</text>`,
      );
    }
    const dots = [p.done, p.done + p.doing, p.scope]
      .map((v, i) => `<circle class="tip-dot ${["b-done", "b-doing", "scope-dot"][i]}" cx="${f1(x0)}" cy="${f1(y(v))}" r="${mini ? 2.5 : 3.5}"/>`)
      .join("");
    parts.push(
      `<g class="hit"><rect class="hit-area" x="${f1(x0)}" y="${m.t}" width="${f1(Math.max(1, nx(k) - x0))}" height="${h - m.t - m.b}"/><g class="tip" style="font-size:${fs}px"><line x1="${f1(x0)}" x2="${f1(x0)}" y1="${m.t}" y2="${h - m.b}"/>${dots}<rect class="tip-box" x="${f1(bx)}" y="${by}" width="${bw}" height="${bh}" rx="6"/>${lines.join("")}</g></g>`,
    );
  }
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(o.label)}">${parts.join("")}</svg>`;
}

/**
 * Release ticks under the time axis, every release named on hover; labels by priority — the period's
 * start (a solid pill, drawn last), then x.0.0, then x.y.0, then patches — in two rows, leaving out
 * any that would overlap.
 */
function releaseMarks(r: Report, x: (t: number) => number, base: number, sx: number | null, t0: number, t1: number): string {
  const rows: [number, number][][] = [[], []];
  const width = (s: string, bold = false) => s.length * (bold ? 7.2 : 6.2) + (bold ? 14 : 8);
  const fits = (row: number, lo: number, hi: number) => rows[row]!.every(([a, b]) => hi <= a || lo >= b);
  let pill = "";
  if (sx !== null) {
    const label = r.period.label;
    const sw = width(label, true);
    rows[0]!.push([sx - sw / 2, sx + sw / 2]);
    pill = `<rect class="since-pill" x="${f1(sx - sw / 2)}" y="${base + 16}" width="${f1(sw)}" height="17" rx="4"/><text class="since-label" x="${f1(sx)}" y="${base + 28}" text-anchor="middle">${esc(label)}</text>`;
  }
  const shown = r.releases.filter((t) => t.t >= t0 && t.t <= t1 && !(r.period.tag === t.tag && sx !== null)).map((t) => ({ ...t, tx: x(t.t), row: -1 }));
  const rank = (tag: string) => (/\.0\.0$/.test(tag) ? 0 : /\.0$/.test(tag) ? 1 : 2);
  const labels: string[] = [];
  for (const t of [...shown].sort((a, b) => rank(a.tag) - rank(b.tag) || a.t - b.t)) {
    const half = width(t.tag) / 2;
    const row = [0, 1].find((k) => fits(k, t.tx - half, t.tx + half));
    if (row === undefined) continue;
    rows[row]!.push([t.tx - half, t.tx + half]);
    t.row = row;
    labels.push(`<text class="tick" x="${f1(t.tx)}" y="${base + 28 + row * 14}" text-anchor="middle">${esc(t.tag)}</text>`);
  }
  const ticks = shown.map((t) => `<line class="tag" x1="${f1(t.tx)}" x2="${f1(t.tx)}" y1="${base}" y2="${base + (t.row < 0 ? 6 : t.row ? 31 : 17)}"><title>${esc(t.tag)} · ${esc(formatWhen(t.date, true))}</title></line>`);
  return ticks.join("") + labels.join("") + pill;
}

function toggles(ctx: Ctx): string {
  const { labels } = ctx.r;
  const name = (k: (typeof LAYERS)[number]) =>
    k[0] === "scope" ? "Total scope" : k[0] === "estimated" ? "Estimated (unsized)" : k[0] === "period" ? "This period" : k[0] === "parked" ? `${labels.deferred} (outside scope)` : labels[k[2]!];
  return `<fieldset class="legend toggles"><legend class="sr">Show on the charts</legend>${LAYERS.filter((l) => l[0] !== "estimated" || ctx.estimated)
    .map((l) => `<label><input type="checkbox" id="show-${l[0]}" checked><span class="sw ${l[1]}"></span>${esc(name(l))}</label>`)
    .join("")}</fieldset><p class="hint">Select a key entry to hide or show it on every chart.</p>`;
}

const unitWords = (s: Section, r: Report) => (s.unit === "points" ? "points" : r.labels.work_items);

function link(i: Item): string {
  return i.url ? `<a href="${esc(i.url)}">${esc(i.title)}</a>` : esc(i.title);
}

function tiles(ctx: Ctx, s: Section): string {
  const { r } = ctx;
  const delivered = s.period.filter((e) => e.kind === "delivered");
  const added = s.period.filter((e) => e.kind === "added" || e.kind === "resumed" || (e.kind === "resized" && e.scope > 0));
  const out = s.period.filter((e) => ["parked", "dropped", "replaced", "removed"].includes(e.kind) || (e.kind === "resized" && e.scope < 0));
  const net = s.now.scope - s.start.scope;
  const elsewhere = s.inProgressElsewhere.length;
  return `<div class="tiles">
  <div class="card tile hero"><div class="k">${esc(r.labels.complete)}</div><div class="v">${pct(s.now.done, s.now.scope)}%</div><div class="d">${fmt(s.now.done)} of ${fmt(s.now.scope)} ${esc(unitWords(s, r))}</div></div>
  <div class="card tile"><div class="k">${esc(r.labels.done)} this period</div><div class="v">${delivered.length}</div><div class="d">${fmt(s.start.done)} → ${fmt(s.now.done)} ${esc(r.labels.complete.toLowerCase())}</div></div>
  <div class="card tile"><div class="k">Scope change this period</div><div class="v">${signed(net)}</div><div class="d">${added.length} added · ${out.length} taken out</div></div>
  <div class="card tile"><div class="k">${esc(r.labels.in_progress)}</div><div class="v">${fmt(s.now.doing)}</div><div class="d">${elsewhere ? `${elsewhere} on branches · ` : ""}${fmt(s.now.todo)} ${esc(r.labels.not_started.toLowerCase())} · ${fmt(s.now.parked)} ${esc(r.labels.deferred.toLowerCase())}</div></div>
</div>`;
}

/** How many items a list shows before the rest fold away behind "+ N more…". */
const SHOWN = 10;

/** List items, the first SHOWN shown and the rest behind a "+ N more…" disclosure. */
function capped(items: string[], cls = "items", shown = SHOWN): string {
  const li = (xs: string[]) => xs.map((x) => `<li>${x}</li>`).join("");
  const rest = items.slice(shown);
  return `<ul class="${cls}">${li(items.slice(0, shown))}</ul>${rest.length ? `<details class="more"><summary>+ ${rest.length} more…</summary><ul class="${cls}">${li(rest)}</ul></details>` : ""}`;
}

/** A box title with its count: "Added this period · 33 (41 pts)". */
const counted = (title: string, n: number, points?: number) =>
  `${esc(title)} <span class="count">· ${n}${points !== undefined && n ? ` (${pts(points)})` : ""}</span>`;

function periodLists(ctx: Ctx, s: Section): string {
  const { r } = ctx;
  const sizeNote = (e: ReportEvent) => (s.unit === "points" && e.item.size !== null ? ` <span class="why">· ${pts(e.item.size)}</span>` : "");
  // Newest first, so the first few are the latest.
  const list = (evs: ReportEvent[], empty: string, extra: (e: ReportEvent) => string = () => "") =>
    evs.length ? capped([...evs].reverse().map((e) => `${link(e.item)}${extra(e)}`)) : `<p class="muted">${esc(empty)}</p>`;
  const total = (evs: ReportEvent[], measure: (e: ReportEvent) => number) => (s.unit === "points" ? evs.reduce((n, e) => n + measure(e), 0) : undefined);
  const size = (e: ReportEvent) => e.item.size ?? s.median ?? 0;
  const delivered = s.period.filter((e) => e.kind === "delivered");
  const added = s.period.filter((e) => e.kind === "added" || e.kind === "resumed" || (e.kind === "resized" && e.scope > 0));
  const out = s.period.filter((e) => ["parked", "dropped", "replaced", "removed"].includes(e.kind) || (e.kind === "resized" && e.scope < 0));
  const word: Record<string, string> = {
    parked: r.labels.deferred,
    dropped: r.labels.abandoned,
    replaced: r.labels.superseded,
    removed: "Removed",
    resumed: "Resumed",
    resized: "Resized",
  };
  const why = (e: ReportEvent) =>
    word[e.kind]
      ? ` <span class="why">— ${esc(word[e.kind]!.toLowerCase())}${e.kind === "resized" ? ` ${signed(e.scope)}` : ""}${e.item.note && e.kind !== "resized" && e.kind !== "resumed" ? `: ${esc(firstSentence(e.item.note))}` : ""}</span>`
      : sizeNote(e);
  return `<div class="cols">
  <section class="card"><h3>${counted(`${r.labels.done} this period`, delivered.length, total(delivered, size))}</h3>${list(delivered, `Nothing ${r.labels.done.toLowerCase()} yet this period.`, sizeNote)}</section>
  <section class="card"><h3>${counted("Added this period", added.length, total(added, (e) => Math.abs(e.scope)))}</h3>${list(added, "No new work this period.", why)}</section>
  <section class="card"><h3>${counted("Taken out this period", out.length, total(out, (e) => Math.abs(e.scope)))}</h3>${list(out, "Nothing taken out of scope.", why)}</section>
</div>`;
}

function multiples(ctx: Ctx, s: Section, title: string, note: string): string {
  if (!s.workstreams.length) return "";
  const yMax = Math.max(...s.workstreams.flatMap((w) => w.series.map((p) => p.scope + p.parked)));
  const card = (w: Workstream) => {
    const end = w.series.at(-1) ?? s.now;
    const left = w.items.filter((i) => ["draft", "designed", "in-progress"].includes(i.status ?? "draft"));
    return `<section class="card"><h3>${esc(w.label)} <span>${fmt(end.done)} of ${fmt(end.scope)} ${esc(ctx.r.labels.complete.toLowerCase())}</span></h3>
  ${w.series.length ? burnup(ctx, w.series, end, { w: 320, h: 130, yMax, mini: true, label: `${w.label}: work complete against scope` }) : ""}
  ${left.length ? capped(left.map((i) => `${link(i)}${i.elsewhere ? ` <span class="why">— ${esc(ctx.r.labels["in-progress"].toLowerCase())} on a branch</span>` : ""}`), "left") : `<p class="left muted">All ${esc(ctx.r.labels.done.toLowerCase())}.</p>`}</section>`;
  };
  return `<section><h2 class="sub-h">${esc(title)}</h2><p class="muted small">${esc(note)}</p><div class="multi">${s.workstreams.map(card).join("")}</div></section>`;
}

function attention(list: Attention[]): string {
  return `<section class="card"><h3>${counted("Needs attention", list.length)}</h3>${
    list.length ? capped(list.map((a) => `${link(a.item)} <span class="why">— ${esc(a.why)}</span>`)) : `<p class="muted">Nothing.</p>`
  }</section>`;
}

function table(ctx: Ctx, s: Section): string {
  const { labels } = ctx.r;
  return `<details class="table"><summary>Data as a table</summary><table>
<thead><tr><th>When</th><th>Change</th><th class="n">${esc(labels.complete)}</th><th class="n">${esc(labels.in_progress)}</th><th class="n">${esc(labels.not_started)}</th><th class="n">Scope</th><th class="n">${esc(labels.deferred)}</th></tr></thead><tbody>
${s.series.map((p) => `<tr><td>${esc(formatWhen(p.date, ctx.withTime))}</td><td>${esc(p.subject)}</td><td class="n">${fmt(p.done)}</td><td class="n">${fmt(p.doing)}</td><td class="n">${fmt(p.todo)}</td><td class="n">${fmt(p.scope)}</td><td class="n">${fmt(p.parked)}</td></tr>`).join("\n")}
</tbody></table></details>`;
}

function sizingNote(ctx: Ctx, s: Section): string {
  const { r } = ctx;
  if (s.unit === "count")
    return `<p class="note">Every ${esc(r.labels.work_item)} counts as one${s.collection ? ": nothing here is sized yet. Give work a size to weigh it." : ": not every area sizes its work."}</p>`;
  if (s.estimatedShare > 0)
    return `<p class="note">${Math.round(s.estimatedShare * 100)}% of scope is unsized${s.median !== null ? `, counted at the median ${fmt(s.median)} points` : ""}, and drawn hatched as estimated.</p>`;
  return "";
}

function block(ctx: Ctx, s: Section, opts: { key: boolean; heading?: string; areas?: boolean }): string {
  const parts: string[] = [];
  if (opts.heading) parts.push(`<h2 class="area">${esc(opts.heading)}</h2>`);
  parts.push(sizingNote(ctx, s));
  parts.push(tiles(ctx, s));
  parts.push(
    `<section class="card"><h3>Work complete against scope</h3>${burnup(ctx, s.series, s.now, { label: `${s.title}: work complete against total scope over time` })}${opts.key ? toggles(ctx) : `<p class="hint">Same key as above.</p>`}${table(ctx, s)}</section>`,
  );
  parts.push(periodLists(ctx, s));
  if (opts.areas) parts.push(multiples(ctx, s, `${capital(ctx.r.labels.areas)}`, "Same scale and key as above."));
  else if (s.workstreamKind === "tags") parts.push(multiples(ctx, s, "Workstreams", `Same scale and key as above. A ${ctx.r.labels.work_item} in two workstreams appears in both.`));
  if (!opts.areas) parts.push(attention(s.attention));
  return parts.join("\n");
}

const capital = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

const CSS = `
:root{color-scheme:light;--page:#f9f9f7;--surface:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--muted:#898781;--grid:#e1e0d9;--axis:#c3c2b7;--ring:rgba(11,11,11,.10)}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;--page:#0d0d0d;--surface:#1a1a19;--ink:#fff;--ink2:#c3c2b7;--muted:#898781;--grid:#2c2c2a;--axis:#383835;--ring:rgba(255,255,255,.10)}}
.period,.sw.period{--wash:color-mix(in srgb,var(--in-progress) 9%,transparent)}
*{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--ink);font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1040px;margin:0 auto;padding:28px 16px 48px}
a{color:inherit;text-decoration-color:var(--axis);text-underline-offset:2px}a:hover{text-decoration-color:currentColor}
h1{font-size:24px;margin:0}h2{font-size:18px;margin:28px 0 8px}h3{font-size:15px;margin:0 0 10px}.sub{color:var(--ink2);margin:4px 0 0}
h2.area{border-top:1px solid var(--grid);padding-top:20px;margin-top:36px}h2.sub-h{font-size:15px;margin:22px 0 2px}
.muted{color:var(--muted)}.small{font-size:13px;margin:0}.card{background:var(--surface);border:1px solid var(--ring);border-radius:10px;padding:16px 18px}
.note{font-size:13px;color:var(--ink2);border-left:3px solid var(--axis);padding:2px 0 2px 10px;margin:14px 0}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:14px 0}
.tile .k{font-size:13px;color:var(--ink2)}.tile .v{font-size:30px;font-weight:650;line-height:1.15;margin-top:4px}.tile .d{font-size:13px;color:var(--ink2)}.hero .v{font-size:44px}
.chart{width:100%;height:auto;display:block}
.grid{stroke:var(--grid);stroke-width:1}.axis{stroke:var(--axis);stroke-width:1}.tick{fill:var(--muted);font-size:11px;font-variant-numeric:tabular-nums}.tick.strong{fill:var(--ink2);font-weight:600}
.period{fill:var(--wash)}.since{stroke:var(--ink2);stroke-width:1.5;stroke-dasharray:4 3}.since-pill{fill:var(--ink)}.since-label{fill:var(--surface);font-size:12px;font-weight:650}.tag{stroke:var(--muted);stroke-width:1}
.b-done{fill:var(--complete)}.b-doing{fill:var(--in-progress)}.b-todo{fill:var(--not-started)}
path.b-done,path.b-doing,path.b-todo{stroke:var(--surface);stroke-width:2;stroke-linejoin:round}
.est{fill:url(#hatch);stroke:none}.hatch-line{stroke:var(--surface);stroke-width:2;opacity:.75}
.parked{fill:none;stroke:var(--muted);stroke-width:1.5;stroke-dasharray:3 3}
.scope{fill:none;stroke:var(--ink);stroke-width:2}
.end{font-size:12px;fill:var(--ink2)}.end.strong{fill:var(--ink);font-weight:600}.end.muted{fill:var(--muted)}
.hit-area{fill:transparent}.tip{display:none;pointer-events:none}.hit:hover .tip{display:inline}
.tip line{stroke:var(--ink);stroke-width:1;opacity:.5}.tip-box{fill:var(--surface);stroke:var(--axis);stroke-width:1}
.tip text{fill:var(--ink2)}.tip .tip-head,.tip .tip-v{fill:var(--ink);font-weight:600;font-variant-numeric:tabular-nums}.tip .tip-sub{fill:var(--muted)}
.tip-sw.b-done{fill:var(--complete)}.tip-sw.b-doing{fill:var(--in-progress)}.tip-sw.b-todo{fill:var(--not-started)}.tip-sw.tip-line{fill:var(--ink)}.tip-sw.parked{fill:none;stroke:var(--muted);stroke-dasharray:2 2}
.tip-dot{stroke:var(--surface);stroke-width:1.5}.tip-dot.b-done{fill:var(--complete)}.tip-dot.b-doing{fill:var(--in-progress)}.tip-dot.scope-dot{fill:var(--ink)}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;list-style:none;padding:0;margin:8px 0 0;font-size:13px;color:var(--ink2)}
.sw{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.sw.b-done{background:var(--complete)}.sw.b-doing{background:var(--in-progress)}.sw.b-todo{background:var(--not-started)}
.sw.line{height:2px;background:var(--ink);vertical-align:3px;border-radius:0}.sw.parked{border:1.5px dashed var(--muted);border-radius:2px}.sw.period{background:var(--wash);outline:1px solid var(--ring)}
.sw.est{background:repeating-linear-gradient(45deg,var(--in-progress) 0 3px,var(--surface) 3px 5px)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
.toggles{border:0;margin:8px 0 0;padding:0}.toggles label{cursor:pointer;display:inline-flex;align-items:center;user-select:none;padding:2px 0}
.toggles input{position:absolute;opacity:0;width:1px;height:1px}
.toggles label:has(input:focus-visible){outline:2px solid var(--in-progress);outline-offset:2px;border-radius:4px}
.toggles label:has(input:not(:checked)){color:var(--muted);text-decoration:line-through}
.toggles label:has(input:not(:checked)) .sw{background:none;outline:1.5px solid var(--axis);outline-offset:-1.5px;border:0}
.hint{margin:4px 0 0;font-size:12px;color:var(--muted)}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin:12px 0}
.count{font-weight:400;color:var(--ink2)}
.more{margin-top:4px}.more summary{cursor:pointer;color:var(--ink2);font-size:13px;list-style:none;padding-left:18px}.more summary::-webkit-details-marker{display:none}.more[open] summary{margin-bottom:2px}
.items{margin:0;padding-left:18px}.items li{margin:3px 0}.why{color:var(--ink2);font-size:13px}
.multi{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin:10px 0 12px}.multi h3{display:flex;justify-content:space-between;gap:8px}.multi h3 span{font-weight:400;color:var(--ink2)}
.left{font-size:13px;margin:8px 0 0;padding-left:16px;color:var(--ink2)}p.left{padding:0}
.table{margin-top:14px;font-size:13px}.table summary{cursor:pointer;color:var(--ink2)}
table{border-collapse:collapse;width:100%;margin-top:8px}th,td{text-align:left;padding:4px 8px;border-bottom:1px solid var(--grid)}th{color:var(--ink2);font-weight:600}.n{text-align:right;font-variant-numeric:tabular-nums}
.mode{float:right;display:inline-flex;border:1px solid var(--ring);border-radius:999px;padding:2px;margin:0 0 8px 12px;background:var(--surface)}
.mode label{position:relative;font-size:12px;padding:3px 10px;border-radius:999px;color:var(--ink2);cursor:pointer}
.mode input{position:absolute;opacity:0;inset:0;margin:0;cursor:pointer}
.mode label:has(input:checked){background:var(--ink);color:var(--surface)}
.mode label:has(input:focus-visible){outline:2px solid var(--in-progress);outline-offset:1px}
footer{margin-top:28px;font-size:12px;color:var(--muted)}
@media (max-width:640px){.hero .v{font-size:36px}}
`;

/** The whole page: one self-contained HTML file, no scripts. */
export function renderReport(r: Report, o: { paletteFile?: (p: string) => string } = {}): string {
  const all = [r.combined, ...r.sections].filter((s): s is Section => !!s);
  const ctx: Ctx = {
    r,
    estimated: all.some((s) => s.unit === "points" && s.series.some((p) => p.est.todo + p.est.doing + p.est.done > 0)),
    withTime: r.first ? Date.parse(r.now) - Date.parse(r.first) < 3 * 864e5 : true,
  };
  const layerCss = LAYERS.map(([k, , , sel]) => `body:has(#show-${k}:not(:checked)) .chart :is(${sel}){display:none}`).join("\n");
  const css = darkAware(`${CSS}\n${layerCss}\n${paletteCss(r.palette, o.paletteFile)}`);
  const sinceWhen = formatWhen(r.period.since, ctx.withTime);
  const sub = `As of ${esc(formatWhen(r.now, ctx.withTime))} · this period: ${esc(r.period.label)}${r.period.tag ? ` (${esc(sinceWhen)})` : ""}${r.period.steppedBackFrom ? ` — nothing has changed since ${esc(r.period.steppedBackFrom)}` : ""}`;
  const body: string[] = [];
  if (r.combined) {
    body.push(block(ctx, r.combined, { key: true, areas: true }));
    r.sections.forEach((s) => body.push(block(ctx, s, { key: false, heading: s.title })));
  } else body.push(block(ctx, r.sections[0]!, { key: true }));
  const counted = r.lookedIn.length ? ` · counts work in progress on ${r.lookedIn.map(esc).join(", ")}` : "";
  const historyNote = r.history ? `Generated by Brindley from the git history · ${r.commits} change${r.commits === 1 ? "" : "s"} replayed` : "Generated by Brindley from the current files — no git history, so nothing over time";
  const modes = ["auto", "light", "dark"]
    .map((k) => `<label><input type="radio" name="mode" id="mode-${k}"${k === r.mode ? " checked" : ""}>${capital(k)}</label>`)
    .join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(r.name)} progress</title><style>${css}</style></head>
<body><svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line class="hatch-line" x1="0" y1="0" x2="0" y2="6"/></pattern></defs></svg>
<main><fieldset class="mode"><legend class="sr">Appearance</legend>${modes}</fieldset>
<header><h1>${esc(r.name)} — progress</h1><p class="sub">${sub}</p></header>
${body.join("\n")}
<footer>${historyNote} · as of ${esc(formatWhen(r.now, true))}${counted}${ctx.withTime ? " · times in UTC" : ""}</footer>
</main></body></html>
`;
}

export { formatDay };
