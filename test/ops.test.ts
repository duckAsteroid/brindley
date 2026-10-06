import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { C, fixture, git, lockExample, write, type Fixture } from "./helpers.js";
import * as ops from "../src/ops.js";
import { resolveRef } from "../src/repo.js";
import { isReady } from "../src/deps.js";
import { validate } from "../src/validate.js";
import { regenerate, rootBlock } from "../src/readme.js";

let fx: Fixture;
afterEach(() => fx?.cleanup());

const read = (p: string) => readFileSync(join(fx.repo, p), "utf8");

describe("numbering", () => {
  it("coins the next number in the collection", () => {
    fx = fixture({ files: lockExample });
    const r = ops.create(fx.load(), { collection: "slot-booking", title: "Slot pairing", type: "feature" });
    expect(r.result.number).toBe(24);
    expect(r.result.path).toBe(`${C}/24-slot-pairing.md`);
    expect(read(r.result.path)).toContain("status: draft");
  });

  it("never reuses a number deleted from history", () => {
    fx = fixture({ files: lockExample });
    rmSync(join(fx.repo, C, "23-passage-recorded-event.md"));
    rmSync(join(fx.repo, C, "22-opening-hours-change-impact.md"));
    git(fx.repo, "commit", "-qam", "drop");
    const r = ops.create(fx.load(), { collection: "slot-booking", title: "Next" });
    expect(r.result.number).toBe(24);
  });

  it("sees numbers coined on other branches", () => {
    fx = fixture({ files: lockExample });
    git(fx.repo, "checkout", "-q", "-b", "other");
    write(fx.repo, `${C}/30-on-a-branch.md`, "---\nstatus: draft\n---\n# On a branch\n");
    git(fx.repo, "add", "-A");
    git(fx.repo, "commit", "-qm", "branch");
    git(fx.repo, "checkout", "-q", "main");
    expect(ops.create(fx.load(), { collection: "slot-booking", title: "Next" }).result.number).toBe(31);
  });

  it("starts a new collection at 1 when given a folder path", () => {
    fx = fixture({ files: lockExample });
    const r = ops.create(fx.load(), { collection: "services/search/plans", title: "Query parser" });
    expect(r.result.ref).toBe("plans#1");
    expect(read("services/search/plans/README.md")).toMatch(/^---\nbrindley: 1\nstatus: active\n---/);
  });

  it("refuses an unknown collection name", () => {
    fx = fixture({ files: lockExample });
    expect(() => ops.create(fx.load(), { collection: "nope", title: "X" })).toThrow(/create_collection/);
  });
});

describe("readiness and lifecycle", () => {
  it("is ready when designed with every numbered dependency done", () => {
    fx = fixture({ files: lockExample });
    const root = fx.load();
    expect(isReady(root, resolveRef(root, "slot-booking#21"))).toBe(true);
    expect(isReady(root, resolveRef(root, "slot-booking#22"))).toBe(false);
  });

  it("refuses designed while blocking questions remain", () => {
    fx = fixture({ files: lockExample });
    const root = fx.load();
    expect(() => ops.setStatus(root, resolveRef(root, 22), "designed")).toThrow(/2 blocking open question/);
  });

  it("refuses in-progress when blocked, and done outside complete", () => {
    fx = fixture({ files: lockExample });
    const root = fx.load();
    expect(() => ops.setStatus(root, resolveRef(root, 22), "in-progress")).toThrow(/Only a designed/);
    expect(() => ops.setStatus(root, resolveRef(root, 21), "done")).toThrow(/complete/);
  });

  it("refuses a dependency cycle", () => {
    fx = fixture({ files: lockExample });
    const root = fx.load();
    expect(() => ops.setDependencies(root, resolveRef(root, 23), { add: [22] })).toThrow(/cycle/);
  });
});

