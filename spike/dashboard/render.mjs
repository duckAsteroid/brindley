// Spike (initiatives#31): render one replay as three alternative one-page dashboards.
// node spike/dashboard/render.mjs [since-tag]   → build/spike-dashboard/{a,b,c}.html
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { replay } from "./replay.mjs";

/**
 * Built-in palettes: three steps of one hue per mode — not started, in progress, complete — light to
 * dark on a light surface and dark to light on a dark one. Each set passes the dataviz validator's
 * ordinal checks. sea is the dataviz reference blue; the others are Radix Colors (MIT) steps.
 */
const THEMES = {
  sea: { light: ["#86b6ef", "#3987e5", "#1c5cab"], dark: ["#184f95", "#3987e5", "#9ec5f4"] },
  plum: { light: ["#cf91d8", "#ab4aba", "#53195d"], dark: ["#734079", "#ab4aba", "#e796f3"] },
  forest: { light: ["#65ba74", "#46a758", "#2a7e3b"], dark: ["#366740", "#46a758", "#71d083"] },
  fire: { light: ["#ec8e7b", "#e54d2e", "#d13415"], dark: ["#853a2d", "#e54d2e", "#ff977d"] },
  teal: { light: ["#53b9ab", "#12a594", "#008573"], dark: ["#1c6961", "#12a594", "#0bd8b6"] },
  slate: { light: ["#8b8d98", "#60646c", "#1c2024"], dark: ["#5a6169", "#777b84", "#b0b4ba"] },
};
const KEYS = ["not_started", "in_progress", "complete"];
const vars = (steps) => KEYS.map((k, i) => `--${k.replace("_", "-")}:${steps[i]}`).join(";");
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
/** The palette's CSS: a theme name, a JSON file `{ light: {complete, in_progress, not_started}, dark: {…} }`, or a CSS file copied in. */
function paletteCss(arg) {
  const block = (light, dark) => `:root{${vars(light)}}\n@media (prefers-color-scheme:dark){:root{${vars(dark)}}}`;
  if (THEMES[arg]) return block(THEMES[arg].light, THEMES[arg].dark);
  const text = readFileSync(arg, "utf8");
  if (arg.endsWith(".css")) return block(THEMES.sea.light, THEMES.sea.dark) + "\n" + text.replace(/<\/style/gi, "<\\/style");
  const json = JSON.parse(text);
  const steps = (mode) => {
    const m = json[mode];
    if (!m) return null;
    return KEYS.map((k) => {
      if (!HEX.test(m[k] ?? "")) throw new Error(`${arg}: ${mode}.${k} must be a hex colour like "#1c5cab" (got ${JSON.stringify(m[k])}).`);
      return m[k];
    });
  };
  const light = steps("light") ?? THEMES.sea.light;
  return block(light, steps("dark") ?? light);
}
let extraCss = "";
const REPO = "https://github.com/duckAsteroid/brindley/blob/main/";
const NAME = "Brindley";
const r = replay();
const commits = r.commits;
const now = execFileSync("git", ["log", "-1", "--format=%cI"], { encoding: "utf8" }).trim();
const args = process.argv.slice(2);
const flag = (name) => { const k = args.indexOf(name); return k >= 0 ? args.splice(k, 2)[1] : undefined; };
const paletteArg = flag("--palette") ?? "sea";
/** auto (default): follow the viewer's light/dark setting; light or dark: always that. */
const mode = flag("--mode") ?? "auto";
if (!["auto", "light", "dark"].includes(mode)) throw new Error(`--mode must be auto, light or dark (got ${mode}).`);
const sinceArg = args[0];
const sinceTag = sinceArg ? r.tags.find((t) => t.tag === sinceArg) : r.tags.at(-1);
const since = sinceTag.date;

// ---- model -------------------------------------------------------------------------------------
const BAND = { draft: "todo", designed: "todo", "in-progress": "doing", done: "done", deferred: "parked", abandoned: "dropped", superseded: "dropped" };
const LABEL = { todo: "Not started", doing: "In progress", done: "Complete", parked: "Parked", dropped: "Dropped" };
const STATUS_WORD = { draft: "Planning", designed: "Ready to start", "in-progress": "In progress", done: "Delivered", deferred: "Parked", abandoned: "Dropped", superseded: "Replaced" };
const inScope = (b) => b === "todo" || b === "doing" || b === "done";

const counts = (items) => {
  const c = { todo: 0, doing: 0, done: 0, parked: 0, dropped: 0 };
  for (const i of items) c[BAND[i.status]]++;
  c.scope = c.todo + c.doing + c.done;
  return c;
};
const series = commits.map((c) => ({ t: Date.parse(c.date), date: c.date, subject: c.subject, sha: c.sha, ...counts(c.items) }));

