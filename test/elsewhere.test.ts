import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fixture, git, write, type Fixture } from "./helpers.js";
import * as ops from "../src/ops.js";
import { resolveRef } from "../src/repo.js";
import { validate } from "../src/validate.js";
import { regenerate } from "../src/readme.js";
import { inProgressElsewhere } from "../src/elsewhere.js";

let fx: Fixture;
const extra: string[] = [];
afterEach(() => {
  for (const p of extra.splice(0)) rmSync(p, { recursive: true, force: true });
  fx?.cleanup();
});
const read = (p: string) => readFileSync(join(fx.repo, p), "utf8");

const designed = (title: string) => `---\nstatus: designed\n---\n# ${title}\n\n## Acceptance criteria\n\n- It works.\n`;
const files = {
  "locks/README.md": "---\nbrindley: 1\n---\n# Locks\n",
  "locks/01-gates.md": designed("Gates"),
  "locks/02-paddles.md": designed("Paddles"),
};

describe("where in-progress work is being built", () => {
  it("records the branch on starting, shows it, and removes it on finishing", () => {
    fx = fixture({ files });
    let root = fx.load();
    const r = ops.setStatus(root, resolveRef(root, "locks#1"), "in-progress");
    expect(r.result.branch).toBe("main");
    expect(read("locks/01-gates.md")).toContain("branch: main");
    regenerate(fx.load());
    expect(read("locks/README.md")).toContain("in-progress<br><sub>on main</sub>");
    root = fx.load();
    ops.setStatus(root, resolveRef(root, "locks#2"), "in-progress", { branch: "feature/paddles" });
    expect(read("locks/02-paddles.md")).toContain("branch: feature/paddles");
    expect(validate(fx.load()).find((f) => f.rule === "branch-missing")?.message).toMatch(/^In progress on branch feature\/paddles, which no longer exists/);
    root = fx.load();
    ops.complete(root, resolveRef(root, "locks#1"), "none: nothing documented");
    expect(read("locks/01-gates.md")).not.toContain("branch:");
    root = fx.load();
    ops.setStatus(root, resolveRef(root, "locks#2"), "designed", { force: true });
    expect(read("locks/02-paddles.md")).not.toContain("branch:");
  });

  it("finds work started in another worktree, even uncommitted, and refuses to start it again", () => {
    fx = fixture({ files });
    const wt = `${fx.repo}-wt`;
    extra.push(wt);
    git(fx.repo, "worktree", "add", "-q", wt, "-b", "feature/gates");
    write(wt, "locks/01-gates.md", "---\nstatus: in-progress\nbranch: feature/gates\n---\n# Gates\n");
    const root = fx.load();
    const c = root.collections[0]!;
    expect(inProgressElsewhere(root, c).get(1)).toEqual([{ branch: "feature/gates", worktree: wt }]);
    const check = ops.preflight(root, resolveRef(root, "locks#1"));
    expect(check.ready).toBe(false);
    expect(check.checks.find((x) => x.check === "Elsewhere")?.detail).toBe(`already being built on feature/gates (worktree ${wt})`);
    expect(() => ops.setStatus(root, resolveRef(root, "locks#1"), "in-progress")).toThrow(/Already being built on feature\/gates/);
    expect(ops.preflight(root, resolveRef(root, "locks#2")).ready).toBe(true); // others are unaffected
  });

  it("finds work started on another branch, whatever its padding or folder there", () => {
    fx = fixture({ files });
    git(fx.repo, "checkout", "-q", "-b", "feature/paddles");
    git(fx.repo, "mv", "locks/02-paddles.md", "locks/2-paddles.md");
    write(fx.repo, "locks/2-paddles.md", "---\nstatus: in-progress\n---\n# Paddles\n");
    git(fx.repo, "commit", "-qam", "start paddles");
    git(fx.repo, "checkout", "-q", "main");
    const root = fx.load();
    expect(inProgressElsewhere(root, root.collections[0]!).get(2)).toEqual([{ branch: "feature/paddles" }]);
  });
});
