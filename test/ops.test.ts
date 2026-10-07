import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { C, fixture, git, lockExample, write, type Fixture } from "./helpers.js";
import * as ops from "../src/ops.js";
import { declaredTags, resolveRef, statusFromText } from "../src/repo.js";
import { proseStatus } from "../src/markdown.js";
import { dependants, dependencyReport, isReady } from "../src/deps.js";
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
    expect(() => ops.setDependencies(root, resolveRef(root, 23), { add: [22] })).toThrow(/cycle\. If it is related rather than needed first, add it under ## Related/);
  });

  it("advises where a back-reference belongs when dependencies loop", () => {
    fx = fixture({
      files: {
        "plans/README.md": "---\nbrindley: 1\n---\n# Plans\n",
        "plans/1-gates.md": "---\nstatus: draft\n---\n# Gates\n\n## Dependencies\n\n- [2](2-paddles.md)\n",
        "plans/2-paddles.md": "---\nstatus: draft\n---\n# Paddles\n\n## Dependencies\n\n- Depended on by [1](1-gates.md).\n",
      },
    });
    const cycle = validate(fx.load()).find((f) => f.rule === "cycle")!;
    expect(cycle.message).toBe(
      'Dependency cycle: plans#1 → plans#2 → plans#1. If one of these links is a back-reference ("depended on by", "precedes") rather than something needed first, move it to ## Related (keeps a non-blocking link) or to a section such as ## See also (a plain link).',
    );
  });

  it("reads a ## See also link as a plain link: no dependency, related edge or cycle", () => {
    fx = fixture({
      files: {
        "plans/README.md": "---\nbrindley: 1\ngraph:\n  related: true\n---\n# Plans\n",
        "plans/1-gates.md": "---\nstatus: draft\n---\n# Gates\n\n## Dependencies\n\n- [2](2-paddles.md)\n",
        "plans/2-paddles.md": "---\nstatus: draft\n---\n# Paddles\n\n## See also\n\n- Depended on by [1](1-gates.md).\n",
      },
    });
    const root = fx.load();
    const paddles = resolveRef(root, "plans#2");
    expect(paddles.dependsOn).toEqual([]);
    expect(paddles.related).toEqual([]);
    expect(validate(root).filter((f) => f.rule === "cycle")).toEqual([]);
    regenerate(root);
    expect(read("plans/README.md")).toContain("n1 --> n2");
    expect(read("plans/README.md")).not.toMatch(/n2 -(-|\.-)>/);
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

  it("accepts absolute doc paths, refuses initiative files, and says where it looked", () => {
    fx = fixture({ files: { ...lockExample, "services/locks/docs/LOCKS.md": "# Locks\n" } });
    write(fx.repo, "services/locks/docs/LOCKS.md", "# Locks\n\nPassages are recorded as events.\n");
    let root = fx.load();
    expect(() => ops.complete(root, resolveRef(root, 23), [`${C}/23-passage-recorded-event.md`])).toThrow(/part of a collection/);
    expect(() => ops.complete(root, resolveRef(root, 23), ["docs/MISSING.md"])).toThrow(
      new RegExp(`does not exist in ${root.repoRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: docs/MISSING.md`),
    );
    const r = ops.complete(root, resolveRef(root, 23), [join(fx.repo, "services/locks/docs/LOCKS.md")]);
    expect(r.result.ref).toBeDefined();
    root = fx.load();
    expect(resolveRef(root, 23).docsImpact).toEqual(["services/locks/docs/LOCKS.md"]);
  });

  it("names the checkout and the worktree that has a missing path", () => {
    fx = fixture({
      files: {
        "plans/README.md": "---\nbrindley: 1\n---\n# Plans\n",
        "plans/1-gates.md": "---\nstatus: draft\n---\n# Gates\n\nSee [paddles](2-paddles.md) and [the guide](../docs/guide.md).\n",
      },
    });
    const wt = `${fx.repo}-wt`;
    git(fx.repo, "worktree", "add", "-q", wt, "-b", "feature");
    try {
      write(wt, "plans/2-paddles.md", "---\nstatus: draft\n---\n# Paddles\n");
      write(wt, "docs/guide.md", "# Guide\n");
      write(wt, "lock-keepers/README.md", "# Lock keepers\n");
      const root = fx.load();
      const broken = validate(root).filter((f) => f.rule === "broken-link").map((f) => f.message);
      // A sibling link needs no path; one that climbs out shows where it resolves. Both name the worktree.
      expect(broken[0]).toMatch(/^Link target does not exist: 2-paddles\.md It exists in the worktree .*-wt: this server works on /);
      expect(broken[1]).toMatch(/^Link target does not exist: \.\.\/docs\/guide\.md \(docs\/guide\.md\) It exists in the worktree .*-wt/);
      expect(() => resolveRef(root, "plans/2-paddles.md")).toThrow(
        new RegExp(`^No initiative at plans/2-paddles\\.md in ${fx.repo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\. It exists in the worktree .*-wt`),
      );
      expect(() => ops.createCollection(root, "lock-keepers", {})).toThrow(/^lock-keepers does not exist in .*\. It exists in the worktree .*-wt/);
      expect(() => resolveRef(root, "plans/9-nothing.md")).toThrow(/^No initiative at plans\/9-nothing\.md in [^.]*\.$/);
    } finally {
      rmSync(wt, { recursive: true, force: true });
    }
  });

  it("points at the worktree that has a doc path missing from this one", () => {
    fx = fixture({ files: lockExample });
    const wt = `${fx.repo}-wt`;
    git(fx.repo, "worktree", "add", "-q", wt, "-b", "feature");
    try {
      write(wt, "services/locks/docs/NEW.md", "# New\n");
      const root = fx.load();
      expect(() => ops.complete(root, resolveRef(root, 23), ["services/locks/docs/NEW.md"])).toThrow(/exists in the worktree .*-wt/);
    } finally {
      rmSync(wt, { recursive: true, force: true });
    }
  });

  it("flags history phrasing in the docs it lists", () => {
    fx = fixture({ files: { ...lockExample, "services/locks/docs/LOCKS.md": "# Locks\n" } });
    write(fx.repo, "services/locks/docs/LOCKS.md", "# Locks\n\nPassages were previously logged to a file.\n");
    const root = fx.load();
    const r = ops.complete(root, resolveRef(root, 23), ["services/locks/docs/LOCKS.md"]);
    expect(JSON.stringify(r.result.docFindings)).toContain("previously");
  });
});