/** What changed for each initiative between consecutive commits. */
const events = [];
commits.forEach((c, k) => {
  const before = new Map((commits[k - 1]?.items ?? []).map((i) => [i.n, i]));
  for (const i of c.items) {
    const was = before.get(i.n);
    const a = was ? BAND[was.status] : null, b = BAND[i.status];
    if (a === b) continue;
    let kind = null;
    if (!was && inScope(b)) kind = "added";
    else if (!was) kind = b; // created parked or dropped: not scope
    else if (b === "done") kind = "delivered";
    else if (b === "parked" || b === "dropped") kind = inScope(a) ? b : null;
    else if (a === "parked" || a === "dropped") kind = "returned";
    else if (b === "doing" && a === "todo") kind = "started";
    if (kind) events.push({ kind, t: Date.parse(c.date), date: c.date, item: i, from: a });
  }
});
const inPeriod = (e) => e.date > since;
const period = events.filter(inPeriod);
const of = (kind, list = period) => list.filter((e) => e.kind === kind);
const head = commits.at(-1).items;
const H = counts(head);
const at = (date) => [...series].reverse().find((s) => s.date <= date) ?? series[0];
const start = at(since);
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

const workstreams = (() => {
  const m = new Map();
  for (const i of head) for (const w of i.tags.length ? i.tags : ["untagged"]) m.set(w, [...(m.get(w) ?? []), i]);
  return [...m].map(([name, items]) => ({ name, items, c: counts(items) })).sort((x, y) => y.c.scope - x.c.scope || x.name.localeCompare(y.name));
})();
const wsName = (w) => (w === "untagged" ? "Not in a workstream" : w.replace(/-/g, " ").replace(/^./, (s) => s.toUpperCase()));

const attention = [
  ...head.filter((i) => BAND[i.status] === "todo" && i.open).map((i) => ({ i, why: `${i.open} open question${i.open > 1 ? "s" : ""} before it can start` })),
  ...head.filter((i) => i.status === "in-progress").map((i) => ({ i, why: "in progress" })),
  ...head.filter((i) => i.status === "deferred").map((i) => ({ i, why: `parked${i.note ? `: ${i.note}` : ""}` })),
];

// ---- formatting --------------------------------------------------------------------------------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const day = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
const dayTime = (d) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const link = (i) => `<a href="${REPO}${esc(i.path)}">${esc(i.title)}</a>`;
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

// ---- burn-up -----------------------------------------------------------------------------------
/**
 * Stacked step areas (Complete, In progress, Not started) whose top is the scope line, parked work
 * as a dashed band above it, the period shaded, release markers below. Hover: native <title> per
 * commit column plus a CSS crosshair — no scripts.
 */
