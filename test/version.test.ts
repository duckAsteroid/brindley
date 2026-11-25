import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs build script without type declarations
import { classify } from "../scripts/version.mjs";
// @ts-expect-error — plain .mjs build script without type declarations
import { pinsVersion, pluginVersions, stampPlugin } from "../scripts/plugin-version.mjs";

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
  it("stamps one exact version into both plugin manifests and the core plugin's server", () => {
    const root = mkdtempSync(join(tmpdir(), "brindley-plugin-"));
    const dir = join(root, "plugin");
    const sidebar = join(root, "sidebar");
    try {
      mkdirSync(join(dir, ".claude-plugin"), { recursive: true });
      mkdirSync(join(sidebar, ".claude-plugin"), { recursive: true });
      writeFileSync(join(dir, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "brindley", version: "1.0.0" }));
      writeFileSync(join(sidebar, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "brindley-sidebar", version: "1.0.0" }));
      writeFileSync(
        join(dir, ".mcp.json"),
        JSON.stringify({ mcpServers: { core: { command: "npx", args: ["-y", "brindley@1.0.0", "serve", "--cwd", "${CLAUDE_PROJECT_DIR}"] } } }),
      );
      expect(pluginVersions(dir, sidebar)).toEqual({ manifest: "1.0.0", server: "1.0.0", sidebar: "1.0.0" });
      stampPlugin("1.1.0", dir, sidebar);
      expect(pluginVersions(dir, sidebar)).toEqual({ manifest: "1.1.0", server: "1.1.0", sidebar: "1.1.0" });
      expect(pinsVersion(pluginVersions(dir, sidebar), "1.1.0")).toBe(true);
      expect(JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8")).mcpServers.core.args).toEqual([
        "-y",
        "brindley@1.1.0",
        "serve",
        "--cwd",
        "${CLAUDE_PROJECT_DIR}",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses a sidebar left on another version", () => {
    expect(pinsVersion({ manifest: "1.1.0", server: "1.1.0", sidebar: "1.0.0" }, "1.1.0")).toBe(false);
  });

  it("pins the same version in the shipped plugins' manifests and server", () => {
    const v = pluginVersions();
    expect(v.manifest).toMatch(/^\d+\.\d+\.\d+$/);
    expect(v.server).toBe(v.manifest);
    expect(v.sidebar).toBe(v.manifest);
  });
});
