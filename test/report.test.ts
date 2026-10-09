import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { fixture, git, write, type Fixture } from "./helpers.js";
import { buildReport, parseReport, writeReport } from "../src/report.js";
import { renderReport } from "../src/report-html.js";
import { timeAxis } from "../src/axis.js";
import { darkAware, paletteCss } from "../src/palettes.js";
import { validate } from "../src/validate.js";
import { createServer } from "../src/server.js";

let fx: Fixture;
afterEach(() => fx?.cleanup());

const DAY = 864e5;
const at = (day: number) => new Date(Date.UTC(2026, 8, 1) + day * DAY).toISOString();

/** Commit everything as of a day after 1 Sep 2026, optionally tagging it. */
function commit(day: number, message: string, tag?: string) {
  const env = { ...process.env, GIT_AUTHOR_DATE: at(day), GIT_COMMITTER_DATE: at(day) };
  execFileSync("git", ["add", "-A"], { cwd: fx.repo, env });
  execFileSync("git", ["commit", "-q", "--allow-empty", "-m", message], { cwd: fx.repo, env });
  if (tag) execFileSync("git", ["tag", "-a", tag, "-m", tag], { cwd: fx.repo, env });
}

const item = (title: string, fm: string, body = "") => `---\n${fm}\n---\n# ${title}\n${body}`;
const README = (extra = "") => `---\nbrindley: 1\ntitle: Lock gate maintenance\ndimensions:\n  size: [1, 2, 3, 5, 8]\n${extra}---\n# Lock gate maintenance\n`;
const L = "lock-gate-maintenance";

/**
 * Day 0: gates (3) and paddles (5) planned; v1.0.0. Day 2: gates delivered. Day 4: sensors added,
 * unsized; paddles parked; v1.1.0 — nothing changes after it.
 */
function canal(readmeExtra = "") {
  fx = fixture({ commit: false });
  write(fx.repo, `${L}/README.md`, README(readmeExtra));
  write(fx.repo, `${L}/01-gate-repairs.md`, item("Gate repairs", "status: designed\nsize: 3\ntags: [gates]"));
  write(fx.repo, `${L}/02-paddle-replacement.md`, item("Paddle replacement", "status: draft\nsize: 5\ntags: [gates]"));
  commit(0, "plan the gates", "v1.0.0");
  write(fx.repo, `${L}/01-gate-repairs.md`, item("Gate repairs", "status: done\nsize: 3\ntags: [gates]\ndocs_impact: 'none: fixture'"));
  commit(2, "deliver gate repairs");
  write(fx.repo, `${L}/03-water-level-sensors.md`, item("Water level sensors", "status: draft", "\n## Open questions\n\n- Which sensor?\n"));
  write(fx.repo, `${L}/02-paddle-replacement.md`, item("Paddle replacement", "status: deferred\nsize: 5\ntags: [gates]\nstatus_note: Waiting for winter stoppage. Then we can drain."));
  commit(4, "sensors; park paddles", "v1.1.0");
}