describe("questions", () => {
  it("resolves by removing the question and recording the decision", () => {
    fx = fixture({ files: lockExample });
    const root = fx.load();
    const r = ops.resolveQuestion(root, resolveRef(root, 22), { match: "paired" }, "Paired: alternate up and down slots.", {
      record_in: "Agreed direction",
    });
    const text = read(`${C}/22-opening-hours-change-impact.md`);
    expect(text).not.toContain("Should an ascending");
    expect(text).toContain("Validate synchronously.\n- Paired: alternate up and down slots.");
    expect(r.result.recordedIn).toBe("Agreed direction");
  });

  it("can tick instead of removing", () => {
    fx = fixture({ files: lockExample });
    const root = fx.load();
    ops.resolveQuestion(root, resolveRef(root, 22), { index: 1 }, "Timetable update is enough.", { mode: "tick" });
    expect(read(`${C}/22-opening-hours-change-impact.md`)).toContain(
      "- [x] Must captains with a booked slot be re-notified when a lock's opening hours change, or is\n  updating the published timetable enough? — Timetable update is enough.",
    );
  });

  it("adding a blocking question sends a designed initiative back to draft", () => {
    fx = fixture({ files: lockExample });
    const root = fx.load();
    const r = ops.addQuestion(root, resolveRef(root, 21), "Which CSV dialect do the sensors emit?");
    expect(r.result.status).toBe("draft");
    expect(read(`${C}/21-lock-sensor-import.md`)).toMatch(/## Open questions\n\n- Which CSV dialect[^\n]*\n\n## Acceptance criteria/);
  });

  it("steps through blocking questions", () => {
    fx = fixture({ files: lockExample });
    const root = fx.load();
    const first = ops.nextQuestion(resolveRef(root, 22));
    expect(first.question?.index).toBe(1);
    expect(first.remaining).toBe(2);
    expect(ops.nextQuestion(resolveRef(root, 22), 1).question?.index).toBe(2);
    expect(first.implementationQuestions).toHaveLength(1);
  });
});

describe("complete", () => {
  it("requires docs_impact and reports newly ready dependants", () => {
    fx = fixture({ files: lockExample });
    let root = fx.load();
    expect(() => ops.complete(root, resolveRef(root, 23), "none:")).toThrow(/reason/);
    const r = ops.complete(root, resolveRef(root, 23), "none: event contract only, no documented behaviour");
    expect(r.result.becameReady).toEqual([]); // 22 is still draft
    root = fx.load();
    expect(resolveRef(root, 23).status).toBe("done");
  });

  it("refuses doc paths that were not edited", () => {
    fx = fixture({ files: { ...lockExample, "services/locks/docs/LOCKS.md": "# Locks\n" } });
    const root = fx.load();
    expect(() => ops.complete(root, resolveRef(root, 23), ["services/locks/docs/LOCKS.md"])).toThrow(/has not been changed/);
    write(fx.repo, "services/locks/docs/LOCKS.md", "# Locks\n\nPassages are recorded as events.\n");
    const r = ops.complete(fx.load(), resolveRef(fx.load(), 23), ["services/locks/docs/LOCKS.md"]);
    expect(r.result.docFindings).toEqual([]);
  });

  it("flags history phrasing in the docs it lists", () => {
    fx = fixture({ files: { ...lockExample, "services/locks/docs/LOCKS.md": "# Locks\n" } });
    write(fx.repo, "services/locks/docs/LOCKS.md", "# Locks\n\nPassages were previously logged to a file.\n");
    const root = fx.load();
    const r = ops.complete(root, resolveRef(root, 23), ["services/locks/docs/LOCKS.md"]);
    expect(JSON.stringify(r.result.docFindings)).toContain("previously");
  });
});

describe("READMEs", () => {
  it("generates deterministic tables and Mermaid, and leaves text outside the markers alone", () => {
    fx = fixture({ files: lockExample });
    const changes = regenerate(fx.load());
    expect(changes.map((c) => c.reason)).toEqual(["updated"]);
    const readme = read(`${C}/README.md`);
    expect(readme).toContain("Captains book slots to take boats up or down through the lock.");
    expect(readme).toContain("| 21 | [Lock sensor CSV import](21-lock-sensor-import.md) | feature | designed | ✅ ready · ext: `lib:geo-coords` |");
    expect(readme).toContain("```mermaid");
    expect(readme).toContain('n23["23 Passage recorded event"]:::ready');
    expect(readme).toContain("n23 --> n22");
    expect(regenerate(fx.load())).toEqual([]); // second run: no diff
    const overview = rootBlock(fx.load());
    expect(overview).toContain("#### `notifications`");
    expect(overview).toContain("Telling captains about changes to their slots");
    expect(overview).toContain("[slot-booking](docs/initiatives/LOCK-42/slot-booking/README.md)");
  });

  it("replaces a conflicted generated block outright", () => {
    fx = fixture({ files: lockExample });
    regenerate(fx.load());
    const p = join(fx.repo, C, "README.md");
    const text = readFileSync(p, "utf8").replace("### Active", "<<<<<<< HEAD\n### Active\n=======\n### Old\n>>>>>>> other");
    write(fx.repo, `${C}/README.md`, text);
    const changes = regenerate(fx.load(), { onlyConflicted: true });
    expect(changes.map((c) => c.reason)).toEqual(["conflict"]);
    expect(readFileSync(p, "utf8")).not.toContain("<<<<<<<");
  });
});

describe("validate", () => {
  it("reports duplicate numbers, dangling refs and unknown tags", () => {
    fx = fixture({
      files: {
        ...lockExample,
        [`${C}/21-duplicate.md`]: "---\nstatus: draft\ndepends_on: [99]\ntags: [Bad_Tag, unknown]\n---\n# Dup\n",
      },
    });
    const rules = validate(fx.load()).map((f) => f.rule);
    expect(rules).toContain("duplicate-number");
    expect(rules).toContain("dangling-ref");
    expect(rules).toContain("tag-format");
    expect(rules).toContain("tag-unknown");
  });

  it("is clean for the example once READMEs are generated", () => {
    fx = fixture({ files: lockExample });
    regenerate(fx.load());
    expect(validate(fx.load()).filter((f) => f.level === "error")).toEqual([]);
  });
});

describe("collections", () => {
  it("marks a new folder, writing only collection fields", () => {
    fx = fixture({ files: lockExample });
    const args = { title: "Search rework", summary: "Faster search", collection: "x" } as never;
    const r = ops.createCollection(fx.load(), "services/search/plans", args);
    expect(r.result).toMatchObject({ collection: "plans", path: "services/search/plans" });
    expect(r.result.agentSnippet).toBeUndefined(); // not the first collection in the repo
    expect(read("services/search/plans/README.md")).toMatch(
      /^---\nbrindley: 1\ntitle: Search rework\nsummary: Faster search\nstatus: active\n---\n# Search rework/,
    );
    expect(fx.load().collections.map((c) => c.name)).toContain("plans");
  });

  it("adopts an existing folder of initiatives, keeping its README text", () => {
    fx = fixture({
      files: {
        "plans/README.md": "# Plans\n\nOur plans.\n",
        "plans/1-first.md": "---\nstatus: draft\n---\n# First\n",
      },
    });
    expect(fx.load().collections).toEqual([]);
    const r = ops.createCollection(fx.load(), "plans", {});
    expect(r.result.agentSnippet).toContain("## Initiatives");
    expect(read("plans/README.md")).toMatch(/^---\nbrindley: 1\nstatus: active\n---\n# Plans\n\nOur plans\./);
    expect(resolveRef(fx.load(), "plans#1").title).toBe("First");
  });

  it("refuses duplicate collection names", () => {
    fx = fixture({ files: lockExample });
    expect(() => ops.createCollection(fx.load(), "elsewhere/slot-booking", {})).toThrow(/distinct `name`/);
    expect(ops.createCollection(fx.load(), "elsewhere/slot-booking", { name: "slot-booking-2" }).result.collection).toBe("slot-booking-2");
  });

  it("ignores README markers in gitignored folders", () => {
    fx = fixture({ files: { ...lockExample, ".gitignore": "worktrees/\n", "worktrees/copy/README.md": "---\nbrindley: 1\n---\n# Copy\n" } });
    expect(fx.load().collections.map((c) => c.name)).toEqual(["slot-booking"]);
  });
});

describe("status folders and aliases", () => {
  const legacy = {
    "plans/README.md": "---\nbrindley: 1\nstatuses:\n  spiked: designed\n---\n# Plans\n",
    "plans/01-batch.md": "---\nstatus: Proposed\n---\n# Batch\n",
    "plans/2-spike.md": "---\nstatus: spiked\ndepends_on: [3]\n---\n# Spike\n",
    "plans/completed/3-done-thing.md": "# Done thing\n",
    "plans/completed/4-reopened.md": "---\nstatus: draft\n---\n# Reopened\n",
    "plans/deferred/5-later.md": "# Later\n",
    "plans/archive-of-misc/6-mystery.md": "# Mystery\n",
    "plans/code-review/CR-01-note.md": "# Not an initiative\n",
    "plans/7-assets/8-not-an-initiative.md": "# Asset\n",
  };

  it("reads statuses from front-matter, aliases, collection words and status folders", () => {
    fx = fixture({ files: legacy });
    const c = fx.load().collections[0]!;
    const by = Object.fromEntries(c.initiatives.map((i) => [i.number, [i.status, i.statusRaw, i.statusSource]]));
    expect(Object.keys(by)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(by[1]).toEqual(["draft", "Proposed", "front-matter"]);
    expect(by[2]).toEqual(["designed", "spiked", "front-matter"]);
    expect(by[3]).toEqual(["done", "completed", "folder"]);
    expect(by[4]).toEqual(["draft", "draft", "front-matter"]);
    expect(by[5]).toEqual(["deferred", "deferred", "folder"]);
    expect(by[6]).toEqual([undefined, "archive-of-misc", "folder"]);
  });

  it("treats a dependency in completed/ as satisfied", () => {
    fx = fixture({ files: legacy });
    const root = fx.load();
    expect(isReady(root, resolveRef(root, "plans#2"))).toBe(true);
  });

  it("flags unknown status folders and front-matter that contradicts its folder", () => {
    fx = fixture({ files: legacy });
    const found = validate(fx.load()).map((f) => `${f.rule}:${f.file.split("/").pop()}`);
    expect(found).toContain("status-missing:6-mystery.md");
    expect(found).toContain("status-folder-mismatch:4-reopened.md");
  });

  it("coins numbers past those in status folders and shows deferred work separately", () => {
    fx = fixture({ files: legacy });
    expect(ops.nextNumber(fx.load(), fx.load().collections[0]!).number).toBe(7);
    regenerate(fx.load());
    const readme = read("plans/README.md");
    expect(readme).toContain("### Deferred\n\n- 5 [Later](deferred/5-later.md)");
    expect(readme).toContain("| 1 | [Batch](01-batch.md) | — | draft (Proposed) |");
    expect(readme).toContain("| 3 | [Done thing](completed/3-done-thing.md) |");
  });

  it("accepts aliases in set_status and never moves the file", () => {
    fx = fixture({ files: legacy });
    const root = fx.load();
    const r = ops.setStatus(root, resolveRef(root, "plans#5"), "parked");
    expect(r.warnings.join(" ")).toMatch(/stays in "deferred\/"/);
    expect(read("plans/deferred/5-later.md")).toMatch(/^---\nstatus: deferred\n/);
  });
});
