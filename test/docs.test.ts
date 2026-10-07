import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fixture, write, type Fixture } from "./helpers.js";
import { checkDocs, docsGlobs, isProjectDoc, matchesGlobs } from "../src/docs.js";
import * as ops from "../src/ops.js";
import { resolveRef } from "../src/repo.js";

let fx: Fixture;
afterEach(() => fx?.cleanup());

describe("docs globs with exclusions", () => {
  it("applies patterns in order, last match winning", () => {
    const globs = ["site/**/*.md", "!site/releases.md"];
    expect(matchesGlobs(globs, "site/guide/concepts.md")).toBe(true);
    expect(matchesGlobs(globs, "site/releases.md")).toBe(false);
    expect(matchesGlobs(globs, "README.md")).toBe(false);
    // A later positive pattern re-includes.
    expect(matchesGlobs(["site/**/*.md", "!site/archive/**", "site/archive/index.md"], "site/archive/index.md")).toBe(true);
    expect(matchesGlobs(["site/**/*.md", "!site/archive/**", "site/archive/index.md"], "site/archive/old.md")).toBe(false);
    // Order matters: an exclusion before the pattern it would narrow has no effect.
    expect(matchesGlobs(["!site/releases.md", "site/**/*.md"], "site/releases.md")).toBe(true);
  });

  it("selects nothing with only exclusions", () => {
    expect(matchesGlobs(["!site/releases.md"], "site/guide/concepts.md")).toBe(false);
    expect(matchesGlobs(["!site/releases.md"], "site/releases.md")).toBe(false);
  });

  it("keeps each collection's list separate, so one can't re-include what another excludes", () => {
    fx = fixture({
      files: {
        "a/README.md": '---\nbrindley: 1\ndocs: ["site/**/*.md", "!site/releases.md"]\n---\n# A\n',
        "b/README.md": '---\nbrindley: 1\ndocs: ["docs/*.md"]\n---\n# B\n',
      },
    });
    const root = fx.load();
    expect(docsGlobs(root)).toEqual([["site/**/*.md", "!site/releases.md"], ["docs/*.md"]]);
    expect(isProjectDoc(root, "site/releases.md", docsGlobs(root))).toBe(false);
    expect(isProjectDoc(root, "site/guide.md", docsGlobs(root))).toBe(true);
    expect(isProjectDoc(root, "docs/locks.md", docsGlobs(root))).toBe(true);
  });

  it("leaves an excluded page out of check_docs and refuses it as docs_impact", () => {
    fx = fixture({
      files: {
        "plans/README.md": '---\nbrindley: 1\ndocs: ["site/**/*.md", "!site/releases.md"]\n---\n# Plans\n',
        "plans/1-lock-times.md": "---\nstatus: in-progress\n---\n# Lock times\n\n## Acceptance criteria\n\n- Shown.\n",
        "site/guide.md": "# Guide\n",
        "site/releases.md": "# Releases\n",
      },
    });
    write(fx.repo, "site/releases.md", "# Releases\n\nLock times were previously hidden; we added them.\n");
    write(fx.repo, "site/guide.md", "# Guide\n\nLock times are shown on the slot page.\n");
    const root = fx.load();
    const { checked, findings } = checkDocs(root);
    expect(checked).toEqual(["site/guide.md"]);
    expect(findings).toEqual([]);
    expect(() => ops.complete(root, resolveRef(root, "plans#1"), ["site/releases.md"])).toThrow(/not project documentation/);
    ops.complete(fx.load(), resolveRef(fx.load(), "plans#1"), ["site/guide.md"]);
    expect(readFileSync(join(fx.repo, "plans/1-lock-times.md"), "utf8")).toContain("status: done");
  });
});