describe("section placeholders", () => {
  it("create fills empty sections, and question changes keep a placeholder in place", () => {
    fx = fixture({ files: lockExample });
    let root = fx.load();
    const r = ops.create(root, { collection: "sb", title: "Night passages" });
    const text = () => read(r.result.path);
    expect(text()).toContain("## Open questions\n\n_None._\n\n## Acceptance criteria\n\n_What must be true when this is done._\n");
    root = fx.load();
    expect(ops.preflight(root, resolveRef(root, r.result.ref)).checks.find((c) => c.check === "Acceptance criteria")?.result).toBe("fail");
    ops.addQuestion(root, resolveRef(root, r.result.ref), "Who keeps the lock open after dark?");
    expect(text()).toContain("## Open questions\n\n- Who keeps the lock open after dark?\n\n## Acceptance");
    root = fx.load();
    ops.resolveQuestion(root, resolveRef(root, r.result.ref), { index: 1 }, "The lock keeper on call.");
    expect(text()).toContain("## Open questions\n\n_None._\n");
    expect(text()).toContain("- The lock keeper on call.");
  });
});

describe("add_question", () => {
  it("indents a multi-line question so it stays one list item", () => {
    fx = fixture({ files: lockExample });
    const root = fx.load();
    ops.addQuestion(root, resolveRef(root, 23), "Which shape?\n`a` or `b`?");
    expect(read(`${C}/23-passage-recorded-event.md`)).toContain("- Which shape?\n  `a` or `b`?");
    const q = resolveRef(fx.load(), 23).questions.at(-1)!;
    expect(q.text).toContain("`a` or `b`?");
    ops.addQuestion(fx.load(), resolveRef(fx.load(), 23), "Like this?\n```yaml\ncolumns:\n  active: [number]\n```");
    expect(read(`${C}/23-passage-recorded-event.md`)).toContain("- Like this?\n  ```yaml\n  columns:\n    active: [number]\n  ```"); // nested indentation kept
  });
});

describe("status stated in the text", () => {
  it("reads only an explicit status line or section, mapping aliases and the collection's own words", () => {
    const statuses = { spiked: "designed" };
    expect(statusFromText({ proseStatus: proseStatus("# X\n\n**Status:** Proposed — design only.\n") })).toEqual({ status: "draft", word: "Proposed" });
    expect(statusFromText({ proseStatus: proseStatus("# X\n\n## Status\n\nCompleted in March.\n") })).toEqual({ status: "done", word: "Completed" });
    expect(statusFromText({ proseStatus: proseStatus("# X\n\n**Status:** spiked\n") }, statuses)).toEqual({ status: "designed", word: "spiked" });
    expect(statusFromText({ proseStatus: proseStatus("# X\n\n**Status:** Blocked on vendor\n") })).toEqual({
      status: undefined,
      reason: 'The body says "Blocked", which isn\'t a status, an alias or one of the collection\'s `statuses:`.',
    });
    expect(statusFromText({ proseStatus: proseStatus("# X\n\nThis proposal is still exploratory.\n") }).status).toBeUndefined();
  });

  it("warns status-inferable only where nothing is recorded and the text states a status", () => {
    fx = fixture({
      files: {
        "plans/README.md": "---\nbrindley: 1\n---\n# Plans\n",
        "plans/1-gates.md": "# Gates\n\n**Status:** Exploratory.\n",
        "plans/2-paddles.md": "# Paddles\n\nStill exploratory, really.\n",
        "plans/3-sluice.md": "---\nstatus: designed\n---\n# Sluice\n\n**Status:** Proposed.\n",
      },
    });
    const found = validate(fx.load());
    const inferable = found.filter((f) => f.rule === "status-inferable").map((f) => `${f.file}: ${f.message}`);
    expect(inferable).toEqual(["plans/1-gates.md: No status recorded; the body says Exploratory (draft). Record it with `update` (`status: draft`)."]);
    expect(found.find((f) => f.rule === "status-prose-mismatch")?.message).toBe('The body says "Proposed" (draft), but the status is designed.');
  });
});

