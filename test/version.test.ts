import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs build script without type declarations
import { classify } from "../scripts/version.mjs";

describe("version bumps from Conventional Commits", () => {
  it("follows the gradle-versioning rules", () => {
    expect(classify("feat: add x").bump).toBe("minor");
    expect(classify("feat(server): add x").bump).toBe("minor");
    expect(classify("fix: y").bump).toBe("patch");
    expect(classify("perf: y").bump).toBe("patch");
    expect(classify("docs: z").bump).toBe("none");
    expect(classify("chore(deps): z").bump).toBe("none");
    expect(classify("feat!: break").bump).toBe("major");
    expect(classify("refactor: r", "BREAKING CHANGE: gone").bump).toBe("major");
    expect(classify("Update stuff")).toMatchObject({ bump: "patch", nonConventional: true });
    expect(classify("wibble: odd type")).toMatchObject({ bump: "patch", nonConventional: true });
  });
});