function burnup(data, { w = 880, h = 300, yMax, markers = true, mini = false, label = "" } = {}) {
  const m = mini ? { l: 26, r: 8, t: 8, b: 18 } : { l: 40, r: 120, t: 16, b: markers ? 60 : 24 };
  const t0 = data[0].t, t1 = Date.parse(now) + 1;
  const max = yMax ?? Math.max(...data.map((d) => d.scope + d.parked));
  const top = Math.max(4, Math.ceil(max / (mini ? 5 : 5)) * 5);
  const x = (t) => m.l + ((t - t0) / (t1 - t0)) * (w - m.l - m.r);
  const y = (v) => h - m.b - (v / top) * (h - m.t - m.b);
  const step = (f) => data.map((d, k) => (k ? `H${x(d.t).toFixed(1)}V${y(f(d)).toFixed(1)}` : `M${x(d.t).toFixed(1)},${y(f(d)).toFixed(1)}`)).join("") + `H${x(t1).toFixed(1)}`;
  const area = (hi, lo) => {
    const xs = data.map((d, k) => [x(d.t), x(data[k + 1]?.t ?? t1)]);
    const up = data.flatMap((d, k) => [[xs[k][0], y(hi(d))], [xs[k][1], y(hi(d))]]);
    const down = data.flatMap((d, k) => [[xs[k][0], y(lo(d))], [xs[k][1], y(lo(d))]]).reverse();
    return "M" + [...up, ...down].map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join("L") + "Z";
  };
  const grid = [];
  for (let v = 0; v <= top; v += top / 5)
    grid.push(`<line class="grid" x1="${m.l}" x2="${w - m.r}" y1="${y(v)}" y2="${y(v)}"/>` + (mini && v !== top ? "" : `<text class="tick" x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`));
  const days = [];
  for (let d = new Date(new Date(t0).toISOString().slice(0, 10) + "T00:00:00Z").getTime() + 864e5; d < t1; d += 864e5)
    days.push(`<line class="grid" x1="${x(d)}" x2="${x(d)}" y1="${m.t}" y2="${h - m.b}"/><text class="tick" x="${x(d) + 3}" y="${h - m.b + 13}">${day(d)}</text>`);
  const shade = `<rect class="period" x="${x(Date.parse(since))}" y="${m.t}" width="${x(t1) - x(Date.parse(since))}" height="${h - m.t - m.b}"/>` +
    (mini ? "" : `<text class="tick strong period-label" x="${x(Date.parse(since)) + 4}" y="${m.t + 12}">This period</text>`);
  // Release markers: every release gets a tick (with a tooltip); labels are placed by priority —
  // the period's start first, then x.y.0 releases, then patches — into two staggered rows, skipping
  // any that would overlap one already placed.
  const sx = x(Date.parse(since));
  const sinceLine = `<line class="since" x1="${sx}" x2="${sx}" y1="${m.t}" y2="${h - m.b + (mini ? 0 : 17)}"/>`;
  let tags = "";
  if (markers && !mini) {
    const base = h - m.b;
    const shown = r.tags.filter((t) => Date.parse(t.date) >= t0 && t.tag !== sinceTag.tag).map((t) => ({ ...t, tx: x(Date.parse(t.date)) }));
    const rows = [[], []];
    const width = (label, bold) => label.length * (bold ? 7.2 : 6.2) + (bold ? 14 : 8);
    const fits = (row, lo, hi) => rows[row].every(([a, b]) => hi <= a || lo >= b);
    // the period's start: its own row-0 label, bold, never displaced
    const sinceLabel = `since ${sinceTag.tag}`;
    const sw = width(sinceLabel, true);
    rows[0].push([sx - sw / 2, sx + sw / 2]);
    // drawn last, as a pill, so nothing crosses it
    const pill = `<rect class="since-pill" x="${sx - sw / 2}" y="${base + 16}" width="${sw}" height="17" rx="4"/><text class="since-label" x="${sx}" y="${base + 28}" text-anchor="middle">${esc(sinceLabel)}</text>`;
    const labels = [];
    const rank = (t) => (/\.0\.0$/.test(t.tag) ? 0 : /\.0$/.test(t.tag) ? 1 : 2);
    for (const t of [...shown].sort((p, q) => rank(p) - rank(q) || p.tx - q.tx)) {
      const w2 = width(t.tag) / 2;
      const row = [0, 1].find((k) => fits(k, t.tx - w2, t.tx + w2));
      if (row === undefined) continue;
      rows[row].push([t.tx - w2, t.tx + w2]);
      t.row = row;
      labels.push(`<text class="tick" x="${t.tx}" y="${base + 28 + row * 14}" text-anchor="middle">${t.tag}</text>`);
    }
    tags = shown.map((t) => `<line class="tag" x1="${t.tx}" x2="${t.tx}" y1="${base}" y2="${base + (t.row === undefined ? 6 : t.row ? 31 : 17)}"><title>${t.tag} · ${dayTime(t.date)}</title></line>`).join("") + labels.join("") + pill;
  }
  const hover = data.map((d, k) => {
    const x0 = x(d.t), x1 = x(data[k + 1]?.t ?? t1);
    return `<g class="hit"><rect x="${x0}" y="${m.t}" width="${Math.max(1, x1 - x0)}" height="${h - m.t - m.b}"/><line x1="${x0}" x2="${x0}" y1="${m.t}" y2="${h - m.b}"/>` +
      `<title>${esc(dayTime(d.date))} — ${esc(d.subject)}\n${d.done} complete · ${d.doing} in progress · ${d.todo} not started (scope ${d.scope})${d.parked ? ` · ${d.parked} parked` : ""}</title></g>`;
  }).join("");
  const last = data.at(-1);
  const ends = mini ? "" : [
    [last.scope + last.parked, `${last.parked} parked`, last.parked, "muted parked-label"],
    [last.scope, `Scope ${last.scope}`, 1, "strong scope-label"],
    [last.done, `${last.done} complete`, 1, "done-label"],
  ].filter((e) => e[2]).map(([v, t, , c], k, arr) => {
    // nudge apart labels closer than 14px
    const yy = Math.min(y(v) + 4, k ? 0 : Infinity);
    return { yy: y(v) + 4, t, c };
  }).map((e, k, arr) => { if (k && e.yy - arr[k - 1].yy < 14) e.yy = arr[k - 1].yy + 14; return `<text class="end ${e.c}" x="${x(t1) + 8}" y="${e.yy}">${esc(e.t)}</text>`; }).join("");
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label || "Burn-up: work complete against total scope over time")}">
  ${shade}${grid.join("")}${days.join("")}
  <path class="parked" d="${area((d) => d.scope + d.parked, (d) => d.scope)}"/>
  <path class="b-todo" d="${area((d) => d.scope, (d) => d.done + d.doing)}"/>
  <path class="b-doing" d="${area((d) => d.done + d.doing, (d) => d.done)}"/>
  <path class="b-done" d="${area((d) => d.done, () => 0)}"/>
  <path class="scope" d="${step((d) => d.scope)}"/>
  <line class="axis" x1="${m.l}" x2="${w - m.r}" y1="${y(0)}" y2="${y(0)}"/>
  ${sinceLine}${tags}${hover}${ends}
