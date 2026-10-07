import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fixture, type Fixture } from "./helpers.js";
import * as ops from "../src/ops.js";
import { resolveRef } from "../src/repo.js";
import { validate } from "../src/validate.js";

let fx: Fixture;
afterEach(() => fx?.cleanup());
const read = (p: string) => readFileSync(join(fx.repo, p), "utf8");
const has = (p: string) => existsSync(join(fx.repo, p));
const draft = (title: string, body = "") => `---\nstatus: draft\n---\n# ${title}\n${body}`;

const README = "---\nbrindley: 1\nfolders:\n  done: completed\n  abandoned: closed\n  superseded: closed\n---\n# Locks\n";
const files = (readme = README): Record<string, string> => ({
  "locks/README.md": readme,
  "locks/01-gates.md": draft("Gates", "\nSee [paddles](02-paddles.md).\n"),
  "locks/01-gates/drawing.png": "png",
  "locks/02-paddles.md": draft("Paddles", "\n## Dependencies\n\n- [1](01-gates.md)\n"),
  "canal/README.md": "---\nbrindley: 1\n---\n# Canal\n",
  "canal/01-water.md": draft("Water", "\n## Dependencies\n\n- [gates](../locks/01-gates.md)\n"),
});

describe("status folders", () => {
  it("moves an initiative, its asset folder and its links when its status changes, and back on reopen", () => {
    fx = fixture({ files: files() });
    let root = fx.load();
    const r = ops.setStatus(root, resolveRef(root, "locks#1"), "abandoned", { reason: "Replaced by new gates" });
    expect(r.result.moved?.moves).toEqual([
      { from: "locks/01-gates.md", to: "locks/closed/01-gates.md" },
      { from: "locks/01-gates", to: "locks/closed/01-gates" },
    ]);
    expect(has("locks/closed/01-gates.md") && has("locks/closed/01-gates/drawing.png")).toBe(true);
    expect(read("locks/closed/01-gates.md")).toContain("See [paddles](../02-paddles.md).");
    expect(read("locks/02-paddles.md")).toContain("- [1](closed/01-gates.md)");
    expect(read("canal/01-water.md")).toContain("- [gates](../locks/closed/01-gates.md)");
    root = fx.load();
    ops.setStatus(root, resolveRef(root, "locks#1"), "draft");
    expect(has("locks/01-gates.md") && has("locks/01-gates/drawing.png") && !has("locks/closed/01-gates.md")).toBe(true);
    expect(read("canal/01-water.md")).toContain("- [gates](../locks/01-gates.md)");
    expect(validate(fx.load()).filter((f) => ["broken-link", "status-not-in-folder"].includes(f.rule))).toEqual([]);
  });

  it("moves on complete and on recording a status, and reads its folders as statuses", () => {
    fx = fixture({ files: { ...files(), "locks/03-sluice.md": "# Sluice\n" } });
    let root = fx.load();
    ops.setStatus(root, resolveRef(root, "locks#2"), "in-progress", { force: true });
    root = fx.load();
    ops.complete(root, resolveRef(root, "locks#2"), "none: no docs");
    expect(has("locks/completed/02-paddles.md")).toBe(true);
    root = fx.load();
    ops.update(root, resolveRef(root, "locks#3"), { status: "done" });
    expect(has("locks/completed/03-sluice.md")).toBe(true);
    // A file without a status in a folder named for one status takes it.
    fx.cleanup();
    fx = fixture({ files: { ...files(), "locks/completed/04-weir.md": "# Weir\n" } });
    expect(resolveRef(fx.load(), "locks#4").status).toBe("done");
  });

  it("refuses a move that would overwrite something, before changing anything", () => {
    fx = fixture({ files: { ...files(), "locks/closed/02-paddles.md": "# In the way\n" } });
    const root = fx.load();
    const paddles = root.collections.find((c) => c.name === "locks")!.initiatives.find((i) => i.rel === "locks/02-paddles.md")!;
    const before = read("locks/02-paddles.md");
    expect(() => ops.setStatus(root, paddles, "abandoned", { reason: "x" })).toThrow(/Can't move locks\/02-paddles\.md to locks\/closed\/02-paddles\.md: something is already there/);
    expect(read("locks/02-paddles.md")).toBe(before);
  });

  it("warns both ways when files are out of place, and tidy fixes them", () => {
    fx = fixture({
      files: {
        ...files(),
        "locks/03-sluice.md": "---\nstatus: done\ndocs_impact: 'none: x'\n---\n# Sluice\n",
        "locks/completed/04-weir.md": "---\nstatus: draft\n---\n# Weir\n",
      },
    });
    const msgs = validate(fx.load()).filter((f) => f.rule === "status-not-in-folder").map((f) => `${f.file}: ${f.message}`);
    expect(msgs).toEqual([
      'locks/03-sluice.md: Status done belongs in "locks/completed/", but this file is directly in "locks/". `tidy` moves it.',
      'locks/completed/04-weir.md: Status draft belongs directly in "locks/", but this file is in "locks/completed/". `tidy` moves it.',
    ]);
    const plan = ops.tidy(fx.load(), "locks");
    expect(plan.result.dryRun).toBe(true);
    expect(plan.result.moves.map((m) => `${m.from} → ${m.to}`)).toEqual([
      "locks/03-sluice.md → locks/completed/03-sluice.md",
      "locks/completed/04-weir.md → locks/04-weir.md",
    ]);
    expect(has("locks/03-sluice.md")).toBe(true);
    ops.tidy(fx.load(), "locks", { dry_run: false });
    expect(validate(fx.load()).filter((f) => f.rule === "status-not-in-folder")).toEqual([]);
    expect(ops.tidy(fx.load(), "locks").result.moves).toEqual([]);
    expect(() => ops.tidy(fx.load(), "canal")).toThrow(/doesn't declare `folders:`/);
  });

  it("warns about a folders entry that isn't a status, and never moves files without folders:", () => {
    fx = fixture({ files: files("---\nbrindley: 1\nfolders:\n  finished: completed\n---\n# Locks\n") });
    expect(validate(fx.load()).find((f) => f.rule === "folders-setting")?.message).toMatch(/"finished", which is not a status/);
    fx.cleanup();
    fx = fixture({ files: files("---\nbrindley: 1\n---\n# Locks\n") });
    const root = fx.load();
    ops.setStatus(root, resolveRef(root, "locks#1"), "abandoned", { reason: "x" });
    expect(has("locks/01-gates.md")).toBe(true);
  });
});
