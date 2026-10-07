import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { fixture, type Fixture } from "./helpers.js";
import { regenerate } from "../src/readme.js";
import { validate } from "../src/validate.js";
import { mermaidDirection, parseGraph } from "../src/graph.js";

let fx: Fixture;
afterEach(() => fx?.cleanup());
const read = (p: string) => readFileSync(join(fx.repo, p), "utf8");

const initiative = (title: string, fm: string, body = "") => `---\n${fm}---\n# ${title}\n${body}`;

/**
 * locks#2 depends on locks#1 and is related to locks#4; locks#4 depends on an external library and
 * on canal#1; locks#3 is done and nothing depends on it. Tags: adoption (theme doc with an icon),
 * signage (no theme doc).
 */
const files = (graph = "") => ({
  "locks/README.md": `---\nbrindley: 1\n${graph ? `graph:\n${graph}` : ""}---\n# Locks\n`,
  "locks/adoption.md": "---\ntheme: adoption\nicon: 🧭\n---\n# Adoption\n",
  "locks/1-gates.md": initiative("Gates", "status: draft\ntags: [adoption]\n"),
  "locks/2-paddles.md": initiative(
    "Paddles",
    "status: draft\ntags: [adoption, signage]\n",
    "\n## Dependencies\n\n- [1](1-gates.md)\n\n## Related\n\n- [4](4-sensors.md)\n",
  ),
  "locks/3-signs.md": initiative("Signs", "status: done\ndocs_impact: 'none: fixture'\ntags: [signage]\n"),
  "locks/4-sensors.md": initiative(
    "Sensors",
    "status: draft\n",
    "\n## Dependencies\n\n- [geo lib](https://example.com/geo)\n- [water](../canal/1-water.md)\n",
  ),
  "canal/README.md": "---\nbrindley: 1\n---\n# Canal\n",
  "canal/1-water.md": initiative("Water levels", "status: draft\n"),
});

/** The README's Mermaid block for the locks collection, regenerated. */
function graph(settings = ""): string {
  fx = fixture({ files: files(settings) });
  regenerate(fx.load());
  const readme = read("locks/README.md");
  const m = /```mermaid\n([\s\S]*?)```(\n\nThemes: .*)?/.exec(readme);
  return m ? m[0] : "";
}

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
  return out && typeof out === "object" && "result" in out && "notes" in out ? out.result : out;
}