</svg>`;
}

const LAYERS = [
  ["done", "b-done", "Complete", ".b-done,.done-label"],
  ["doing", "b-doing", "In progress", ".b-doing"],
  ["todo", "b-todo", "Not started", ".b-todo"],
  ["scope", "line", "Total scope", ".scope,.scope-label"],
  ["parked", "parked", "Parked (outside scope)", ".parked,.parked-label"],
  ["period", "period", "This period", ".period,.period-label"],
];
const legend = `<ul class="legend">${LAYERS.map(([k, sw, label]) => `<li><span class="sw ${sw}"></span>${label}</li>`).join("")}</ul>`;
/** The legend as switches: each checkbox shows or hides its layer on every chart, by CSS alone. */
const toggles = `<fieldset class="legend toggles"><legend class="sr">Show on the charts</legend>${LAYERS.map(([k, sw, label]) => `<label><input type="checkbox" id="show-${k}" checked><span class="sw ${sw}"></span>${label}</label>`).join("")}</fieldset>`;
extraCss += LAYERS.map(([k, , , sel]) => `body:has(#show-${k}:not(:checked)) .chart :is(${sel}){display:none}`).join("\n") + `
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
.toggles{border:0;margin:8px 0 0;padding:0}.toggles label{cursor:pointer;display:inline-flex;align-items:center;user-select:none;padding:2px 0}
.toggles input{position:absolute;opacity:0;width:1px;height:1px}
.toggles label:has(input:focus-visible){outline:2px solid var(--in-progress);outline-offset:2px;border-radius:4px}
.toggles label:has(input:not(:checked)){color:var(--muted);text-decoration:line-through}
.toggles label:has(input:not(:checked)) .sw{background:none;outline:1.5px solid var(--axis);outline-offset:-1.5px;border:0}
.hint{margin:4px 0 0;font-size:12px;color:var(--muted)}`;


/** Horizontal stacked bar for a workstream, on a shared scale. */
function bar(c, max, w = 180) {
  const s = (v) => (v / max) * w;
  let at = 0;
  const seg = (k) => { const v = c[k]; if (!v) return ""; const out = `<rect class="b-${k}" x="${at}" width="${Math.max(0, s(v) - 2)}" height="14" rx="2"><title>${LABEL[k]}: ${v}</title></rect>`; at += s(v); return out; };
  return `<svg class="bar" viewBox="0 0 ${w} 14" width="${w}" height="14" role="img" aria-label="${c.done} complete, ${c.doing} in progress, ${c.todo} not started">${seg("done")}${seg("doing")}${seg("todo")}</svg>`;
}

const table = `<details class="table"><summary>Data as a table</summary><table>
<thead><tr><th>When</th><th>Change</th><th class="n">Complete</th><th class="n">In progress</th><th class="n">Not started</th><th class="n">Scope</th><th class="n">Parked</th></tr></thead><tbody>
${series.map((d) => `<tr><td>${dayTime(d.date)}</td><td>${esc(d.subject)}</td><td class="n">${d.done}</td><td class="n">${d.doing}</td><td class="n">${d.todo}</td><td class="n">${d.scope}</td><td class="n">${d.parked}</td></tr>`).join("\n")}
</tbody></table></details>`;

const list = (evs, empty, extra = () => "") => evs.length ? `<ul class="items">${evs.map((e) => `<li>${link(e.item)}${extra(e)}</li>`).join("")}</ul>` : `<p class="muted">${empty}</p>`;

// ---- page shell --------------------------------------------------------------------------------
const CSS = `
:root{color-scheme:light;--page:#f9f9f7;--surface:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--muted:#898781;--grid:#e1e0d9;--axis:#c3c2b7;--ring:rgba(11,11,11,.10);--up:#006300}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;--page:#0d0d0d;--surface:#1a1a19;--ink:#fff;--ink2:#c3c2b7;--muted:#898781;--grid:#2c2c2a;--axis:#383835;--ring:rgba(255,255,255,.10);--up:#0ca30c}}
.period{--wash:color-mix(in srgb,var(--in-progress) 9%,transparent)}
*{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--ink);font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1040px;margin:0 auto;padding:28px 16px 48px}
a{color:inherit;text-decoration-color:var(--axis);text-underline-offset:2px}a:hover{text-decoration-color:currentColor}
h1{font-size:24px;margin:0}h2{font-size:15px;margin:0 0 10px;color:var(--ink)}.sub{color:var(--ink2);margin:4px 0 0}
.muted{color:var(--muted)}.card{background:var(--surface);border:1px solid var(--ring);border-radius:10px;padding:16px 18px}
.note{font-size:13px;color:var(--ink2);border-left:3px solid var(--axis);padding:2px 0 2px 10px;margin:14px 0}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:18px 0}
.tile .k{font-size:13px;color:var(--ink2)}.tile .v{font-size:30px;font-weight:650;line-height:1.15;margin-top:4px}.tile .d{font-size:13px;color:var(--ink2)}
.hero .v{font-size:44px}
.chart{width:100%;height:auto;display:block}
.grid{stroke:var(--grid);stroke-width:1}.axis{stroke:var(--axis);stroke-width:1}.tick{fill:var(--muted);font-size:11px;font-variant-numeric:tabular-nums}.tick.strong{fill:var(--ink2);font-weight:600}
.period{fill:var(--wash)}.since{stroke:var(--ink2);stroke-width:1.5;stroke-dasharray:4 3}.since-pill{fill:var(--ink)}.since-label{fill:var(--surface);font-size:12px;font-weight:650}.tag{stroke:var(--muted);stroke-width:1}
.b-done{fill:var(--complete)}.b-doing{fill:var(--in-progress)}.b-todo{fill:var(--not-started)}
path.b-done,path.b-doing,path.b-todo{stroke:var(--surface);stroke-width:2;stroke-linejoin:round}
.parked{fill:none;stroke:var(--muted);stroke-width:1.5;stroke-dasharray:3 3}
.scope{fill:none;stroke:var(--ink);stroke-width:2}
.end{font-size:12px;fill:var(--ink2)}.end.strong{fill:var(--ink);font-weight:600}.end.muted{fill:var(--muted)}
.hit rect{fill:transparent}.hit line{stroke:var(--ink);stroke-width:1;opacity:0}.hit:hover line{opacity:.5}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;list-style:none;padding:0;margin:8px 0 0;font-size:13px;color:var(--ink2)}
.sw{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.sw.b-done{background:var(--complete)}.sw.b-doing{background:var(--in-progress)}.sw.b-todo{background:var(--not-started)}
.sw.line{height:2px;background:var(--ink);vertical-align:3px;border-radius:0}.sw.parked{border:1.5px dashed var(--muted);border-radius:2px}.sw.period{background:var(--wash);outline:1px solid var(--ring)}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-top:12px}
.items{margin:0;padding-left:18px}.items li{margin:3px 0}.why{color:var(--ink2);font-size:13px}
.ws{display:grid;grid-template-columns:minmax(110px,1fr) 180px auto;gap:6px 14px;align-items:center;font-size:14px}.ws .n{color:var(--ink2);font-variant-numeric:tabular-nums}
.bar{display:block;max-width:100%}
.table{margin-top:14px;font-size:13px}.table summary{cursor:pointer;color:var(--ink2)}
table{border-collapse:collapse;width:100%;margin-top:8px}th,td{text-align:left;padding:4px 8px;border-bottom:1px solid var(--grid)}th{color:var(--ink2);font-weight:600}.n{text-align:right;font-variant-numeric:tabular-nums}
section{margin-top:16px}
footer{margin-top:28px;font-size:12px;color:var(--muted)}
@media (max-width:640px){.ws{grid-template-columns:1fr}.hero .v{font-size:36px}}
`;
const page = (title, body) => withSwitch(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${CSS}${extraCss}\n${paletteCss(paletteArg)}</style></head><body><main>${body}
<footer>Generated from the git history of the default branch · ${commits.length} changes replayed · as of ${dayTime(now)} · sized by count of work items</footer></main></body></html>`);
/**
 * Light/dark switch in the page, by CSS alone: radios Auto / Light / Dark, the one `--mode` names
 * checked. Every `@media (prefers-color-scheme: dark) { :root { … } }` block — the page's own and a
 * palette file's — is rewritten to apply when Dark is chosen, or when Auto is and the viewer's
 * setting is dark.
 */
