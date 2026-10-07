import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { git } from "./helpers.js";
// @ts-expect-error — plain .mjs script without type declarations
import { changelogMarkdown, releaseMarkdown, releases } from "../scripts/changelog.mjs";

let repo: string;
afterEach(() => rmSync(repo, { recursive: true, force: true }));

/** A repo with a commit per message; `tag` after a message tags that commit. */
function history(steps: ({ commit: string; body?: string } | { tag: string; message?: string })[]): string {
  repo = mkdtempSync(join(tmpdir(), "brindley-changelog-"));
  git(repo, "init", "-q", "-b", "main");
  let n = 0;
  for (const s of steps) {
    if ("commit" in s) {
      writeFileSync(join(repo, "f.txt"), String(n++));
      git(repo, "add", "-A");
      git(repo, "commit", "-q", "-m", s.commit, ...(s.body ? ["-m", s.body] : []));
    } else if (s.message) git(repo, "tag", "-a", s.tag, "-m", s.message);
    else git(repo, "tag", s.tag);
  }
  return repo;
}

describe("release notes from tags and commits", () => {
  it("groups feat, fix, perf and breaking commits per release, newest first, leaving the rest out", () => {
    const cwd = history([
      { commit: "feat: lock slots" },
      { tag: "v1.0.0" },
      { commit: "fix(booking): double bookings" },
      { commit: "docs: tidy" },
      { commit: "chore: deps" },
      { commit: "perf: faster lookups" },
      { commit: "feat!: new slot format" },
      { commit: "refactor: move code", body: "BREAKING CHANGE: old API removed" },
      { tag: "v2.0.0", message: "Slots, rebuilt." },
      { commit: "test: more" },
      { tag: "v2.0.1" },
      { tag: "v2.0.2-rc.1" },
    ]);
    const rs = releases(cwd);
    expect(rs.map((r: { tag: string }) => r.tag)).toEqual(["v2.0.1", "v2.0.0", "v1.0.0"]); // final tags only
    const [patch, major, first] = rs;
    expect(major.highlights).toBe("Slots, rebuilt.");
    expect(major.previous).toBe("v1.0.0");
    const texts = (g: { text: string; scope: string | null }[]) => g.map((e) => (e.scope ? `${e.scope}: ${e.text}` : e.text));
    expect(texts(major.details.breaking)).toEqual(["move code", "new slot format"]);
    expect(texts(major.details.features)).toEqual([]);
    expect(texts(major.details.fixes)).toEqual(["booking: double bookings"]);
    expect(texts(major.details.performance)).toEqual(["faster lookups"]);
    expect(first.highlights).toBeNull(); // a plain tag has no highlights
    expect(texts(first.details.features)).toEqual(["lock slots"]);
    expect(patch.highlights).toBeNull();
    expect(Object.values(patch.details).flat()).toEqual([]);
  });

  it("renders highlights, then details, with commit and compare links", () => {
    const cwd = history([{ commit: "feat: lock slots" }, { tag: "v1.0.0" }, { commit: "fix(booking): double bookings" }, { tag: "v1.0.1", message: "Bookings fixed." }]);
    const [r] = releases(cwd);
    const md = releaseMarkdown(r, "https://github.com/example/locks");
    expect(md).toMatch(/^Bookings fixed\.\n\n### Fixes\n\n- \*\*booking:\*\* double bookings \(\[[0-9a-f]+\]\(https:\/\/github\.com\/example\/locks\/commit\/[0-9a-f]+\)\)\n/);
    expect(md).toContain("[All changes since v1.0.0](https://github.com/example/locks/compare/v1.0.0...v1.0.1)");
  });

  it("says when a release has only maintenance commits", () => {
    const cwd = history([{ commit: "feat: x" }, { tag: "v1.0.0" }, { commit: "chore: y" }, { tag: "v1.0.1" }]);
    const md = changelogMarkdown(releases(cwd), null);
    expect(md).toMatch(/## 1\.0\.1 — \d{4}-\d{2}-\d{2}\n\n_No feature, fix or performance changes — maintenance only\._/);
    expect(md).toContain("## 1.0.0");
  });
});
