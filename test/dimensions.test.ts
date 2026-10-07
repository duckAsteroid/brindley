import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { fixture, type Fixture } from "./helpers.js";
import * as ops from "../src/ops.js";
import { resolveRef } from "../src/repo.js";
import { validate } from "../src/validate.js";
import { dimensionReport, dimensionsOf, filterByDimensions, orderByDimensions } from "../src/dimensions.js";

let fx: Fixture;
afterEach(() => fx?.cleanup());
const read = (p: string) => readFileSync(join(fx.repo, p), "utf8");

const initiative = (title: string, fm = "") => `---\nstatus: draft\n${fm}---\n# ${title}\n`;

/** Two collections: `locks` uses the defaults; `gates` overrides priority and adds its own dimensions. */
const files = (gatesDimensions = "") => ({
  "locks/README.md": "---\nbrindley: 1\n---\n# Locks\n",
  "locks/1-paddle-sensors.md": initiative("Paddle sensors", "priority: high\ncomplexity: low\n"),
  "locks/2-lock-keeper-rota.md": initiative("Lock keeper rota", "priority: critical\n"),
  "locks/3-towpath-signs.md": initiative("Towpath signs"),
  "locks/4-night-passages.md": initiative("Night passages", "priority: high\ncomplexity: high\n"),
  "gates/README.md": `---\nbrindley: 1\ndimensions:\n  priority: { values: [now, soon, later], default: soon }\n  job_size: { values: [1, 2, 3, 5, 8] }\n  risk: { values: [high, low], required: true }\n${gatesDimensions}---\n# Gates\n`,
  "gates/1-leak-survey.md": initiative("Leak survey", "priority: now\njob_size: 3\nrisk: low\n"),
  "gates/2-hinge-grease.md": initiative("Hinge grease", "risk: high\n"),
});