function darkAware(css) {
  const re = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{/g;
  let out = "", at = 0, m;
  while ((m = re.exec(css))) {
    let depth = 1, i = m.index + m[0].length;
    for (; i < css.length && depth; i++) depth += css[i] === "{" ? 1 : css[i] === "}" ? -1 : 0;
    const inner = css.slice(m.index + m[0].length, i - 1);
    const as = (sel) => inner.replace(/:root(?::not\(\[data-theme=["']?light["']?\]\))?/g, sel);
    out += css.slice(at, m.index) + `@media (prefers-color-scheme:dark){${as(":root:has(#mode-auto:checked)")}}\n${as(":root:has(#mode-dark:checked)")}`;
    at = re.lastIndex = i;
  }
  return out + css.slice(at);
}
const modeSwitch = () => `<fieldset class="mode"><legend class="sr">Appearance</legend>${["auto", "light", "dark"].map((k) =>
  `<label><input type="radio" name="mode" id="mode-${k}"${k === mode ? " checked" : ""}>${k[0].toUpperCase() + k.slice(1)}</label>`).join("")}</fieldset>`;
const withSwitch = (html) => html.replace(/<style>([\s\S]*?)<\/style>/, (_, css) => `<style>${darkAware(css)}</style>`).replace("<main>", `<main>${modeSwitch()}`);
extraCss += `
.mode{float:right;display:inline-flex;border:1px solid var(--ring);border-radius:999px;padding:2px;margin:0 0 8px 12px;background:var(--surface)}
.mode label{position:relative;font-size:12px;padding:3px 10px;border-radius:999px;color:var(--ink2);cursor:pointer}
.mode input{position:absolute;opacity:0;inset:0;margin:0;cursor:pointer}
.mode label:has(input:checked){background:var(--ink);color:var(--surface)}
.mode label:has(input:focus-visible){outline:2px solid var(--in-progress);outline-offset:1px}`;

const header = (h) => `<header><h1>${NAME} — ${h}</h1><p class="sub">As of ${day(now)} · this period: since ${sinceTag.tag} (${dayTime(since)})</p></header>
<p class="note">Every work item counts as one: nothing is sized yet. Give work items a <em>size</em> to weigh them.</p>`;

const added = of("added"), delivered = of("delivered"), removed = [...of("parked"), ...of("dropped")];
const net = added.length - removed.length + of("returned").length;

// ---- A: headline one-pager ----------------------------------------------------------------------
const A = page(`${NAME} progress`, `${header("progress")}
<div class="tiles">
  <div class="card tile hero"><div class="k">Complete</div><div class="v">${pct(H.done, H.scope)}%</div><div class="d">${H.done} of ${H.scope} work items</div></div>
  <div class="card tile"><div class="k">Delivered this period</div><div class="v">${delivered.length}</div><div class="d">${start.done} → ${H.done} complete</div></div>
  <div class="card tile"><div class="k">Scope change this period</div><div class="v">${signed(net)}</div><div class="d">${added.length} added · ${removed.length} parked or dropped</div></div>
  <div class="card tile"><div class="k">In progress</div><div class="v">${H.doing}</div><div class="d">${H.todo} not started · ${H.parked} parked</div></div>
</div>
<section class="card"><h2>Work complete against scope</h2>${burnup(series)}${legend}${table}</section>
<div class="cols">
  <section class="card"><h2>Delivered this period</h2>${list(delivered, "Nothing delivered yet this period.")}</section>
  <section class="card"><h2>Added this period</h2>${list(added, "No new work this period.")}</section>
  <section class="card"><h2>Parked or dropped this period</h2>${list(removed, "Nothing taken out of scope.", (e) => ` <span class="why">— ${LABEL[e.kind].toLowerCase()}${e.item.note ? `: ${esc(e.item.note)}` : ""}</span>`)}</section>
</div>
<div class="cols">
  <section class="card"><h2>Workstreams</h2><div class="ws">${workstreams.map((w) => `<div>${esc(wsName(w.name))}</div>${bar(w.c, Math.max(...workstreams.map((x) => x.c.scope)))}<div class="n">${w.c.done} of ${w.c.scope}</div>`).join("")}</div>
  <p class="muted" style="font-size:12px;margin:10px 0 0">A work item in two workstreams counts in both.</p></section>
  <section class="card"><h2>Needs attention</h2>${attention.length ? `<ul class="items">${attention.map((a) => `<li>${link(a.i)} <span class="why">— ${esc(a.why)}</span></li>`).join("")}</ul>` : `<p class="muted">Nothing.</p>`}</section>
</div>`);

// ---- B: release story ----------------------------------------------------------------------------
const windows = [];
const tagsIn = r.tags.filter((t) => t.date >= commits[0].date);
let from = commits[0].date;
for (const t of [...tagsIn, { tag: "Since " + (tagsIn.at(-1)?.tag ?? "start"), date: now, open: true }]) {
  const evs = events.filter((e) => e.date > from && e.date <= t.date || (from === commits[0].date && e.date === from));
  windows.push({ ...t, from, evs });
  from = t.date;
}
const spark = (() => {
  const w = 880, h = 64, t0 = series[0].t, t1 = Date.parse(now) + 1;
  const x = (t) => 4 + ((t - t0) / (t1 - t0)) * (w - 8), y = (v) => h - 4 - (v / 100) * (h - 8);
  const d = series.map((s, k) => (k ? `H${x(s.t).toFixed(1)}V${y(pct(s.done, s.scope)).toFixed(1)}` : `M${x(s.t).toFixed(1)},${y(pct(s.done, s.scope)).toFixed(1)}`)).join("") + `H${x(t1)}`;
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Percent complete over time"><line class="grid" x1="4" x2="${w - 4}" y1="${y(100)}" y2="${y(100)}"/><line class="axis" x1="4" x2="${w - 4}" y1="${y(0)}" y2="${y(0)}"/><path d="${d}" fill="none" stroke="var(--complete)" stroke-width="2"/></svg>`;
})();
extraCss += `
.rel{display:grid;grid-template-columns:120px 1fr;gap:4px 18px;padding:14px 0;border-top:1px solid var(--grid)}.rel:first-child{border-top:0}
.rel .tag{font-weight:650}.rel .when{font-size:12px;color:var(--muted)}.rel .sum{font-size:14px;color:var(--ink2);margin-bottom:4px}
.chips{display:flex;flex-wrap:wrap;gap:4px 6px;margin:4px 0}.chip{font-size:13px;border:1px solid var(--ring);border-radius:999px;padding:1px 9px;background:var(--page)}
.chip.done{border-color:var(--complete)}.lbl{font-size:12px;color:var(--muted);margin-right:4px;align-self:center}
@media (max-width:640px){.rel{grid-template-columns:1fr}}`;
const chips = (evs, cls = "") => evs.length ? evs.map((e) => `<span class="chip ${cls}"><a href="${REPO}${esc(e.item.path)}">${esc(e.item.title)}</a></span>`).join("") : "";
const B = page(`${NAME} release story`, `${header("release by release")}
<div class="tiles">
  <div class="card tile hero"><div class="k">Complete</div><div class="v">${pct(H.done, H.scope)}%</div><div class="d">${H.done} of ${H.scope} work items · ${H.parked} parked</div></div>
  <div class="card tile" style="grid-column:span 3"><div class="k">Percent complete over time</div>${spark}<div class="d">${day(commits[0].date)} → ${day(now)}</div></div>
</div>
<section class="card"><h2>What each release delivered, and how the plan changed</h2>
${[...windows].reverse().filter((w) => w.evs.length || w.open).map((w) => {
  const d = of("delivered", w.evs), a = of("added", w.evs), x = [...of("parked", w.evs), ...of("dropped", w.evs)];
  return `<div class="rel"><div><div class="tag">${esc(w.tag)}</div><div class="when">${w.open ? "not yet released" : dayTime(w.date)}</div></div><div>
  <div class="sum">${d.length} delivered · scope ${signed(a.length - x.length)}${x.length ? ` (${x.length} parked or dropped)` : ""}</div>
  ${d.length ? `<div class="chips"><span class="lbl">Delivered</span>${chips(d, "done")}</div>` : ""}
  ${a.length ? `<div class="chips"><span class="lbl">Added</span>${chips(a)}</div>` : ""}
  ${x.length ? `<div class="chips"><span class="lbl">Out</span>${chips(x)}</div>` : ""}
  ${!d.length && !a.length && !x.length ? `<div class="muted">No changes yet.</div>` : ""}</div></div>`;
}).join("")}
</section>
<section class="card"><h2>Still to do</h2><div class="cols" style="margin:0">
  <div><div class="k muted">In progress (${H.doing})</div>${list(head.filter((i) => i.status === "in-progress").map((item) => ({ item })), "Nothing in progress.")}</div>
  <div><div class="k muted">Not started (${H.todo})</div>${list(head.filter((i) => BAND[i.status] === "todo").map((item) => ({ item })), "Nothing waiting.", (e) => ` <span class="why">— ${STATUS_WORD[e.item.status].toLowerCase()}${e.item.open ? `, ${e.item.open} open question${e.item.open > 1 ? "s" : ""}` : ""}</span>`)}</div>
</div></section>`);

// ---- C: workstream small multiples ---------------------------------------------------------------
const wsSeries = (name) => commits.map((c) => {
  const items = c.items.filter((i) => (i.tags.length ? i.tags : ["untagged"]).includes(name));
  return { t: Date.parse(c.date), date: c.date, subject: c.subject, ...counts(items) };
});
const wsMax = Math.max(...workstreams.map((w) => Math.max(...wsSeries(w.name).map((d) => d.scope + d.parked))));
extraCss += `.multi{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin-top:12px}.multi h2{display:flex;justify-content:space-between;gap:8px}.multi h2 span{font-weight:400;color:var(--ink2)}
.left{font-size:13px;margin:8px 0 0;padding-left:16px;color:var(--ink2)}.strip{display:flex;flex-wrap:wrap;gap:6px 22px;font-size:14px;color:var(--ink2);margin:16px 0 4px}.strip b{color:var(--ink);font-size:20px;margin-right:4px}`;
const multiples = `<div class="multi">${workstreams.map((w) => {
  const left = w.items.filter((i) => inScope(BAND[i.status]) && i.status !== "done");
  return `<section class="card"><h2>${esc(wsName(w.name))} <span>${w.c.done} of ${w.c.scope} complete</span></h2>
  ${burnup(wsSeries(w.name), { w: 320, h: 130, yMax: wsMax, mini: true, label: `${wsName(w.name)}: work complete against scope` })}
  ${left.length ? `<ul class="left">${left.map((i) => `<li>${link(i)}</li>`).join("")}</ul>` : `<p class="left muted" style="padding:0">All delivered.</p>`}</section>`;
}).join("")}</div>`;
const C = page(`${NAME} workstreams`, `${header("by workstream")}
<div class="strip card"><span><b>${pct(H.done, H.scope)}%</b>complete</span><span><b>${H.done}</b>of ${H.scope} delivered</span><span><b>${delivered.length}</b>delivered this period</span><span><b>${signed(net)}</b>scope this period</span><span><b>${H.doing}</b>in progress</span><span><b>${H.parked}</b>parked</span></div>
${legend}
${multiples}
<p class="muted" style="font-size:12px">Same scale on every chart. A work item in two workstreams appears in both.</p>`);

// ---- D: A and C combined, with the legend as switches ----------------------------------------------
const D = page(`${NAME} progress`, `${header("progress")}
<div class="tiles">
  <div class="card tile hero"><div class="k">Complete</div><div class="v">${pct(H.done, H.scope)}%</div><div class="d">${H.done} of ${H.scope} work items</div></div>
  <div class="card tile"><div class="k">Delivered this period</div><div class="v">${delivered.length}</div><div class="d">${start.done} → ${H.done} complete</div></div>
  <div class="card tile"><div class="k">Scope change this period</div><div class="v">${signed(net)}</div><div class="d">${added.length} added · ${removed.length} parked or dropped</div></div>
  <div class="card tile"><div class="k">In progress</div><div class="v">${H.doing}</div><div class="d">${H.todo} not started · ${H.parked} parked</div></div>
</div>
<section class="card"><h2>Work complete against scope</h2>${burnup(series)}${toggles}<p class="hint">Select a key entry to hide or show it, here and on the workstream charts.</p>${table}</section>
<div class="cols">
  <section class="card"><h2>Delivered this period</h2>${list(delivered, "Nothing delivered yet this period.")}</section>
  <section class="card"><h2>Added this period</h2>${list(added, "No new work this period.")}</section>
  <section class="card"><h2>Parked or dropped this period</h2>${list(removed, "Nothing taken out of scope.", (e) => ` <span class="why">— ${LABEL[e.kind].toLowerCase()}${e.item.note ? `: ${esc(e.item.note.split(/(?<=\.)\s/)[0])}` : ""}</span>`)}</section>
</div>
<section><h2 style="margin-top:22px">Workstreams</h2><p class="muted" style="font-size:13px;margin:-6px 0 0">Same scale and key as above. A work item in two workstreams appears in both.</p>${multiples}</section>
<section class="card"><h2>Needs attention</h2>${attention.length ? `<ul class="items">${attention.map((a) => `<li>${link(a.i)} <span class="why">— ${esc(a.why)}</span></li>`).join("")}</ul>` : `<p class="muted">Nothing.</p>`}</section>`);

// ---- themes: the headline chart in every built-in palette, light and dark ---------------------------
const NEUTRAL = {
  light: "color-scheme:light;--page:#f9f9f7;--surface:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--muted:#898781;--grid:#e1e0d9;--axis:#c3c2b7;--ring:rgba(11,11,11,.10)",
  dark: "color-scheme:dark;--page:#0d0d0d;--surface:#1a1a19;--ink:#fff;--ink2:#c3c2b7;--muted:#898781;--grid:#2c2c2a;--axis:#383835;--ring:rgba(255,255,255,.10)",
};
extraCss += `.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:8px 0 22px}.pair .card{background:var(--surface);color:var(--ink)}
@media (max-width:760px){.pair{grid-template-columns:1fr}}`;
const chart = burnup(series);
const THEMES_PAGE = page(`${NAME} palettes`, `<header><h1>${NAME} — palettes</h1><p class="sub">The headline chart in each built-in palette, light and dark. Pick one with <code>--palette &lt;name&gt;</code>, or pass a JSON or CSS file.</p></header>
${toggles}
${Object.entries(THEMES).map(([name, t]) => `<h2 style="margin-top:22px">${name}</h2><div class="pair">${["light", "dark"].map((mode) =>
  `<div class="card" style="${NEUTRAL[mode]};${vars(t[mode])}">${chart}</div>`).join("")}</div>`).join("")}`);

mkdirSync("build/spike-dashboard", { recursive: true });
writeFileSync("build/spike-dashboard/a-headline.html", A);
writeFileSync("build/spike-dashboard/b-release-story.html", B);
writeFileSync("build/spike-dashboard/c-workstreams.html", C);
writeFileSync("build/spike-dashboard/d-combined.html", D);
writeFileSync("build/spike-dashboard/palettes.html", THEMES_PAGE);
console.log(`replay ${r.ms.toFixed(0)}ms (${commits.length} commits, ${r.shows} blobs); period since ${sinceTag.tag}: ${delivered.length} delivered, ${added.length} added, ${removed.length} out`);
console.log("sizes:", ["a-headline", "b-release-story", "c-workstreams"].map((f) => f).join(" "));
if (process.env.DEBUG) for (const e of events) console.log(e.date, e.kind, e.item.n, e.from ?? "-", e.item.status);
