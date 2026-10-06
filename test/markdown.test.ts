import { describe, expect, it } from "vitest";
import { editFrontMatter, findSection, listItems, parseQuestions, setH1, slugify, splitFrontMatter } from "../src/markdown.js";

describe("front-matter", () => {
  it("splits and preserves comments and key order when editing", () => {
    const text = "---\n# owner team\nstatus: draft # still designing\ndepends_on: [19, 20]\n---\n# Title\n";
    const { fmText, body } = splitFrontMatter(text);
    expect(body).toBe("# Title\n");
    const edited = editFrontMatter(fmText, { status: "designed", updated: "2026-10-06" });
    expect(edited).toContain("# owner team");
    expect(edited).toMatch(/depends_on: \[ ?19, 20 ?\]/);
    expect(edited.indexOf("status")).toBeLessThan(edited.indexOf("depends_on"));
    expect(edited).toContain("updated: 2026-10-06");
  });

  it("writes new lists in flow style", () => {
    expect(editFrontMatter(null, { tags: ["a", "b"] })).toMatch(/^tags: \[ ?a, b ?\]\n$/);
  });
});

describe("open questions", () => {
  const body = `# T

## Open questions

- Plain question that runs
  over two lines?
- [ ] Task question?
- [x] Settled? — yes
- (implementation) Left to the implementer?

## Acceptance criteria

- Done.
`;
  it("parses plain bullets, tasks, multi-line items and implementation markers", () => {
    const qs = parseQuestions(body);
    expect(qs.map((q) => q.text)).toEqual([
      "Plain question that runs over two lines?",
      "Task question?",
      "Settled? — yes",
      "(implementation) Left to the implementer?",
    ]);
    expect(qs.map((q) => q.resolved)).toEqual([false, false, true, false]);
    expect(qs[3]!.implementation).toBe(true);
  });

  it("matches the heading case-insensitively", () => {
    expect(findSection(body.replace("Open questions", "Open Questions"), "open questions")).not.toBeNull();
  });

  it("does not treat headings inside code fences as sections", () => {
    const fenced = "# T\n\n```md\n## Open questions\n- nope\n```\n";
    expect(parseQuestions(fenced)).toEqual([]);
  });

  it("list items end at a non-indented line", () => {
    const b = "- one\ntext\n- two";
    expect(listItems(b, 0, 3).map((i) => i.text)).toEqual(["one", "two"]);
  });
});

describe("helpers", () => {
  it("slugifies titles", () => {
    expect(slugify("Opening-hours change impact!")).toBe("opening-hours-change-impact");
  });
  it("replaces or inserts the H1", () => {
    expect(setH1("# Old\n\nx", "New")).toBe("# New\n\nx");
    expect(setH1("x", "New")).toBe("# New\n\nx");
  });
});
