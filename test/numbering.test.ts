import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fixture, type Fixture } from "./helpers.js";
import * as ops from "../src/ops.js";
import { validate } from "../src/validate.js";
import { collectionWidth, fitsWidth } from "../src/numbering.js";

let fx: Fixture;
afterEach(() => fx?.cleanup());
const read = (p: string) => readFileSync(join(fx.repo, p), "utf8");
const draft = (title: string, body = "") => `---\nstatus: draft\n---\n# ${title}\n${body}`;
const width = (...names: string[]) => collectionWidth({ initiatives: names.map((n) => ({ rel: `c/${n}` })) as never });

describe("padding width", () => {
  it("is the width most files fit, the wider on a tie, 2 when empty", () => {
    expect(width()).toBe(2);
    expect(width("1-a.md", "2-b.md", "13-c.md")).toBe(1); // unpadded
    expect(width("01-a.md", "02-b.md", "13-c.md")).toBe(2);
    expect(width("12-a.md", "13-b.md")).toBe(2); // fits 1 and 2: the wider
    expect(width("001-a.md", "002-b.md", "3-c.md")).toBe(3);
    expect(width("1-a.md", "02-b.md")).toBe(2); // a tie
    expect(fitsWidth("100", 2)).toBe(true); // too big for the width is not a mismatch
    expect(fitsWidth("1", 2)).toBe(false);
    expect(fitsWidth("012", 2)).toBe(false);
  });

  it("create writes new numbers at the collection's width", () => {
    fx = fixture({
      files: {
        "empty/README.md": "---\nbrindley: 1\n---\n# Empty\n",
        "plain/README.md": "---\nbrindley: 1\n---\n# Plain\n",
        "plain/1-a.md": draft("A"),
        "wide/README.md": "---\nbrindley: 1\n---\n# Wide\n",
        "wide/004-d.md": draft("D"),
      },
    });
    expect(ops.create(fx.load(), { collection: "empty", title: "Gates" }).result.path).toBe("empty/01-gates.md");
    expect(ops.create(fx.load(), { collection: "plain", title: "Paddles" }).result.path).toBe("plain/2-paddles.md");
    expect(ops.create(fx.load(), { collection: "wide", title: "Sluice" }).result.path).toBe("wide/005-sluice.md");
  });

  it("warns about files that don't follow the herd, and a width filling up", () => {
    const files: Record<string, string> = { "locks/README.md": "---\nbrindley: 1\n---\n# Locks\n" };
    for (let n = 1; n <= 8; n++) files[`locks/0${n}-item-${n}.md`] = draft(`Item ${n}`);
    files["locks/9-stray.md"] = draft("Stray");
    files["locks/81-late.md"] = draft("Late");
    fx = fixture({ files });
    const found = validate(fx.load());
    expect(found.filter((f) => f.rule === "number-padding").map((f) => f.message)).toEqual([
      "9-stray.md is unpadded; this collection pads to 2 digits (09-). `repad` makes them consistent.",
    ]);
    expect(found.find((f) => f.rule === "number-width")?.message).toBe(
      "The highest number, 81, is 82% of what 2 digits hold. `repad` to 3 digits (001-) before it runs out.",
    );
  });
});

describe("repad", () => {
  /** An unpadded collection whose files, asset folder and links all need to change. */
  const files = () => ({
    "locks/README.md": "---\nbrindley: 1\n---\n# Locks\n",
    "locks/1-gates.md": draft("Gates", "\nSee [paddles](2-paddles.md#design) and the [drawing](1-gates/drawing.png).\n"),
    "locks/1-gates/drawing.png": "png",
    "locks/2-paddles.md": draft("Paddles", "\n## Dependencies\n\n- [1](./1-gates.md)\n"),
    "locks/completed/3-sluice.md": "---\nstatus: done\ndocs_impact: 'none: x'\n---\n# Sluice\n",
    "canal/README.md": "---\nbrindley: 1\n---\n# Canal\n",
    "canal/1-water.md": draft("Water", "\n## Dependencies\n\n- [locks gates](../locks/1-gates.md)\n- [sluice](../locks/completed/3-sluice.md)\n"),
    "docs/guide.md": "# Guide\n\nThe [gates work](../locks/1-gates.md), and in code: `[x](../locks/1-gates.md)`.\n",
  });

  it("plans renames and link rewrites without writing, by default", () => {
    fx = fixture({ files: files() });
    const r = ops.repad(fx.load(), "locks", { width: 2 });
    expect(r.result.dryRun).toBe(true);
    expect(r.result.moves).toEqual([
      { from: "locks/1-gates.md", to: "locks/01-gates.md" },
      { from: "locks/2-paddles.md", to: "locks/02-paddles.md" },
      { from: "locks/completed/3-sluice.md", to: "locks/completed/03-sluice.md" },
      { from: "locks/1-gates", to: "locks/01-gates" },
    ]);
    expect(r.result.rewrites.map((w) => `${w.file}:${w.line} ${w.before} → ${w.after}`)).toEqual([
      "canal/1-water.md:8 ../locks/1-gates.md → ../locks/01-gates.md",
      "canal/1-water.md:9 ../locks/completed/3-sluice.md → ../locks/completed/03-sluice.md",
      "docs/guide.md:3 ../locks/1-gates.md → ../locks/01-gates.md",
      "locks/1-gates.md:6 2-paddles.md#design → 02-paddles.md#design",
      "locks/1-gates.md:6 1-gates/drawing.png → 01-gates/drawing.png",
      "locks/2-paddles.md:8 ./1-gates.md → ./01-gates.md",
    ]);
    expect(existsSync(join(fx.repo, "locks/1-gates.md"))).toBe(true); // nothing written
  });

  it("applies the plan, leaving no padding findings or broken links, and is then a no-op", () => {
    fx = fixture({ files: files() });
    ops.repad(fx.load(), "locks", { width: 2, dry_run: false });
    expect(existsSync(join(fx.repo, "locks/01-gates.md"))).toBe(true);
    expect(existsSync(join(fx.repo, "locks/01-gates/drawing.png"))).toBe(true);
    expect(read("docs/guide.md")).toBe("# Guide\n\nThe [gates work](../locks/01-gates.md), and in code: `[x](../locks/1-gates.md)`.\n");
    const found = validate(fx.load()).filter((f) => ["number-padding", "broken-link"].includes(f.rule));
    expect(found).toEqual([]);
    expect(ops.repad(fx.load(), "locks").result.moves).toEqual([]); // the herd is now 2
  });

  it("shrinks when the numbers fit, refuses a width too small, and warns near the threshold", () => {
    fx = fixture({ files: { "locks/README.md": "---\nbrindley: 1\n---\n# Locks\n", "locks/01-a.md": draft("A"), "locks/08-h.md": draft("H") } });
    const r = ops.repad(fx.load(), "locks", { width: 1 });
    expect(r.result.moves.map((m) => m.to)).toEqual(["locks/1-a.md", "locks/8-h.md"]);
    expect(r.warnings).toEqual(["locks's highest number, 8, is 89% of what 1 digit holds; consider 2 (01-)."]);
    const applied = ops.repad(fx.load(), "locks", { width: 1, dry_run: false });
    expect(applied.warnings).toHaveLength(1); // the real run warns too
    fx.cleanup();
    fx = fixture({ files: { "locks/README.md": "---\nbrindley: 1\n---\n# Locks\n", "locks/100-a.md": draft("A") } });
    expect(() => ops.repad(fx.load(), "locks", { width: 2 })).toThrow(/Width 2 is too small for locks: its highest number is 100\. Use 3 or more\./);
  });
});