describe("progress report", () => {
  it("replays history: points, the median for unsized work, events and the stepped-back period", () => {
    canal();
    const r = buildReport(fx.load(), { cache: false });
    const s = r.sections[0]!;
    expect(s.unit).toBe("points");
    expect(s.series.map((p) => [p.done, p.todo, p.scope, p.parked])).toEqual([
      [0, 8, 8, 0],
      [3, 5, 8, 0],
      [3, 3, 6, 5], // sensors counted at the median of the sized scope (3); paddles parked
    ]);
    expect(s.now.est.todo).toBe(3);
    expect(s.estimatedShare).toBe(0.5);
    expect(s.median).toBe(3);
    // Nothing changed after v1.1.0: the period steps back to v1.0.0, and says so.
    expect(r.period).toMatchObject({ tag: "v1.0.0", steppedBackFrom: "v1.1.0", explicit: false });
    expect(s.period.map((e) => `${e.kind} ${e.item.number}`)).toEqual(["delivered 1", "parked 2", "added 3"]);
    expect(s.start.scope).toBe(8);
    expect(s.attention.map((a) => a.why)).toEqual(["1 open question to settle before it can start", "parked: Waiting for winter stoppage."]);
    expect(s.workstreams.map((w) => w.label)).toEqual(["Gates", "Not in a workstream"]);
  });

  it("takes an explicit --since as given, even when nothing changed after it", () => {
    canal();
    const r = buildReport(fx.load(), { since: "v1.1.0", cache: false });
    expect(r.period).toMatchObject({ tag: "v1.1.0", explicit: true, label: "since v1.1.0" });
    expect(r.sections[0]!.period).toEqual([]);
    expect(renderReport(r)).toContain("Nothing delivered yet this period.");
    expect(buildReport(fx.load(), { since: "2026-09-02", cache: false }).period.label).toBe("since 2 Sep 2026");
    expect(buildReport(fx.load(), { since: "3d", cache: false }).period.label).toBe("last 3 days");
    expect(() => buildReport(fx.load(), { since: "someday", cache: false })).toThrow(/"someday" is not a tag, a date/);
  });

  it("--until reports as of then", () => {
    canal();
    const r = buildReport(fx.load(), { until: "2026-09-03", since: "v1.0.0", cache: false });
    expect(r.sections[0]!.now).toMatchObject({ done: 3, todo: 5, parked: 0 });
  });

  it("counts work items when nothing is sized, and says so", () => {
    fx = fixture({ commit: false });
    write(fx.repo, "locks/README.md", "---\nbrindley: 1\n---\n# Locks\n");
    write(fx.repo, "locks/1-gates.md", item("Gates", "status: done"));
    write(fx.repo, "locks/2-paddles.md", item("Paddles", "status: draft"));
    commit(0, "plan");
    const r = buildReport(fx.load(), { cache: false });
    expect(r.sections[0]).toMatchObject({ unit: "count", now: { done: 1, todo: 1, scope: 2 } });
    expect(r.period.label).toBe("last 4 weeks");
    expect(renderReport(r)).toContain("Every work item counts as one: nothing here is sized yet.");
  });

  it("sizes by a word dimension through points, and validate checks the report block", () => {
    canal("report:\n  size: complexity\n  points: { low: 1, medium: 3, colossal: 13 }\n  colour: blue\n  workstreams: themes\n  labels: { work_item: job, sprocket: x }\n");
    write(fx.repo, `${L}/01-gate-repairs.md`, item("Gate repairs", "status: done\ncomplexity: medium"));
    commit(5, "size by complexity");
    const r = buildReport(fx.load(), { cache: false });
    expect(r.sections[0]!.items.find((i) => i.number === 1)!.size).toBe(3);
    expect(r.labels.work_item).toBe("job");
    const msgs = validate(fx.load()).filter((f) => f.rule === "report-setting").map((f) => f.message);
    expect(msgs).toEqual([
      'Unknown `report` setting "colour" (known: size, points, labels, workstreams).',
      '`report.points` gives points for "colossal", which is not a value of complexity (low, medium, high).',
      '`report.labels` has "sprocket", which the report doesn\'t use (it uses: work_item, work_items, area, areas, not_started, in_progress, complete, draft, designed, in-progress, done, deferred, abandoned, superseded).',
      "`report.workstreams: themes` must be tags or collections.",
      '`report.points` has no points for "high": work sized that way counts as unsized.',
    ]);
    fx.cleanup();
    canal("report: { size: heft }\n");
    expect(parseReport(fx.load().collections[0]!).problems[0]).toMatch(/^`report.size: heft` is not a scoring dimension of this collection/);
  });

  it("counts work in progress on other branches now, and lets the caller choose which", () => {
    canal();
    git(fx.repo, "checkout", "-q", "-b", "feature/sensors");
    write(fx.repo, `${L}/03-water-level-sensors.md`, item("Water level sensors", "status: in-progress\nbranch: feature/sensors"));
    commit(5, "start sensors");
    git(fx.repo, "checkout", "-q", "main");
    const all = buildReport(fx.load(), { cache: false });
    expect(all.sections[0]!.now).toMatchObject({ doing: 3, todo: 0 });
    expect(all.sections[0]!.inProgressElsewhere.map((i) => i.number)).toEqual([3]);
    expect(all.lookedIn).toEqual(["feature/sensors"]);
    expect(all.sections[0]!.attention[0]!.why).toBe("in progress on feature/sensors");
    expect(renderReport(all)).toContain("counts work in progress on feature/sensors");
    expect(buildReport(fx.load(), { cache: false, branches: false }).sections[0]!.now.doing).toBe(0);
    expect(buildReport(fx.load(), { cache: false, branches: ["!feature/*"] }).sections[0]!.now.doing).toBe(0);
    expect(buildReport(fx.load(), { cache: false, branches: ["feature/*"] }).sections[0]!.now.doing).toBe(3);
  });

  it("writes the same file every time, cached or not, and caches the replay", () => {
    canal();
    const root = fx.load();
    const a = readFileSync(writeReport(root).file, "utf8");
    expect(existsSync(join(fx.repo, "build/.brindley-report-cache.json"))).toBe(true);
    const b = readFileSync(writeReport(fx.load()).file, "utf8");
    const c = readFileSync(writeReport(fx.load(), { cache: false, out: "build/other.html" }).file, "utf8");
    expect(b).toBe(a);
    expect(c).toBe(a);
    // A new commit is replayed on top of the cache.
    write(fx.repo, `${L}/03-water-level-sensors.md`, item("Water level sensors", "status: done\nsize: 2\ndocs_impact: 'none: fixture'"));
    commit(6, "deliver sensors");
    const fresh = buildReport(fx.load(), { cache: false });
    const cached = buildReport(fx.load());
    expect(cached.sections[0]!.series).toEqual(fresh.sections[0]!.series);
    expect(cached.sections[0]!.now.done).toBe(5);
    rmSync(join(fx.repo, "build"), { recursive: true });
  });

  it("is one script-free page with the key as switches, a light/dark switch and the palette", () => {
    canal();
    const html = renderReport(buildReport(fx.load(), { cache: false, mode: "dark", palette: "forest" }));
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/(src|href)="https?:\/\/(?!github)/);
    expect(html).toContain('id="show-done" checked');
    expect(html).toContain('id="show-estimated" checked'); // something is estimated
    expect(html).toContain('id="mode-dark" checked');
    expect(html).toContain("--complete:#2a7e3b");
    expect(html).toContain(":root:has(#mode-dark:checked){color-scheme:dark");
    expect(html).toContain("since v1.0.0");
    expect(html).toContain("nothing has changed since v1.1.0");
  });

  it("palettes: built-in names, JSON files checked, CSS files whose dark blocks follow the switch", () => {
    fx = fixture({ commit: false });
    write(fx.repo, "brand.json", JSON.stringify({ light: { not_started: "#aaa", in_progress: "#555", complete: "#000" } }));
    write(fx.repo, "bad.json", JSON.stringify({ light: { not_started: "#aaa", in_progress: "pink", complete: "#000" } }));
    write(fx.repo, "brand.css", "@media (prefers-color-scheme: dark) { :root { --complete: #fff; } }");
    const p = (f: string) => join(fx.repo, f);
    expect(paletteCss("brand.json", p)).toContain(":root{--not-started:#aaa;--in-progress:#555;--complete:#000}");
    expect(() => paletteCss("bad.json", p)).toThrow('bad.json: light.in_progress must be a hex colour like "#1c5cab" (got "pink").');
    expect(() => paletteCss("neon")).toThrow(/Unknown palette "neon": use one of sea, plum, forest, fire, teal, slate/);
    expect(darkAware(paletteCss("brand.css", p))).toContain(":root:has(#mode-dark:checked) { --complete: #fff; }");
  });

  it("with several collections, a combined headline in work items unless every one is sized, then a section each", () => {
    canal();
    write(fx.repo, "towpath/README.md", "---\nbrindley: 1\ntitle: Towpath\n---\n# Towpath\n");
    write(fx.repo, "towpath/1-hedges.md", item("Hedges", "status: done"));
    commit(5, "towpath");
    const r = buildReport(fx.load(), { cache: false });
    expect(r.sections.map((s) => s.unit)).toEqual(["points", "count"]);
    expect(r.combined).toMatchObject({ unit: "count", now: { done: 2, scope: 3 } });
    expect(r.combined!.workstreams.map((w) => w.label)).toEqual(["Lock gate maintenance", "Towpath"]);
    expect(buildReport(fx.load(), { cache: false, collection: "towpath" }).combined).toBeNull();
  });

  it("the time axis picks its unit from the span", () => {
    const t = Date.UTC(2026, 0, 5, 9);
    expect(timeAxis(t, t + 2 * DAY).unit).toBe("hours");
    expect(timeAxis(t, t + 2 * DAY).labels.map((l) => l.text)).toEqual(["6 Jan", "7 Jan"]);
    expect(timeAxis(t, t + 30 * DAY).unit).toBe("days");
    expect(timeAxis(t, t + 30 * DAY).labels.every((l) => new Date(l.t).getUTCDay() === 1)).toBe(true);
    const weeks = timeAxis(t, t + 200 * DAY);
    expect(weeks.unit).toBe("weeks");
    expect(weeks.labels.map((l) => l.text).slice(0, 3)).toEqual(["Feb 2026", "Mar", "Apr"]);
    expect(timeAxis(t, t + 1000 * DAY).labels[0]!.text).toBe("Q2 2026");
  });

  it("the report tool writes the file and returns the figures", async () => {
    canal();
    const server = createServer({ cwd: fx.repo });
    const client = new Client({ name: "test", version: "0.0.0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    const res = (await client.callTool({ name: "report", arguments: { since: "v1.0.0" } })) as { content: { text: string }[]; isError?: boolean };
    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse(res.content[0]!.text);
    const out = "result" in parsed && "notes" in parsed ? parsed.result : parsed;
    expect(out.file).toMatch(/build\/brindley-report\.html$/);
    expect(out.collections[0]).toMatchObject({ complete: 3, scope: 6, percent_complete: 50, unit: "points", estimated_share: 0.5 });
    expect(out.collections[0].period).toMatchObject({ delivered: ["Gate repairs"], added: ["Water level sensors"], out: ["Paddle replacement"], scope_change: -2 });
  });
});
