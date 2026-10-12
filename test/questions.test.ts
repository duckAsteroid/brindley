import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { fixture, type Fixture } from "./helpers.js";
import * as ops from "../src/ops.js";
import { resolveRef } from "../src/repo.js";
import { createServer } from "../src/server.js";

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
    const r = ops.splitQuestion(root, resolveRef(root, "locks#1"), { index: 2 }, [
      "Do captains pay online, or at the lock?",
      { text: "Who refunds a cancelled slot?", answer: "The lock keeper refunds at the lock." },
    ]);
    expect(r.result.open).toEqual([{ index: 2, text: "Do captains pay online, or at the lock?", implementation: false }]);
    expect(r.result.decisions).toEqual(["The lock keeper refunds at the lock."]);
    expect(section("Open questions")).toBe("- Which calendar?\n- Do captains pay online, or at the lock?\n- How long is a slot?");
    expect(section("Decisions")).toBe("- The lock keeper refunds at the lock.");
  });

  it("keeps answered parts ticked with mode tick, inherits the (implementation) marker, and keeps a numbered list's marker", () => {
    fx = fixture({ files: files("1. (implementation) Which table, and which index?") });
    const root = fx.load();
    ops.splitQuestion(root, resolveRef(root, "locks#1"), { match: "which table" }, [{ text: "Which table?", answer: "slots" }, "Which index?", { text: "Ask the captains?", implementation: false }], {
      mode: "tick",
    });
    expect(section("Open questions")).toBe("1. [x] (implementation) Which table? — slots\n1. (implementation) Which index?\n1. Ask the captains?");
    expect(section("Decisions")).toBe("_None._");
  });

  it("puts a designed initiative with a blocking part back to draft, and refuses what it can't split", () => {
    fx = fixture({ files: files("- (implementation) Cache it, or recompute? Where?", "designed") });
    let root = fx.load();
    const i = () => resolveRef((root = fx.load()), "locks#1");
    expect(() => ops.splitQuestion(root, i(), { index: 1 }, ["Only one?"])).toThrow("Give at least two parts");
    expect(() => ops.splitQuestion(root, i(), { index: 9 }, ["a?", "b?"])).toThrow("No matching open question");
    const r = ops.splitQuestion(root, i(), { index: 1 }, ["Cache it, or recompute?", { text: "Where does the cache live?", implementation: false }]);
    expect(r.result.status).toBe("draft");
    expect(r.warnings).toContain("A blocking question is open on a designed initiative; it is back to draft.");
    root = fx.load();
    ops.resolveQuestion(root, i(), { index: 1 }, "Recompute.", { mode: "tick" });
    expect(() => ops.splitQuestion(fx.load(), i(), { index: 1 }, ["a?", "b?"])).toThrow("Question 1 is already resolved.");
  });

  it("settling every part leaves the section's placeholder", () => {
    fx = fixture({ files: files("- Online? Refunds?") });
    const root = fx.load();
    ops.splitQuestion(root, resolveRef(root, "locks#1"), { index: 1 }, [
      { text: "Online?", answer: "No: at the lock." },
      { text: "Refunds?", answer: "By the keeper." },
    ]);
    expect(section("Open questions")).toBe("_None._");
    expect(section("Decisions")).toBe("- No: at the lock.\n- By the keeper.");
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
    expect(added.warnings[0]).toMatch(/^This looks like more than one decision \(it asks 2 questions\)\. Pose one decision per question: split it with split_question/);
    const qs = json(await client.callTool({ name: "questions", arguments: { ref: "locks#1" } }));
    expect(qs[0].questions.map((q: { compound?: boolean }) => !!q.compound)).toEqual([false, true]);
    const next = json(await client.callTool({ name: "next_question", arguments: { ref: "locks#1", after: 1 } }));
    expect(next.question).toMatchObject({ index: 2, compound: true });
    const split = json(await client.callTool({ name: "split_question", arguments: { ref: "locks#1", index: 2, into: ["Pay online?", { text: "Who refunds?", answer: "The keeper." }] } }));
    expect(split.open).toEqual([{ index: 2, text: "Pay online?", implementation: false }]);
  });
});
