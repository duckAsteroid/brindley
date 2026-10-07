import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fixture, type Fixture } from "./helpers.js";
import { regenerate } from "../src/readme.js";
import { validate } from "../src/validate.js";

let fx: Fixture;
afterEach(() => fx?.cleanup());
const read = (p: string) => readFileSync(join(fx.repo, p), "utf8");

const files = (columns = "") => ({
  "locks/README.md": `---\nbrindley: 1\ndimensions:\n  risk: { values: [high, low], default: low }\n${columns}---\n# Locks\n`,
  "locks/01-gates.md": "---\nstatus: draft\npriority: high\nrisk: high\nowner: locks team\n---\n# Gates\n",
  "locks/02-paddles.md": "---\nstatus: draft\n---\n# Paddles\n",
  "locks/03-sluice.md": "---\nstatus: done\ndocs_impact: 'none: x'\nupdated: 2026-09-01\n---\n# Sluice\n",
});

function readme(columns = ""): string {
  fx = fixture({ files: files(columns) });
  regenerate(fx.load());
  return read("locks/README.md");
}

describe("README columns", () => {
  it("keeps today's columns by default", () => {
    const r = readme();
    expect(r).toContain("| # | Initiative | Type | Status | Ready / blocked by | Open Qs | Owner |\n|---|------------|------|--------|--------------------|---------|-------|");
    expect(r).toContain("| # | Initiative | Type | Updated |\n|---|------------|------|---------|\n| 3 | [Sluice](03-sluice.md) | — | 2026-09-01 |");
  });

  it("reorders and drops columns, and shows dimensions — set, defaulted in italics, or unset", () => {
    const r = readme("columns:\n  active: [number, title, priority, risk, owner]\n");
    expect(r).toContain(
      "| # | Initiative | Priority | Risk | Owner |\n|---|------------|----------|------|-------|\n" +
        "| 1 | [Gates](01-gates.md) | high | high | `locks team` |\n" +
        "| 2 | [Paddles](02-paddles.md) | — | _low_ | — |",
    );
    expect(r).toContain("| # | Initiative | Type | Updated |"); // completed table untouched
  });

  it("warns about unknown tables and columns, leaving them out", () => {
    fx = fixture({ files: files("columns:\n  active: [number, title, colour]\n  archive: [number]\n  completed: number\n") });
    const msgs = validate(fx.load()).filter((f) => f.rule === "readme-columns").map((f) => f.message);
    expect(msgs).toEqual([
      expect.stringMatching(/^Unknown column "colour" in `columns.active`/),
      'Unknown table "archive" under `columns` (tables: active, completed).',
      "`columns.completed` must be a list of columns.",
    ]);
    regenerate(fx.load());
    expect(read("locks/README.md")).toContain("| # | Initiative |\n|---|------------|\n| 1 |");
  });

  it("is deterministic", () => {
    fx = fixture({ files: files("columns:\n  active: [title, risk, tags]\n") });
    regenerate(fx.load());
    expect(regenerate(fx.load())).toEqual([]);
  });
});

describe("Themes section", () => {
  it("lists the collection's tags with their theme doc, description and counts", () => {
    fx = fixture({
      files: {
        "locks/README.md": "---\nbrindley: 1\ntags:\n  safety: Keeping boaters safe at the lock\n---\n# Locks\n",
        "locks/repairs.md": "---\ntheme: repairs\nsummary: Fixing what wears out\n---\n# Repairs\n",
        "locks/safety.md": "---\ntheme: safety\n---\n# Safety\n",
        "locks/01-gates.md": "---\nstatus: draft\ntags: [repairs, safety]\n---\n# Gates\n",
        "locks/02-paddles.md": "---\nstatus: done\ndocs_impact: 'none: x'\ntags: [repairs]\n---\n# Paddles\n",
        "canal/README.md": "---\nbrindley: 1\n---\n# Canal\n",
        "canal/01-water.md": "---\nstatus: draft\n---\n# Water\n",
      },
    });
    regenerate(fx.load());
    expect(read("locks/README.md")).toContain(
      "### Themes\n\n" +
        "- [**repairs**](repairs.md) — Fixing what wears out · 1 open, 1 closed or deferred\n" +
        "- [**safety**](safety.md) — Keeping boaters safe at the lock · 1 open, 0 closed or deferred\n", // the declaration, not the doc's title
    );
    expect(read("canal/README.md")).not.toContain("### Themes"); // nothing tagged
    expect(regenerate(fx.load())).toEqual([]); // deterministic
  });
});
