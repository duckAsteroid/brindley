import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs build script without type declarations
import { classify } from "../scripts/version.mjs";
// @ts-expect-error — plain .mjs build script without type declarations
import { pluginVersions, stampPlugin } from "../scripts/plugin-version.mjs";

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

describe("plugin version", () => {
  it("stamps one exact version into the plugin manifest and its server", () => {
    const dir = mkdtempSync(join(tmpdir(), "brindley-plugin-"));
    try {
      mkdirSync(join(dir, ".claude-plugin"));
      writeFileSync(join(dir, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "brindley", version: "1.0.0" }));
      writeFileSync(
        join(dir, ".mcp.json"),
        JSON.stringify({ mcpServers: { brindley: { command: "npx", args: ["-y", "brindley@1.0.0", "serve", "--cwd", "${CLAUDE_PROJECT_DIR}"] } } }),
      );
      expect(pluginVersions(dir)).toEqual({ manifest: "1.0.0", server: "1.0.0" });
      stampPlugin("1.1.0", dir);
      expect(pluginVersions(dir)).toEqual({ manifest: "1.1.0", server: "1.1.0" });
      expect(JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8")).mcpServers.brindley.args).toEqual([
        "-y",
        "brindley@1.1.0",
        "serve",
        "--cwd",
        "${CLAUDE_PROJECT_DIR}",
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("pins the same version in the shipped plugin's manifest and server", () => {
    const v = pluginVersions();
    expect(v.manifest).toMatch(/^\d+\.\d+\.\d+$/);
    expect(v.server).toBe(v.manifest);
  });
});
