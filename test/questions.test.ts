import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { fixture, type Fixture } from "./helpers.js";
import * as ops from "../src/ops.js";
import { resolveRef } from "../src/repo.js";
import { createServer } from "../src/server.js";
import { validate } from "../src/validate.js";

let fx: Fixture;
afterEach(() => fx?.cleanup());
const read = (p: string) => readFileSync(join(fx.repo, p), "utf8");
const FILE = "locks/01-slot-booking.md";

const files = (questions: string, status = "draft") => ({
  "locks/README.md": "---\nbrindley: 1\n---\n# Locks\n",
  [FILE]: `---\nstatus: ${status}\n---\n# Slot booking\n\n## Decisions\n\n_None._\n\n## Open questions\n\n${questions}\n\n## Acceptance criteria\n\n- Captains can book.\n`,
});

const section = (name: string) => {
  const text = read(FILE);
  const m = new RegExp(`## ${name}\\n\\n([\\s\\S]*?)(?=\\n## |$)`).exec(text);
  return m ? m[1]!.trim() : "";
};

async function connect(cwd: string) {
  const server = createServer({ cwd });
  const client = new Client({ name: "test", version: "0.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}
const json = (res: unknown): any => {
  const r = res as { content: { text: string }[]; isError?: boolean };
  if (r.isError) throw new Error(r.content[0]!.text);
  const out = JSON.parse(r.content[0]!.text);
  return out && typeof out === "object" && "result" in out && "notes" in out ? out.result : out;
};

describe("splitting a compound question", () => {
  it("replaces it with its parts in place, settling answered parts into Decisions", () => {
    fx = fixture({ files: files("- Which calendar?\n- Do captains pay online, or at the lock? And who refunds a cancelled slot?\n- How long is a slot?") });
    const root = fx.load();
    const r = ops.splitQuestion(root, resolveRef(root, "locks#1"), { id: "Q2" }, [
      "Do captains pay online, or at the lock?",
      { text: "Who refunds a cancelled slot?", answer: "The lock keeper refunds at the lock." },
    ]);
    expect(r.result.open).toEqual([{ id: "Q2.1", text: "Do captains pay online, or at the lock?", implementation: false }]);
    expect(r.result.decisions).toEqual(["**Q2.2** The lock keeper refunds at the lock."]);
    expect(section("Open questions")).toBe("- **Q1** Which calendar?\n- **Q2.1** Do captains pay online, or at the lock?\n- **Q3** How long is a slot?");
    expect(section("Decisions")).toBe("- **Q2.2** The lock keeper refunds at the lock.");
  });

  it("keeps answered parts ticked with mode tick, inherits the (implementation) marker, and keeps a numbered list's marker", () => {
    fx = fixture({ files: files("1. (implementation) Which table, and which index?") });
    const root = fx.load();
    ops.splitQuestion(root, resolveRef(root, "locks#1"), { match: "which table" }, [{ text: "Which table?", answer: "slots" }, "Which index?", { text: "Ask the captains?", implementation: false }], {
      mode: "tick",
    });
    expect(section("Open questions")).toBe("1. [x] **Q1.1** (implementation) Which table? — slots\n1. **Q1.2** (implementation) Which index?\n1. **Q1.3** Ask the captains?");
    expect(section("Decisions")).toBe("_None._");
  });

  it("puts a designed initiative with a blocking part back to draft, and refuses what it can't split", () => {
    fx = fixture({ files: files("- (implementation) Cache it, or recompute? Where?", "designed") });
    let root = fx.load();
    const i = () => resolveRef((root = fx.load()), "locks#1");
    expect(() => ops.splitQuestion(root, i(), { id: "Q1" }, ["Only one?"])).toThrow("Give at least two parts");
    expect(() => ops.splitQuestion(root, i(), { id: "Q9" }, ["a?", "b?"])).toThrow("No open question Q9. Open: Q1.");
    const r = ops.splitQuestion(root, i(), { id: "Q1" }, ["Cache it, or recompute?", { text: "Where does the cache live?", implementation: false }]);
    expect(r.result.status).toBe("draft");
    expect(r.warnings).toContain("A blocking question is open on a designed initiative; it is back to draft.");
    root = fx.load();
    ops.resolveQuestion(root, i(), { id: "Q1.1" }, "Recompute.", { mode: "tick" });
    expect(() => ops.splitQuestion(fx.load(), i(), { id: "Q1.1" }, ["a?", "b?"])).toThrow("Q1.1 is already resolved: (implementation) Cache it, or recompute? — Recompute.");
    expect(() => ops.splitQuestion(fx.load(), i(), { id: "Q1" }, ["a?", "b?"])).toThrow("Q1 was split into Q1.2.");
  });

  it("settling every part leaves the section's placeholder", () => {
    fx = fixture({ files: files("- Online? Refunds?") });
    const root = fx.load();
    ops.splitQuestion(root, resolveRef(root, "locks#1"), { id: "Q1" }, [
      { text: "Online?", answer: "No: at the lock." },
      { text: "Refunds?", answer: "By the keeper." },
    ]);
    expect(section("Open questions")).toBe("_None._");
    expect(section("Decisions")).toBe("- **Q1.1** No: at the lock.\n- **Q1.2** By the keeper.");
  });
});

describe("spotting compound questions", () => {
  it("flags several question marks outside inline code, or a nested list — not one question with code", () => {
    expect(ops.compoundReason(["- Pay online, or at the lock? And who refunds?"])).toBe("it asks 2 questions");
    expect(ops.compoundReason(["- Which of these:", "  - online", "  - at the lock"])).toBe("it has a nested list");
    expect(ops.compoundReason(["- Should `slots?limit=10` stay?"])).toBeNull();
  });

  it("add_question warns, and questions / next_question mark it compound", async () => {
    fx = fixture({ files: files("- Which calendar?") });
    const client = await connect(fx.repo);
    const added = json(await client.callTool({ name: "add_question", arguments: { ref: "locks#1", text: "Pay online? Who refunds?" } }));
    expect(added.id).toBe("Q2");
    expect(added.warnings[0]).toMatch(/^This looks like more than one decision \(it asks 2 questions\)\. Pose one decision per question: split it with split_question/);
    const qs = json(await client.callTool({ name: "questions", arguments: { ref: "locks#1" } }));
    expect(qs[0].questions.map((q: { compound?: boolean }) => !!q.compound)).toEqual([false, true]);
    const next = json(await client.callTool({ name: "next_question", arguments: { ref: "locks#1", after: "Q1" } }));
    expect(next.question).toMatchObject({ id: "Q2", compound: true });
    expect(next.question.provisional).toBeUndefined();
    const split = json(await client.callTool({ name: "split_question", arguments: { ref: "locks#1", id: "Q2", into: ["Pay online?", { text: "Who refunds?", answer: "The keeper." }] } }));
    expect(split.open).toEqual([{ id: "Q2.1", text: "Pay online?", implementation: false }]);
  });
});

describe("question labels", () => {
  const three = "- **Q1** Which calendar?\n- **Q2** Do captains pay online?\n- **Q3** How long is a slot?";

  it("resolving one question never moves another's label", () => {
    fx = fixture({ files: files(three) });
    ops.resolveQuestion(fx.load(), resolveRef(fx.load(), "locks#1"), { id: "Q2" }, "Online, by card.");
    ops.resolveQuestion(fx.load(), resolveRef(fx.load(), "locks#1"), { id: "Q3" }, "Twenty minutes.");
    expect(section("Open questions")).toBe("- **Q1** Which calendar?");
    expect(section("Decisions")).toBe("- **Q2** Online, by card.\n- **Q3** Twenty minutes.");
    expect(() => ops.resolveQuestion(fx.load(), resolveRef(fx.load(), "locks#1"), { id: "Q2" }, "Again.")).toThrow("Q2 is already resolved: Online, by card.");
  });

  it("never reuses a label, wherever it was recorded", () => {
    fx = fixture({ files: files(three) });
    ops.resolveQuestion(fx.load(), resolveRef(fx.load(), "locks#1"), { id: "Q3" }, "Twenty minutes.", { record_in: "Agreed direction" });
    expect(ops.addQuestion(fx.load(), resolveRef(fx.load(), "locks#1"), "Who opens the gate?").result.id).toBe("Q4");
    ops.resolveQuestion(fx.load(), resolveRef(fx.load(), "locks#1"), { id: "Q4" }, "The keeper.", { mode: "tick" });
    expect(ops.addQuestion(fx.load(), resolveRef(fx.load(), "locks#1"), "**Q2** At night too?").result.id).toBe("Q5"); // a written label is replaced
    expect(section("Open questions")).toBe("- **Q1** Which calendar?\n- **Q2** Do captains pay online?\n- [x] **Q4** Who opens the gate? — The keeper.\n- **Q5** At night too?");
  });

  it("records the decision under the question's label, replacing one written in the answer", () => {
    fx = fixture({ files: files(three) });
    ops.resolveQuestion(fx.load(), resolveRef(fx.load(), "locks#1"), { match: "calendar" }, "**Q9** The canal calendar.");
    expect(section("Decisions")).toBe("- **Q1** The canal calendar.");
  });

  it("labels an unlabelled file provisionally on read, and writes those labels on the first write", () => {
    fx = fixture({ files: files("- Which calendar?\n- [x] Paper tickets? — No.\n- Do captains pay online?") });
    const before = resolveRef(fx.load(), "locks#1").questions;
    expect(before.map((q) => [q.id, q.provisional])).toEqual([["Q1", true], ["Q2", true], ["Q3", true]]);
    expect(ops.nextQuestion(resolveRef(fx.load(), "locks#1")).question).toEqual({ id: "Q1", provisional: true, text: "Which calendar?" });
    ops.resolveQuestion(fx.load(), resolveRef(fx.load(), "locks#1"), { id: "Q3" }, "Yes.");
    expect(section("Open questions")).toBe("- **Q1** Which calendar?\n- [x] **Q2** Paper tickets? — No.");
    expect(section("Decisions")).toBe("- **Q3** Yes.");
    expect(resolveRef(fx.load(), "locks#1").questions.every((q) => !q.provisional)).toBe(true);
  });

  it("numbers provisional labels after the high-water mark", () => {
    fx = fixture({ files: files("- **Q4** Which calendar?\n- Do captains pay online?") });
    expect(resolveRef(fx.load(), "locks#1").questions.map((q) => q.id)).toEqual(["Q4", "Q5"]);
  });

  it("accepts hand-written lettered labels, and splits them dotted", () => {
    fx = fixture({ files: files("- **Q3a** Which calendar?\n- **Q3b** Online, and who refunds?") });
    expect(ops.addQuestion(fx.load(), resolveRef(fx.load(), "locks#1"), "Night passages?").result.id).toBe("Q4");
    const r = ops.splitQuestion(fx.load(), resolveRef(fx.load(), "locks#1"), { id: "q3B" }, ["Online?", "Who refunds?"]);
    expect(r.result.open.map((p) => p.id)).toEqual(["Q3b.1", "Q3b.2"]);
    expect(ops.nextQuestion(resolveRef(fx.load(), "locks#1"), "Q3a").question?.id).toBe("Q3b.1");
    expect(section("Open questions")).toBe("- **Q3a** Which calendar?\n- **Q3b.1** Online?\n- **Q3b.2** Who refunds?\n- **Q4** Night passages?");
  });

  it("treats bold text that isn't a label as question text", () => {
    fx = fixture({ files: files("- **Blocker:** does the API page?") });
    const [q] = resolveRef(fx.load(), "locks#1").questions;
    expect(q).toMatchObject({ id: "Q1", provisional: true, text: "**Blocker:** does the API page?" });
  });

  it("validate warns about unlabelled questions and duplicate labels; fix labels them", () => {
    fx = fixture({ files: files("- **Q1** Which calendar?\n- **Q1** Online?\n- (implementation) Which table?") });
    const found = validate(fx.load()).filter((f) => f.rule.startsWith("question-"));
    expect(found.map((f) => [f.rule, f.line])).toEqual([["question-unlabelled", 14], ["question-label-duplicate", 13]]);
    const dry = ops.fix(fx.load());
    expect(dry.result.edits.filter((e) => e.rule === "question-label")).toEqual([
      { file: FILE, line: 14, rule: "question-label", before: "- (implementation) Which table?", after: "- **Q2** (implementation) Which table?" },
    ]);
    ops.fix(fx.load(), { dry_run: false });
    expect(section("Open questions")).toBe("- **Q1** Which calendar?\n- **Q1** Online?\n- **Q2** (implementation) Which table?");
    expect(resolveRef(fx.load(), "locks#1").questions[2]).toMatchObject({ id: "Q2", implementation: true });
  });

  it("the question tools take `id`, never `index`", async () => {
    fx = fixture({ files: files(three) });
    const client = await connect(fx.repo);
    const { tools } = await client.listTools();
    for (const name of ["resolve_question", "split_question", "next_question"]) {
      const props = Object.keys((tools.find((t) => t.name === name)!.inputSchema as { properties: object }).properties);
      expect(props).not.toContain("index");
    }
    const got = json(await client.callTool({ name: "get", arguments: { ref: "locks#1" } }));
    expect(got.questions[0]).toEqual({ id: "Q1", text: "Which calendar?", resolved: false, implementation: false });
    const r = json(await client.callTool({ name: "resolve_question", arguments: { ref: "locks#1", id: "Q2", answer: "Online." } }));
    expect(r.id).toBe("Q2");
  });
});