async function connect(cwd: string) {
  const server = createServer({ cwd });
  const client = new Client({ name: "test", version: "0.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

function json(res: unknown): any {
  const r = res as { content: { text: string }[]; isError?: boolean };
  if (r.isError) throw new Error(r.content[0]!.text);
  const out = JSON.parse(r.content[0]!.text);
  return out && typeof out === "object" && "result" in out && "notes" in out ? out.result : out; // notes ride along when READMEs were regenerated
}

describe("scoring dimensions", () => {
  it("uses the defaults, and lets a collection replace and add to them", () => {
    fx = fixture({ files: files() });
    const root = fx.load();
    const locks = dimensionsOf(root.collections.find((c) => c.name === "locks"));
    expect(locks.map((d) => [d.name, d.values])).toEqual([
      ["priority", ["critical", "high", "medium", "low"]],
      ["impact", ["high", "medium", "low"]],
      ["complexity", ["low", "medium", "high"]],
    ]);
    const gates = dimensionsOf(root.collections.find((c) => c.name === "gates"));
    expect(gates.map((d) => d.name)).toEqual(["impact", "complexity", "priority", "job_size", "risk"]);
    expect(gates.find((d) => d.name === "priority")).toMatchObject({ values: ["now", "soon", "later"], default: "soon", builtIn: false });
    expect(gates.find((d) => d.name === "risk")?.required).toBe(true);
  });

  it("reports each dimension's value, and whether it was set or defaulted", () => {
    fx = fixture({ files: files() });
    const root = fx.load();
    expect(dimensionReport(root, resolveRef(root, "locks#1"))).toEqual({
      priority: { value: "high", source: "set" },
      impact: { value: null, source: null },
      complexity: { value: "low", source: "set" },
    });
    expect(dimensionReport(root, resolveRef(root, "gates#2")).priority).toEqual({ value: "soon", source: "default" });
    expect(dimensionReport(root, resolveRef(root, "gates#1")).job_size).toEqual({ value: 3, source: "set" });
  });

  it("validates values and declarations", () => {
    fx = fixture({
      files: {
        ...files("  bad_default: { values: [a, b], default: c }\n  empty: { values: [] }\n  twice: [x, x]\n  status: [a]\n"),
        "locks/5-flood-gates.md": initiative("Flood gates", "priority: urgent\n"),
        "gates/3-new-chains.md": initiative("New chains", "job_size: 4\n"),
      },
    });
    const findings = validate(fx.load()).map((f) => `${f.level} ${f.rule} ${f.file}: ${f.message}`);
    expect(findings).toContain("error dimension-value locks/5-flood-gates.md: `priority: urgent` is not one of critical, high, medium, low.");
    expect(findings).toContain("error dimension-value gates/3-new-chains.md: `job_size: 4` is not one of 1, 2, 3, 5, 8.");
    expect(findings).toContain("warning dimension-missing gates/3-new-chains.md: `risk` is required in this collection (one of high, low).");
    const declarations = findings.filter((f) => f.includes("dimension-declaration"));
    expect(declarations).toEqual([
      'error dimension-declaration gates/README.md: Dimension "bad_default" has `default: c`, which is not one of its values.',
      'error dimension-declaration gates/README.md: Dimension "empty" has no `values`.',
      'error dimension-declaration gates/README.md: Dimension "twice" lists "x" more than once.',
      'error dimension-declaration gates/README.md: "status" is a front-matter field with its own meaning; name the dimension something else.',
    ]);
    // A required dimension with a value, and optional ones left unset, are fine.
    expect(findings.filter((f) => f.includes("gates/1-leak-survey.md") || f.includes("locks/3-towpath-signs.md"))).toEqual([]);
  });

  it("update sets, checks and clears dimension values", () => {
    fx = fixture({ files: files() });
    let root = fx.load();
    ops.update(root, resolveRef(root, "gates#2"), { dimensions: { priority: "later", job_size: "5" } });
    expect(read("gates/2-hinge-grease.md")).toMatch(/priority: later\njob_size: 5\n/); // number stays a number
    root = fx.load();
    expect(() => ops.update(root, resolveRef(root, "gates#2"), { dimensions: { priority: "high" } })).toThrow(/not one of now, soon, later/);
    expect(() => ops.update(root, resolveRef(root, "gates#2"), { dimensions: { effort: "low" } })).toThrow(/not a dimension in gates/);
    ops.update(root, resolveRef(root, "gates#2"), { dimensions: { job_size: null } });
    expect(read("gates/2-hinge-grease.md")).not.toContain("job_size");
    expect(validate(fx.load()).filter((f) => f.rule.startsWith("dimension") && f.file.startsWith("gates/2"))).toEqual([]);
  });

  it("filters by permitted values, counting a default", () => {
    fx = fixture({ files: files() });
    const root = fx.load();
    const all = root.collections.flatMap((c) => c.initiatives);
    const keys = (xs: typeof all) => xs.map((i) => `${i.collection}#${i.number}`);
    expect(keys(filterByDimensions(root, all, { priority: ["critical", "high"] }))).toEqual(["locks#1", "locks#2", "locks#4"]);
    expect(keys(filterByDimensions(root, all, { priority: ["soon"] }))).toEqual(["gates#2"]); // by default
    expect(keys(filterByDimensions(root, all, { priority: ["high"], complexity: ["low"] }))).toEqual(["locks#1"]);
    expect(keys(filterByDimensions(root, all, { job_size: [3] }))).toEqual(["gates#1"]);
    expect(() => filterByDimensions(root, all, { effort: ["low"] })).toThrow(/Unknown dimension "effort"/);
  });

  it("orders by declared rank, later dimensions breaking ties, unset last", () => {
    fx = fixture({ files: files() });
    const root = fx.load();
    const locks = root.collections.find((c) => c.name === "locks")!.initiatives;
    const keys = (xs: typeof locks) => xs.map((i) => i.number);
    expect(keys(orderByDimensions(root, locks, ["priority"]))).toEqual([2, 1, 4, 3]);
    expect(keys(orderByDimensions(root, locks, ["priority", "complexity"]))).toEqual([2, 1, 4, 3]);
    expect(keys(orderByDimensions(root, [...locks].reverse(), ["complexity", "priority"]))).toEqual([1, 4, 2, 3]);
    // Each initiative ranks by its own collection's declaration; a default counts as set.
    const gates = root.collections.find((c) => c.name === "gates")!.initiatives;
    expect(keys(orderByDimensions(root, gates, ["priority"]))).toEqual([1, 2]);
  });

  it("is exposed through the list, get and update tools", async () => {
    fx = fixture({ files: files() });
    const client = await connect(fx.repo);
    const list = json(await client.callTool({ name: "list", arguments: { collection: "locks", where: { priority: ["critical", "high"] }, order_by: ["priority", "complexity"] } }));
    expect(list.map((i: any) => i.ref)).toEqual(["locks#2", "locks#1", "locks#4"]);
    expect(list[1].dimensions.priority).toEqual({ value: "high", source: "set" });
    json(await client.callTool({ name: "update", arguments: { ref: "locks#3", dimensions: { impact: "high" } } }));
    const got = json(await client.callTool({ name: "get", arguments: { ref: "locks#3" } }));
    expect(got.dimensions.impact).toEqual({ value: "high", source: "set" });
    const bad = await client.callTool({ name: "update", arguments: { ref: "locks#3", dimensions: { impact: "huge" } } });
    expect((bad as { isError?: boolean }).isError).toBe(true);
  });
});