describe("graph settings", () => {
  it("defaults: do-first work on the left, arrows pointing at what each initiative needs", () => {
    const g = graph();
    expect(g).toContain("flowchart RL");
    expect(g).toContain("n2 --> n1");
    expect(g).toContain("n4 --> x1");
    expect(g).toContain("n4 --> c_canal_1");
    expect(g).not.toContain("-.->"); // related links are opt-in
    expect(g).not.toContain("n3["); // done, and nothing depends on it
    expect(g).not.toContain("subgraph");
  });

  it("derives Mermaid's direction from the work direction and the arrows", () => {
    const cases: [string, "from" | "to", string][] = [
      ["left-to-right", "from", "RL"],
      ["right-to-left", "from", "LR"],
      ["top-to-bottom", "from", "BT"],
      ["bottom-to-top", "from", "TB"],
      ["left-to-right", "to", "LR"],
      ["right-to-left", "to", "RL"],
      ["top-to-bottom", "to", "TB"],
      ["bottom-to-top", "to", "BT"],
    ];
    for (const [direction, arrows, code] of cases) {
      const s = parseGraph({ direction, arrows }).settings;
      expect(mermaidDirection(s), `${direction} / ${arrows}`).toBe(code);
    }
    expect(parseGraph({ direction: "TB" }).settings.direction).toBe("top-to-bottom");
  });

  it("arrows: to points edges at the initiative holding the link, for every kind of edge", () => {
    const g = graph("  arrows: to\n  related: true\n");
    expect(g).toContain("flowchart LR");
    expect(g).toContain("n1 --> n2");
    expect(g).toContain("x1 --> n4");
    expect(g).toContain("n4 -.-> n2");
  });

  it("related: true draws ## Related links dotted, from the initiative listing them", () => {
    expect(graph("  related: true\n")).toContain("n2 -.-> n4");
  });

  it("show adds initiatives in the listed statuses", () => {
    expect(graph("  show: [done]\n")).toContain('n3["✅ <s>3 Signs</s>"]');
    expect(graph("  show: [completed]\n")).toContain('n3["✅ <s>3 Signs</s>"]'); // aliases accepted
  });

  it("external: false leaves out external and other collections' nodes, and their edges", () => {
    const g = graph("  external: false\n");
    expect(g).not.toMatch(/x1|c_canal_1|example\.com/);
    expect(g).toContain("n4[");
  });

  it("enabled: false leaves the graph out, keeping the tables", () => {
    fx = fixture({ files: files("  enabled: false\n") });
    regenerate(fx.load());
    const readme = read("locks/README.md");
    expect(readme).not.toContain("```mermaid");
    expect(readme).toContain("| 1 | [Gates](1-gates.md)");
  });

  it("themes: label puts theme names after the title", () => {
    const g = graph("  themes: label\n");
    expect(g).toContain('n2["✏️ 2 Paddles · adoption, signage"]');
    expect(graph("  themes: true\n")).toContain("· adoption, signage");
  });

  it("themes: icon puts each theme's icon before the title, [name] without one, with a legend", () => {
    const g = graph("  themes: icon\n");
    expect(g).toContain('n2["✏️ 🧭[signage] 2 Paddles"]');
    expect(g).toContain('n4["✏️ 4 Sensors"]'); // untagged
    expect(g).toMatch(/```\n\nThemes: 🧭 adoption$/);
  });

  it("themes: [box, icon] boxes each node by its first theme and marks all of them", () => {
    const g = graph("  themes: [box, icon]\n");
    expect(g).toContain('subgraph t_adoption["adoption"]\n    n1["✏️ 🧭 1 Gates"]\n    n2["✏️ 🧭[signage] 2 Paddles"]\n  end');
    expect(g).not.toContain("subgraph t_signage"); // Paddles' first theme is adoption
    expect(g.indexOf('n4["')).toBeLessThan(g.indexOf("subgraph")); // untagged stays outside
  });

  it("is deterministic", () => {
    fx = fixture({ files: files("  themes: [box, icon]\n  related: true\n  show: [done]\n") });
    regenerate(fx.load());
    expect(regenerate(fx.load())).toEqual([]);
  });

  it("warns about unknown or unusable settings", () => {
    fx = fixture({
      files: files("  colour: blue\n  show: [finished]\n  direction: sideways\n  arrows: both\n  themes: [icon, label, sparkle]\n  related: 'yes'\n"),
    });
    const msgs = validate(fx.load())
      .filter((f) => f.rule === "graph-setting")
      .map((f) => f.message);
    expect(msgs).toEqual([
      'Unknown `graph` setting "colour" (known: enabled, direction, arrows, related, show, external, themes).',
      "`graph.related` must be true or false.",
      "`graph.direction: sideways` is not one of left-to-right, right-to-left, top-to-bottom, bottom-to-top.",
      "`graph.arrows: both` must be from or to.",
      '`graph.show` lists "finished", which is not a status (draft, designed, in-progress, deferred, done, abandoned, superseded) or alias.',
      '`graph.themes` value "sparkle" is not box, icon, label or true.',
      "`graph.themes` has both icon and label, which say the same thing; label is used.",
    ]);
  });

  it("the graph tool uses the collection's settings, with per-call overrides; a tag graph uses the defaults", async () => {
    fx = fixture({ files: files("  related: true\n  arrows: to\n") });
    const client = await connect(fx.repo);
    const own = json(await client.callTool({ name: "graph", arguments: { collection: "locks" } }));
    expect(own.mermaid).toContain("n4 -.-> n2");
    expect(own.mermaid).toContain("flowchart LR");
    const over = json(await client.callTool({ name: "graph", arguments: { collection: "locks", arrows: "from", related: false, direction: "top-to-bottom" } }));
    expect(over.mermaid).toContain("flowchart BT");
    expect(over.mermaid).toContain("n2 --> n1");
    expect(over.mermaid).not.toContain("-.->");
    const tag = json(await client.callTool({ name: "graph", arguments: { tag: "adoption" } }));
    expect(tag.mermaid).toContain("flowchart RL"); // defaults, not locks' settings
  });
});