describe("update", () => {
  it("records a status only where front-matter has none, and refuses to change one", () => {
    fx = fixture({
      files: {
        "plans/README.md": "---\nbrindley: 1\nstatuses:\n  spiked: designed\n---\n# Plans\n",
        "plans/1-gates.md": "# Gates\n\n**Status:** Proposed.\n",
        "plans/2-paddles.md": "# Paddles\n",
        "plans/3-sluice.md": "# Sluice\n",
        "plans/completed/4-towpath.md": "# Towpath\n",
        "plans/5-weir.md": "---\nstatus: draft\n---\n# Weir\n",
      },
    });
    let root = fx.load();
    ops.update(root, resolveRef(root, "plans#1"), { status: "Proposed" }); // an alias
    ops.update(root, resolveRef(root, "plans#2"), { status: "spiked" }); // the collection's own word
    ops.update(root, resolveRef(root, "plans#3"), { status: "done" }); // no lifecycle checks, no complete
    const w = ops.update(root, resolveRef(root, "plans#4"), { status: "done" }); // from a folder: front-matter now wins
    expect(w.warnings[0]).toMatch(/stays in "completed\/".*front-matter status now takes precedence/);
    expect(() => ops.update(root, resolveRef(root, "plans#5"), { status: "done" })).toThrow(/already records status: draft\. Changing it is a transition: use set_status/);
    expect(() => ops.update(root, resolveRef(root, "plans#2"), { status: "nearly" })).toThrow(/Unknown status "nearly"/);
    root = fx.load();
    expect(["plans#1", "plans#2", "plans#3", "plans#4"].map((r) => resolveRef(root, r).status)).toEqual(["draft", "designed", "done", "done"]);
    expect(read("plans/3-sluice.md")).toContain('docs_impact: "none: completed before Brindley"');
    const docsImpact = validate(root).filter((f) => f.rule === "docs-impact" || f.rule === "status-missing");
    expect(docsImpact.map((f) => f.file)).toEqual([]);
  });

  it("edits a done initiative's body without a status change", () => {
    fx = fixture({ files: lockExample });
    const root = fx.load();
    ops.update(root, resolveRef(root, 19), { section: "Findings", content: "Boats keep their identity across locks." });
    const after = resolveRef(fx.load(), 19);
    expect(after.status).toBe("done");
    expect(after.body).toContain("## Findings\n\nBoats keep their identity across locks.");
  });

  it("writes one heading when section content repeats it", () => {
    fx = fixture({ files: lockExample });
    let root = fx.load();
    ops.update(root, resolveRef(root, 23), { section: "Measures", content: "## Measures\n\nHow long a passage takes." });
    root = fx.load();
    ops.update(root, resolveRef(root, 23), { section: "Goal", content: "### goal\n\nRecord every passage." });
    const text = read(`${C}/23-passage-recorded-event.md`);
    expect(text.match(/^## Measures$/gm)).toHaveLength(1);
    expect(text).toContain("## Measures\n\nHow long a passage takes.");
    expect(text.match(/goal$/gim)).toHaveLength(1);
    expect(text).toContain("## Goal\n\nRecord every passage.");
  });

  it("adds a new section before Open questions and Acceptance criteria", () => {
    fx = fixture({ files: lockExample });
    const r = ops.create(fx.load(), { collection: "sb", title: "Winter stoppages" });
    const root = fx.load();
    ops.update(root, resolveRef(root, r.result.ref), { section: "Decisions", content: "- Close for two weeks." });
    const heads = read(r.result.path).match(/^## .+$/gm);
    expect(heads).toEqual(["## Goal", "## Dependencies", "## Decisions", "## Open questions", "## Acceptance criteria"]);
  });

  it("keeps a leading heading that names something else", () => {
    fx = fixture({ files: lockExample });
    const root = fx.load();
    ops.update(root, resolveRef(root, 23), { section: "Findings", content: "### Timings\n\n4 minutes." });
    expect(read(`${C}/23-passage-recorded-event.md`)).toContain("## Findings\n\n### Timings\n\n4 minutes.");
  });
});

describe("READMEs", () => {
  it("generates deterministic tables and Mermaid, and leaves text outside the markers alone", () => {
    fx = fixture({ files: lockExample });
    const changes = regenerate(fx.load());
    expect(changes.map((c) => c.reason)).toEqual(["updated"]);
    const readme = read(`${C}/README.md`);
    expect(readme).toContain("Captains book slots to take boats up or down through the lock.");
    expect(readme).toContain("| 21 | [Lock sensor CSV import](21-lock-sensor-import.md) | feature | designed | ✅ ready · ext: [example.com/…/geo-coords](https://example.com/libs/geo-coords) |");
    expect(readme).toContain("```mermaid");
    expect(readme).toContain('n23["🟢 23 Passage recorded event"]');
    expect(readme).not.toContain("classDef");
    expect(readme).toContain('n19["✅ <s>19 Boat identity</s>"]'); // done, shown because 21 depends on it
    expect(readme).toMatch(/x1\{\{"🔗 [^"]*geo-coords"\}\}/);
    expect(readme).toContain("n22 --> n23"); // 22 depends on 23
    expect(readme).toContain("flowchart RL"); // do-first work on the left
    expect(regenerate(fx.load())).toEqual([]); // second run: no diff
    const overview = rootBlock(fx.load());
    expect(overview).toContain("#### `notifications`");
    expect(overview).toContain("Telling captains about changes to their slots");
    expect(overview).toContain("[slot-booking](docs/initiatives/LOCK-42/slot-booking/README.md)");
  });

  it("draws ## Related links in the graph only when the README opts in", () => {
    const files = (graph: string) => ({
      "plans/README.md": `---\nbrindley: 1\n${graph}---\n# Plans\n`,
      "plans/1-gates.md": "---\nstatus: draft\n---\n# Gates\n",
      "plans/2-paddles.md": "---\nstatus: draft\n---\n# Paddles\n\n## Dependencies\n\n- [1](1-gates.md)\n\n## Related\n\n- [3](3-signs.md)\n",
      "plans/3-signs.md": "---\nstatus: draft\n---\n# Signs\n",
    });
    fx = fixture({ files: files("") });
    regenerate(fx.load());
    expect(read("plans/README.md")).toContain("n2 --> n1");
    expect(read("plans/README.md")).not.toContain("-.->");
    fx.cleanup();
    fx = fixture({ files: files("graph:\n  related: true\n") });
    regenerate(fx.load());
    expect(read("plans/README.md")).toContain("n2 -.-> n3");
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
  it("does not read links shown as inline code as broken links", () => {
    fx = fixture({ files: { ...lockExample, [`${C}/30-code.md`]: "---\nstatus: draft\n---\n# Code\n\nWrite `[23](23-….md)` like this; [gone](gone.md) is real.\n" } });
    const broken = validate(fx.load()).filter((f) => f.rule === "broken-link" && f.file.endsWith("30-code.md"));
    expect(broken.map((f) => f.message)).toEqual(["Link target does not exist: gone.md"]);
  });

  it("reports duplicate numbers, dangling refs and unknown tags", () => {
    fx = fixture({
      files: {
        ...lockExample,
        [`${C}/21-duplicate.md`]: "---\nstatus: draft\ndepends_on: [99]\ntags: [Bad_Tag, unknown]\n---\n# Dup\n",
      },
    });
    const rules = validate(fx.load()).map((f) => f.rule);
    expect(rules).toContain("duplicate-number");
    expect(rules).toContain("front-matter-dependencies");
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
    "plans/2-spike.md": "---\nstatus: spiked\n---\n# Spike\n\n## Dependencies\n\n- [3](completed/3-done-thing.md)\n",
    "plans/completed/3-done-thing.md": "# Done thing\n",
    "plans/completed/4-reopened.md": "---\nstatus: draft\n---\n# Reopened\n",
    "plans/deferred/5-later.md": "# Later\n",
    "plans/archive-of-misc/6-mystery.md": "# Mystery\n",
    "plans/code-review/CR-01-note.md": "# Not an initiative\n",
    "plans/7-assets/8-not-an-initiative.md": "# Asset\n",
  };

  const structure = {
    ...legacy,
    "plans/2-spike.md": "---\nstatus: spiked\n---\n# Spike\n\n## Dependencies\n\n- Builds on [the done thing](3-done-thing.md).\n",
    "plans/completed/3-done-thing.md": "# Done thing\n\n**Status:** Proposed -- still being discussed\n",
    "plans/9-finished-but-here.md": "---\nstatus: done\ndocs_impact: \"none: test\"\n---\n# Finished\n",
    "plans/10-no-front-matter.md": "# Prose only\n\n## Status\n\n`draft` — design proposal.\n",
  };

  it("flags structure problems: wrong folder, prose disagreement, moved links, padding", () => {
    fx = fixture({ files: structure });
    const found = validate(fx.load());
    const msg = (rule: string, file: string) => found.find((f) => f.rule === rule && f.file.endsWith(file))?.message;
    expect(msg("status-not-in-folder", "9-finished-but-here.md")).toMatch(/keeps done work in "plans\/completed\/" and this file is directly in "plans\/"/);
    expect(msg("status-not-in-folder", "4-reopened.md")).toBeUndefined(); // draft has no status folder
    expect(msg("status-prose-mismatch", "3-done-thing.md")).toMatch(/body says "Proposed" \(draft\), but the status is done \(from "completed\/"\)/);
    expect(msg("broken-link", "2-spike.md")).toMatch(/it is now at completed\/3-done-thing\.md/);
    expect(msg("number-padding", "01-batch.md")).toBe("01-batch.md is padded to 2 digits; this collection doesn't pad its numbers (1-). `repad` makes them consistent.");
    expect(msg("status-missing", "10-no-front-matter.md")).toBe("No `status` in front-matter (see status-inferable).");
    expect(msg("status-inferable", "10-no-front-matter.md")).toBe("No status recorded; the body says draft (draft). Record it with `update` (`status: draft`).");
  });

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

describe("ignore", () => {
  const files = (ignore: string) => ({
    "plans/README.md": `---\nbrindley: 1\nignore:\n${ignore}\n---\n# Plans\n`,
    "plans/1-one.md": "---\nstatus: draft\n---\n# One\n",
    "plans/2-scratch.md": "---\nstatus: draft\n---\n# Scratch\n",
    "plans/completed/3-three.md": "# Three\n",
    "plans/completed/3-three-rationale.md": "# Rationale\n",
    "plans/code-review/4-review.md": "# Review\n",
    "plans/code-review/5-keep.md": "# Keep\n",
  });
  const numbersOf = (fx: Fixture) => fx.load().collections[0]!.initiatives.map((i) => i.rel.replace("plans/", ""));

  it("recognises a companion note sharing a number, and says where it belongs", () => {
    fx = fixture({
      files: {
        "plans/README.md": "---\nbrindley: 1\n---\n# Plans\n",
        "plans/24-booking-window.md": "---\nstatus: draft\n---\n# Booking window\n",
        "plans/24-booking-window-rationale.md": "# Why the window is 48 hours\n",
        "plans/completed/30-gates.md": "---\nstatus: done\n---\n# Gates\n",
        "plans/completed/30-gates-old-sketch.md": "# Sketch\n",
        "plans/31-sluice.md": "---\nstatus: draft\n---\n# Sluice\n",
        "plans/31-towpath.md": "---\nstatus: draft\n---\n# Towpath\n",
      },
    });
    const dups = validate(fx.load()).filter((f) => f.rule === "duplicate-number");
    const by = (file: string) => dups.find((d) => d.file === file)?.message;
    expect(by("plans/24-booking-window-rationale.md")).toBe(
      "24-booking-window-rationale.md shares number 24 with 24-booking-window.md and looks like a companion to it, not an initiative. " +
        "Move it into the initiative's asset folder (e.g. 24-booking-window/rationale.md) and link it from the initiative, " +
        "or, to leave it in place, add `*-rationale.md` to the collection's `ignore` (the `ignore` tool previews it). " +
        "Links to a moved file need updating; Brindley moves nothing.",
    );
    // An unusual suffix gets its exact path; the asset folder sits beside the initiative.
    expect(by("plans/completed/30-gates-old-sketch.md")).toMatch(/asset folder \(e\.g\. completed\/30-gates\/old-sketch\.md\).*add `completed\/30-gates-old-sketch\.md`/);
    // Unrelated names keep the general advice.
    expect(by("plans/31-towpath.md")).toMatch(/^Number 31 is also used by plans\/31-sluice\.md; renumber one of them/);
  });

  it("ignores files and folders with .gitignore-style patterns", () => {
    fx = fixture({ files: files('  - "# comment"\n  - "*-rationale.md"\n  - /2-scratch.md\n  - code-review/\n') });
    expect(numbersOf(fx)).toEqual(["1-one.md", "completed/3-three.md"]);
    const rules = validate(fx.load()).map((f) => f.rule);
    expect(rules).not.toContain("duplicate-number");
    const other = fixture({ files: files("  - code-review/\n") });
    try {
      const dup = validate(other.load()).find((f) => f.rule === "duplicate-number");
      expect(dup?.message).toMatch(/ignore/);
    } finally {
      other.cleanup();
    }
  });

  it("supports negation", () => {
    fx = fixture({ files: files('  - "code-review/*"\n  - "!code-review/5-keep.md"\n') });
    expect(numbersOf(fx)).toContain("code-review/5-keep.md");
    expect(numbersOf(fx)).not.toContain("code-review/4-review.md");
  });

  it("previews, adds and removes patterns, reporting what changes", () => {
    fx = fixture({ files: files("  - code-review/\n") });
    const c = () => fx.load().collections[0]!;
    expect(c().ignored).toEqual(["code-review/4-review.md", "code-review/5-keep.md"]);
    const preview = ops.setIgnore(fx.load(), "plans", { add: ["*-rationale.md"], dryRun: true });
    expect(preview.result.newlyIgnored).toEqual(["completed/3-three-rationale.md"]);
    expect(preview.touched).toEqual([]);
    expect(c().ignored).not.toContain("completed/3-three-rationale.md"); // dry run wrote nothing
    ops.setIgnore(fx.load(), "plans", { add: ["*-rationale.md"], remove: ["code-review/"] });
    expect(c().meta.ignore).toEqual(["*-rationale.md"]);
    expect(c().ignored).toEqual(["completed/3-three-rationale.md"]);
    expect(read("plans/README.md")).toMatch(/ignore:\n  - "\*-rationale\.md"\n/);
  });

  it("still counts ignored numbers when coining", () => {
    fx = fixture({ files: files("  - code-review/\n") });
    expect(ops.nextNumber(fx.load(), fx.load().collections[0]!).number).toBe(6);
  });
});

describe("collection aliases", () => {
  const two = (extra = "") => ({
    ...lockExample,
    "docs/initiatives/LOCK-43/lock-gate-maintenance/README.md": `---\nbrindley: 1\n${extra}---\n# Gates\n`,
    "docs/initiatives/LOCK-43/lock-gate-maintenance/22-leak-survey.md": "---\nstatus: designed\n---\n# Leak survey\n",
    [`${C}/40-gate-alarms.md`]: "---\nstatus: designed\n---\n# Gate alarms\n\n## Dependencies\n\n- [leak survey](../../LOCK-43/lock-gate-maintenance/22-leak-survey.md)\n",
  });

  it("derives an initials alias and resolves references through it, ignoring case", () => {
    fx = fixture({ files: two() });
    const root = fx.load();
    const lgm = root.collections.find((c) => c.name === "lock-gate-maintenance")!;
    expect(lgm.aliases).toEqual(["lgm"]);
    expect(resolveRef(root, "lgm#22").title).toBe("Leak survey");
    const user = resolveRef(root, "slot-booking#40");
    expect(user.dependsOn[0]).toMatchObject({ collection: "lock-gate-maintenance", number: 22 });
    expect(isReady(root, user)).toBe(false); // 22 is designed, not done
    expect(dependants(root, resolveRef(root, "lgm#22")).map((i) => i.number)).toEqual([40]);
  });

  it("uses explicit aliases from front-matter", () => {
    fx = fixture({ files: two("aliases: [gates]\n") });
    const root = fx.load();
    expect(resolveRef(root, "gates#22").title).toBe("Leak survey");
    expect(resolveRef(root, "lgm#22").title).toBe("Leak survey"); // the automatic one still applies
  });

  it("drops an automatic alias that would be ambiguous", () => {
    fx = fixture({ files: { ...two(), "elsewhere/left-gate-mechanisms/README.md": "---\nbrindley: 1\n---\n# Other\n" } });
    const root = fx.load();
    expect(root.collections.find((c) => c.name === "lock-gate-maintenance")!.aliases).toEqual([]);
    expect(() => resolveRef(root, "lgm#22")).toThrow();
  });

  it("flags explicit aliases that clash", () => {
    fx = fixture({ files: { ...two("aliases: [slot-booking]\n") } });
    expect(validate(fx.load()).map((f) => f.rule)).toContain("alias-clash");
    expect(() => ops.createCollection(fx.load(), "x/y", { aliases: ["lgm"] })).toThrow(/already refers/);
  });
});

describe("dependencies from the ## Dependencies section", () => {
  it("treats links to initiatives as dependencies, URLs as external, other links as nothing", () => {
    fx = fixture({ files: lockExample });
    const root = fx.load();
    const report = dependencyReport(root, resolveRef(root, "sb#21"));
    expect(report.map((d) => [d.ref, d.classification])).toEqual([
      ["19", "satisfied"],
      ["20", "satisfied"],
      ["https://example.com/libs/geo-coords", "external"],
    ]);
    const i22 = resolveRef(root, "sb#22");
    expect(i22.dependsOn.map((r) => (r.kind === "initiative" ? r.number : r.raw))).toEqual([23]); // prose link counts
    expect(i22.related.map((r) => (r.kind === "initiative" ? r.number : r.raw))).toEqual([19]); // non-blocking
  });

  it("still counts a link to a file that has moved, and says where it went", () => {
    fx = fixture({
      files: {
        "plans/README.md": "---\nbrindley: 1\n---\n# Plans\n",
        "plans/1-uses.md": "---\nstatus: designed\n---\n# Uses\n\n## Dependencies\n\n- [2](2-base.md)\n",
        "plans/completed/2-base.md": "# Base\n",
      },
    });
    const root = fx.load();
    const i = resolveRef(root, "plans#1");
    expect(i.dependsOn[0]).toMatchObject({ number: 2, movedTo: "plans/completed/2-base.md" });
    expect(isReady(root, i)).toBe(true);
    expect(validate(root).find((f) => f.rule === "broken-link")?.message).toMatch(/now at completed\/2-base\.md/);
  });

  it("set_dependencies adds and removes bullet links, using aliases", () => {
    fx = fixture({
      files: {
        ...lockExample,
        "docs/initiatives/LOCK-43/lock-gate-maintenance/README.md": "---\nbrindley: 1\n---\n# Gates\n",
        "docs/initiatives/LOCK-43/lock-gate-maintenance/22-leak-survey.md": "---\nstatus: done\n---\n# Leak survey\n",
      },
    });
    let root = fx.load();
    ops.setDependencies(root, resolveRef(root, "sb#23"), { add: ["LGM#22", "https://jira.example.com/browse/LOCK-7"], why: "needed first" });
    const text = () => read(`${C}/23-passage-recorded-event.md`);
    expect(text()).toContain(
      "## Dependencies\n\n- [lock-gate-maintenance#22 Leak survey](../../LOCK-43/lock-gate-maintenance/22-leak-survey.md) — needed first\n- [https://jira.example.com/browse/LOCK-7](https://jira.example.com/browse/LOCK-7) — needed first",
    );
    root = fx.load();
    expect(dependencyReport(root, resolveRef(root, "sb#23")).map((d) => d.classification)).toEqual(["satisfied", "external"]);
    ops.setDependencies(root, resolveRef(root, "sb#23"), { remove: ["lgm#22"] });
    expect(text()).not.toContain("22-leak-survey.md");
    expect(text()).toContain("LOCK-7");
  });

  it("removes bullet links, and says where a paragraph link is instead of claiming it isn't linked", () => {
    const paddles =
      "---\nstatus: draft\n---\n# Paddles\n\n## Dependencies\n\n- [1 Gates](1-gates.md) — first\n\nNeeds the [sluice](3-sluice.md) to be rebuilt.\n\n## Related\n\nInformed by [gates](1-gates.md).\n";
    fx = fixture({
      files: {
        "plans/README.md": "---\nbrindley: 1\n---\n# Plans\n",
        "plans/1-gates.md": "---\nstatus: draft\n---\n# Gates\n",
        "plans/2-paddles.md": paddles,
        "plans/3-sluice.md": "---\nstatus: draft\n---\n# Sluice\n",
        "plans/4-towpath.md": "---\nstatus: draft\n---\n# Towpath\n",
      },
    });
    let root = fx.load();
    // A bullet goes; nothing else to report.
    let r = ops.setDependencies(root, resolveRef(root, "plans#2"), { remove: [1] });
    expect(read("plans/2-paddles.md")).not.toContain("- [1 Gates]");
    expect(r.warnings).toEqual([]);
    // A paragraph link stays, and the warning says where (file line 10).
    root = fx.load();
    r = ops.setDependencies(root, resolveRef(root, "plans#2"), { remove: [3] });
    expect(read("plans/2-paddles.md")).toContain("Needs the [sluice](3-sluice.md) to be rebuilt.");
    expect(r.warnings).toEqual([
      'plans#3 is linked in a paragraph under "## Dependencies" (line 10), not a bullet, so it was not removed. Edit the text: delete the link, or move the sentence to ## Related or ## See also.',
    ]);
    // The same under ## Related.
    root = fx.load();
    r = ops.setDependencies(root, resolveRef(root, "plans#2"), { related_remove: [1] });
    expect(r.warnings[0]).toMatch(/^plans#1 is linked in a paragraph under "## Related" \(line 14\)/);
    // Genuinely absent: "not linked", in both sections.
    root = fx.load();
    r = ops.setDependencies(root, resolveRef(root, "plans#2"), { remove: [4], related_remove: [4] });
    expect(r.warnings).toEqual(['4 is not linked under "## Dependencies".', '4 is not linked under "## Related".']);
  });

  it("create links dependencies and related initiatives in their sections", () => {
    fx = fixture({ files: lockExample });
    const r = ops.create(fx.load(), { collection: "sb", title: "Pairing", depends_on: [20], related: [22] });
    const text = read(r.result.path);
    expect(text).toContain("## Dependencies\n\n- [20 Slot calendar and read model](20-slot-calendar-and-read-model.md) — _why this is needed_");
    expect(text).toContain("## Related\n\n- [22 Opening-hours change impact](22-opening-hours-change-impact.md)\n");
    expect(text).not.toMatch(/depends_on:/);
  });

  it("removing the last related link removes the Related section", () => {
    fx = fixture({ files: lockExample });
    const r = ops.create(fx.load(), { collection: "sb", title: "Moorings", related: [22] });
    const root = fx.load();
    ops.setDependencies(root, resolveRef(root, r.result.ref), { related_remove: [22] });
    const text = read(r.result.path);
    expect(text).not.toContain("## Related");
    expect(text).toContain("## Dependencies\n\n_None._\n\n## Open questions");
  });

  it("create appends why to dependencies only, and gives related links no note", () => {
    fx = fixture({ files: lockExample });
    let r = ops.create(fx.load(), { collection: "sb", title: "Tickets", related: ["https://github.com/example/issues/3"] });
    expect(read(r.result.path)).toContain("## Related\n\n- [https://github.com/example/issues/3](https://github.com/example/issues/3)\n");
    r = ops.create(fx.load(), { collection: "sb", title: "Queues", depends_on: [20], related: [22], why: "queues are per slot" });
    expect(read(r.result.path)).toContain("(20-slot-calendar-and-read-model.md) — queues are per slot\n");
    expect(read(r.result.path)).toContain("(22-opening-hours-change-impact.md)\n"); // why is for dependencies only
  });
});

describe("theme overview docs", () => {
  const files = {
    ...lockExample,
    [`${C}/NOTIFICATIONS.md`]:
      "---\ntheme: notifications\nsummary: How captains hear about changes\n---\n# Notifications — orientation map\n\nHand-written overview.\n",
    "plans/README.md": "---\nbrindley: 1\n---\n# Plans\n",
    "plans/1-sms.md": "---\nstatus: designed\ntags: [notifications]\n---\n# SMS alerts\n",
  };

  it("finds the doc, keeps a member list in it across collections, and leaves the prose alone", () => {
    fx = fixture({ files });
    const root = fx.load();
    expect(root.themes).toEqual([expect.objectContaining({ tag: "notifications", title: "Notifications — orientation map", collection: "slot-booking" })]);
    regenerate(root);
    const doc = read(`${C}/NOTIFICATIONS.md`);
    expect(doc).toContain("Hand-written overview.");
    expect(doc).toContain("Tagged `notifications`: 2 open, 0 closed or deferred.");
    expect(doc).toContain("| `slot-booking#22` | [Opening-hours change impact](22-opening-hours-change-impact.md) |");
    expect(doc).toContain("| `plans#1` | [SMS alerts](../../../../plans/1-sms.md) |");
  });

  it("updates the member list when a tagged initiative changes, and links it from the overview", () => {
    fx = fixture({ files });
    let root = fx.load();
    ops.setStatus(root, resolveRef(root, "plans#1"), "abandoned");
    expect(read(`${C}/NOTIFICATIONS.md`)).toContain("1 open, 1 closed or deferred");
    root = fx.load();
    expect(rootBlock(root)).toContain("Overview: [Notifications — orientation map](docs/initiatives/LOCK-42/slot-booking/NOTIFICATIONS.md) — How captains hear about changes");
    // The theme doc's own summary wins over a collection's tag description.
    expect(declaredTags(root)).toMatchObject({ notifications: "How captains hear about changes" });
  });

  it("flags two docs for one theme", () => {
    fx = fixture({ files: { ...files, "plans/ALSO.md": "---\ntheme: notifications\n---\n# Also\n" } });
    expect(validate(fx.load()).map((f) => f.rule)).toContain("duplicate-theme");
  });
});

describe("spikes", () => {
  it("creates a spike with Measures and Findings sections", () => {
    fx = fixture({ files: lockExample });
    const r = ops.create(fx.load(), { collection: "sb", title: "Pairing viability", type: "spike" });
    const text = read(r.result.path);
    expect(text).toContain("## Measures\n\n- **Question:**");
    expect(text).toContain("## Findings");
    expect(text.indexOf("## Measures")).toBeLessThan(text.indexOf("## Open questions"));
  });

  it("checks readiness: measures for a spike, acceptance criteria otherwise", () => {
    fx = fixture({ files: lockExample });
    let root = fx.load();
    const spike = ops.create(root, { collection: "sb", title: "Pairing viability", type: "spike" }).result.ref;
    root = fx.load();
    ops.setStatus(root, resolveRef(root, spike), "designed");
    root = fx.load();
    const p = ops.preflight(root, resolveRef(root, spike));
    expect(p.ready).toBe(false);
    expect(p.checks.find((c) => c.check === "Measures")?.result).toBe("fail");
    expect(ops.preflight(root, resolveRef(root, "sb#21")).ready).toBe(true);
    const blocked = ops.preflight(root, resolveRef(root, "sb#22"));
    // 22 is a draft, blocked by 23, with open questions; it does have acceptance criteria.
    expect(blocked.checks.filter((c) => c.result === "fail").map((c) => c.check)).toEqual(["Status", "Dependencies", "Open questions"]);
    expect(validate(root).map((f) => f.rule)).toContain("spike-measures");
  });

  it("completes a spike without docs_impact, warns about missing findings, and lists questions to revisit", () => {
    fx = fixture({ files: lockExample });
    let root = fx.load();
    const spike = ops.create(root, { collection: "sb", title: "Pairing viability", type: "spike" }).result.ref;
    root = fx.load();
    ops.setDependencies(root, resolveRef(root, "sb#22"), { related_add: [spike] });
    root = fx.load();
    const r = ops.complete(root, resolveRef(root, spike), undefined);
    expect(r.warnings.join(" ")).toMatch(/no "## Findings"/);
    expect(r.result.questionsToRevisit?.map((q) => q.ref)).toEqual(["slot-booking#22"]);
    expect(read(`${C}/24-pairing-viability.md`)).toContain('docs_impact: "none: spike — findings recorded in the initiative"');
    expect(() => ops.complete(fx.load(), resolveRef(fx.load(), "sb#21"), undefined)).toThrow(/docs_impact/);
  });
});
