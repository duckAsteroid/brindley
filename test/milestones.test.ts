import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { fixture, write, type Fixture } from "./helpers.js";
import { resolveRef } from "../src/repo.js";
import { progress } from "../src/milestones.js";
import { validate } from "../src/validate.js";
import { mermaid, regenerate } from "../src/readme.js";
import { parseGraph } from "../src/graph.js";
import { buildReport } from "../src/report.js";
import { renderReport } from "../src/report-html.js";
import { createServer } from "../src/server.js";
import * as ops from "../src/ops.js";

let fx: Fixture;
afterEach(() => fx?.cleanup());

const L = "lock-gate-maintenance";
const T = "towpath";
const item = (title: string, fm: string) => `---\n${fm}\n---\n# ${title}\n`;
const readme = (title: string, extra = "") => `---\nbrindley: 1\ntitle: ${title}\n${extra}---\n# ${title}\n`;
const milestone = (slug: string, title: string, members: string[], fm = "") =>
  `---\nmilestone: ${slug}\n${fm}---\n# ${title}\n\nWhat delivering this means.\n\n## Delivered by\n\n${members.map((m) => `- ${m}`).join("\n")}\n`;

/**
 * Two collections. Gate work is the `gates` theme; "Reopening" needs the gates theme and towpath#1;
 * "Season" includes Reopening, towpath#2 and an external release.
 */
const files = (): Record<string, string> => ({
  [`${L}/README.md`]: readme("Lock gate maintenance"),
  [`${L}/01-gate-repairs.md`]: item("Gate repairs", "status: done\ntags: [gates]\ndocs_impact: 'none: fixture'"),
  [`${L}/02-paddle-replacement.md`]: item("Paddle replacement", "status: designed\ntags: [gates]"),
  [`${L}/03-heritage-paint.md`]: item("Heritage paint", "status: deferred\ntags: [gates]"),
  [`${L}/gates.md`]: `---\ntheme: gates\nsummary: The lock gates themselves\n---\n# Gates\n`,
  [`${T}/README.md`]: readme("Towpath"),
  [`${T}/01-resurface-towpath.md`]: item("Resurface towpath", "status: done\ndocs_impact: 'none: fixture'"),
  [`${T}/02-signage.md`]: item("Signage", "status: draft"),
  [`${L}/reopening.md`]: milestone("reopening", "Lock reopens to boats", ["[Gates](gates.md)", `[Resurface towpath](../${T}/01-resurface-towpath.md)`], "icon: 🚤\n"),
  [`${L}/season.md`]: milestone("season", "Ready for the season", [
    "[Reopening](reopening.md)",
    `[Signage](../${T}/02-signage.md)`,
    "[Release](https://github.com/example/canal/releases/tag/v2.0)",
  ]),
});

describe("milestones", () => {
  it("loads milestone docs and resolves their members", () => {
    fx = fixture({ files: files() });
    const root = fx.load();
    expect(root.milestones.map((m) => m.slug).sort()).toEqual(["reopening", "season"]);
    const season = root.milestones.find((m) => m.slug === "season")!;
    expect(season.members.map((m) => m.kind)).toEqual(["milestone", "initiative", "external"]);
    const reopening = root.milestones.find((m) => m.slug === "reopening")!;
    expect(reopening.icon).toBe("🚤");
    expect(reopening.members).toMatchObject([{ kind: "theme", tag: "gates" }, { kind: "initiative", key: `${T}#1` }]);
  });

  it("is reached when every counted member is done, leaving out deferred work", () => {
    fx = fixture({ files: files() });
    const root = fx.load();
    const reopening = progress(root, root.milestones.find((m) => m.slug === "reopening")!);
    expect(reopening).toMatchObject({ state: "unreached", done: 2, counted: 3, outstanding: [`${L}#2`], ignored: 1 });
    write(fx.repo, `${L}/02-paddle-replacement.md`, item("Paddle replacement", "status: superseded\nsuperseded_by: 1\ntags: [gates]"));
    const after = fx.load();
    expect(progress(after, after.milestones.find((m) => m.slug === "reopening")!).state).toBe("reached");
  });

  it("nests: an including milestone waits on the one it includes, and counts its work", () => {
    fx = fixture({ files: files() });
    const root = fx.load();
    const season = progress(root, root.milestones.find((m) => m.slug === "season")!);
    expect(season).toMatchObject({ state: "unreached", done: 2, counted: 4, milestonesOutstanding: ["reopening"], external: ["https://github.com/example/canal/releases/tag/v2.0"] });
    expect(season.outstanding).toEqual([`${L}#2`, `${T}#2`]);
    expect(season.members.find((m) => m.key === `${L}#1`)!.via).toEqual([{ kind: "milestone", slug: "reopening" }]);
  });

  it("is unspecified with no counted members, and listed initiatives that don't exist block", () => {
    fx = fixture({
      files: {
        ...files(),
        [`${L}/parked.md`]: milestone("parked", "Heritage look", ["[Heritage paint](03-heritage-paint.md)"]),
        [`${L}/empty.md`]: `---\nmilestone: empty\n---\n# Not yet defined\n`,
        [`${L}/ghost.md`]: milestone("ghost", "Ghost", ["[Gate repairs](01-gate-repairs.md)", `[Nothing](../${T}/09-nothing.md)`]),
      },
    });
    const root = fx.load();
    const p = (slug: string) => progress(root, root.milestones.find((m) => m.slug === slug)!);
    expect(p("parked").state).toBe("unspecified");
    expect(p("empty").state).toBe("unspecified");
    // A link to a file that doesn't exist is not an initiative: validate reports it, and it counts for nothing.
    expect(p("ghost").state).toBe("reached");
    const findings = validate(root).filter((f) => f.rule.startsWith("milestone"));
    expect(findings.map((f) => [f.rule, f.file])).toEqual(
      expect.arrayContaining([
        ["milestone-empty", `${L}/empty.md`],
        ["milestone-member", `${L}/ghost.md`],
      ]),
    );
    expect(findings.find((f) => f.rule === "milestone-member")!.line).toBe(11);
  });

  it("validates duplicates, cycles and docs that are both theme and milestone", () => {
    fx = fixture({
      files: {
        ...files(),
        [`${L}/reopening.md`]: milestone("reopening", "Lock reopens to boats", ["[Gates](gates.md)", "[Season](season.md)"]),
        [`${T}/again.md`]: milestone("season", "Season again", ["[Signage](02-signage.md)"]),
        [`${T}/both.md`]: `---\ntheme: signs\nmilestone: signs\n---\n# Signs\n\n## Delivered by\n\n- [Signage](02-signage.md)\n`,
      },
    });
    const rules = validate(fx.load()).map((f) => f.rule);
    expect(rules).toEqual(expect.arrayContaining(["duplicate-milestone", "milestone-cycle", "milestone-theme"]));
  });

  it("keeps a progress block in the milestone doc and a Milestones section in each collection README", () => {
    fx = fixture({ files: files() });
    regenerate(fx.load());
    const doc = readFileSync(join(fx.repo, L, "season.md"), "utf8");
    expect(doc).toContain("## Delivered by");
    expect(doc).toContain("### Delivery");
    expect(doc).toContain("**Not reached** — 2 of 4 done; still to do: `lock-gate-maintenance#2`, `towpath#2`; waiting on [Lock reopens to boats](reopening.md).");
    expect(doc).toContain("1 external member not confirmed (check by hand): [github.com/…/v2.0](https://github.com/example/canal/releases/tag/v2.0).");
    expect(doc).toMatch(/\| `towpath#1` \| \[Resurface towpath\]\(\.\.\/towpath\/01-resurface-towpath\.md\) \| done \| done \| milestone `reopening` \|/);
    expect(doc).toMatch(/\| `lock-gate-maintenance#3` \| .* \| deferred \| left out \| milestone `reopening` \|/);
    const towpath = readFileSync(join(fx.repo, T, "README.md"), "utf8");
    expect(towpath).toContain("### Milestones");
    expect(towpath).toContain("- [**Lock reopens to boats**](../lock-gate-maintenance/reopening.md) · 2 of 3 done");
    expect(towpath).toContain("- [**Ready for the season**](../lock-gate-maintenance/season.md) · 2 of 4 done (1 external member not confirmed)");
    // Deterministic: a second pass writes nothing.
    expect(regenerate(fx.load())).toEqual([]);
  });

  it("reports a milestone reached by the change that reaches it, and un-reached by one that reopens it", () => {
    fx = fixture({ files: files() });
    let root = fx.load();
    regenerate(root);
    root = fx.load();
    const started = ops.setStatus(root, resolveRef(root, `${L}#2`), "in-progress");
    expect(started.milestones).toBeUndefined();
    root = fx.load();
    const done = ops.complete(root, resolveRef(root, `${L}#2`), "none: fixture");
    expect(done.milestones).toEqual([
      expect.objectContaining({
        milestone: "reopening",
        reached: true,
        message: `By completing ${L}#2 you have reached milestone "Lock reopens to boats" (${L}/reopening.md).`,
      }),
    ]);
    // A new open initiative joining the theme un-reaches it.
    root = fx.load();
    const added = ops.create(root, { collection: L, title: "Balance beams", tags: ["gates"] });
    expect(added.milestones).toEqual([
      expect.objectContaining({
        milestone: "reopening",
        reached: false,
        message: `This change means milestone "Lock reopens to boats" (${L}/reopening.md) is no longer reached (${L}#4 is open).`,
      }),
    ]);
    // Abandoning it reaches it again: abandoned work is left out.
    root = fx.load();
    const dropped = ops.setStatus(root, resolveRef(root, `${L}#4`), "abandoned", { reason: "Beams are sound" });
    expect(dropped.milestones?.map((m) => [m.milestone, m.reached, m.message])).toEqual([
      ["reopening", true, `By marking ${L}#4 abandoned you have reached milestone "Lock reopens to boats" (${L}/reopening.md).`],
    ]);
  });

  it("marks milestone members in the graph when asked", () => {
    fx = fixture({ files: { ...files(), [`${L}/README.md`]: readme("Lock gate maintenance", "graph:\n  milestones: icon\n") } });
    const root = fx.load();
    const c = root.collections.find((x) => x.name === L)!;
    const g = mermaid(root, c.initiatives, L, parseGraph(c.meta.graph).settings)!;
    expect(g).toContain(`n2["🟢 🚤[season] 2 Paddle replacement"]`);
    expect(g).toContain("Milestones: 🚤 reopening");
    expect(validate(root).filter((f) => f.rule === "graph-setting")).toEqual([]);
  });

  describe("over time", () => {
    const DAY = 864e5;
    const at = (day: number) => new Date(Date.UTC(2026, 8, 1) + day * DAY).toISOString();
    const commit = (day: number, message: string) => {
      const env = { ...process.env, GIT_AUTHOR_DATE: at(day), GIT_COMMITTER_DATE: at(day) };
      execFileSync("git", ["add", "-A"], { cwd: fx.repo, env });
      execFileSync("git", ["commit", "-q", "-m", message], { cwd: fx.repo, env });
    };
    const history = () => {
      fx = fixture({ files: files(), commit: false });
      commit(0, "plan");
      write(fx.repo, `${L}/02-paddle-replacement.md`, item("Paddle replacement", "status: done\ntags: [gates]\ndocs_impact: 'none: fixture'"));
      commit(3, "paddles done");
    };

    it("dates when a milestone was reached, in the milestones tool, get and the report", async () => {
      history();
      const server = createServer({ cwd: fx.repo });
      const client = new Client({ name: "test", version: "0.0.0" });
      const [a, b] = InMemoryTransport.createLinkedPair();
      await Promise.all([server.connect(a), client.connect(b)]);
      const call = async (name: string, args: Record<string, unknown> = {}) => {
        const res = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
        if (res.isError) throw new Error(res.content[0]!.text);
        const out = JSON.parse(res.content[0]!.text);
        return out.result !== undefined && out.notes ? out.result : out;
      };
      const all = await call("milestones");
      expect(all.map((m: { milestone: string; state: string; reachedAt: string | null }) => [m.milestone, m.state, m.reachedAt])).toEqual([
        ["reopening", "reached", "2026-09-04T00:00:00Z"],
        ["season", "unreached", null],
      ]);
      const one = await call("milestones", { milestone: "season" });
      expect(one[0].outstanding).toEqual([{ ref: `${T}#2`, title: "Signage", status: "draft" }]);
      expect(one[0].members).toContainEqual({ ref: `${L}#3`, title: "Heritage paint", status: "deferred", counts: "left out", via: ["milestone reopening"] });
      await expect(call("milestones", { milestone: "nope" })).rejects.toThrow(/No milestone "nope"/);
      const got = await call("get", { ref: `${T}#1` });
      expect(got.milestones).toEqual([
        { milestone: "reopening", title: "Lock reopens to boats", doc: `${L}/reopening.md`, via: ["listed"], state: "reached" },
        { milestone: "season", title: "Ready for the season", doc: `${L}/season.md`, via: ["milestone reopening"], state: "unreached" },
      ]);

      const r = buildReport(fx.load(), { cache: false });
      expect(r.milestones).toEqual([
        expect.objectContaining({ slug: "reopening", state: "reached", reachedAt: "2026-09-04T00:00:00Z", icon: "🚤" }),
        expect.objectContaining({ slug: "season", state: "unreached", done: 3, counted: 4, external: 1 }),
      ]);
      const html = renderReport(r);
      expect(html).toContain('class="tick milestone-label"');
      expect(html).toContain("🚤 Lock reopens to boats");
      expect(html).toContain("Ready for the season</strong> <span class=\"why\">— 3 of 4 done</span>");
      // As of before the paddles were done, it wasn't reached.
      expect(buildReport(fx.load(), { cache: false, until: "2026-09-02" }).milestones[0]).toMatchObject({ state: "unreached", done: 2 });
    });
  });
});
