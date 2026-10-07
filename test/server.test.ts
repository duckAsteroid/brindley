import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { C, fixture, git, lockExample, type Fixture } from "./helpers.js";

let fx: Fixture;
afterEach(() => fx?.cleanup());

async function connect(cwd: string) {
  const server = createServer({ cwd });
  const client = new Client({ name: "test", version: "0.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

function json(res: unknown): any {
  const r = res as { content: { text: string }[]; isError?: boolean };
  if (r.isError) throw new Error(r.content[0]!.text);
  return JSON.parse(r.content[0]!.text);
}

describe("MCP server", () => {
  it("exposes the tools, prompts and resources", async () => {
    fx = fixture({ files: lockExample });
    const client = await connect(fx.repo);
    const tools = (await client.listTools()).tools.map((t) => t.name);
    for (const name of ["create_collection", "list", "get", "ready", "create", "resolve_question", "complete", "next_question", "tags"])
      expect(tools).toContain(name);
    const prompts = (await client.listPrompts()).prompts.map((p) => p.name);
    expect(prompts).toEqual(expect.arrayContaining(["design-review", "implement", "triage"]));
    const resources = (await client.listResources()).resources.map((r) => r.uri);
    expect(resources).toContain("brindley://index");
    expect(resources).toContain("brindley://initiative/slot-booking/21");
    expect(resources).toContain("brindley://tag/notifications");
  });

  it("answers what is ready and self-heals stale READMEs", async () => {
    fx = fixture({ files: lockExample });
    const client = await connect(fx.repo);
    const res = json(await client.callTool({ name: "ready", arguments: {} }));
    expect(res.result.map((r: { ref: string }) => r.ref)).toEqual(["slot-booking#21", "slot-booking#23"]);
    expect(res.notes.join(" ")).toMatch(/stale; regenerated/);
    const again = json(await client.callTool({ name: "ready", arguments: {} }));
    expect(again.notes).toBeUndefined();
  });

  it("creates, reads and reports touched files", async () => {
    fx = fixture({ files: lockExample });
    const client = await connect(fx.repo);
    const created = json(
      await client.callTool({
        name: "create",
        arguments: { collection: "slot-booking", title: "Slot pairing", type: "feature", depends_on: [20], tags: ["notifications"] },
      }),
    );
    expect(created.ref).toBe("slot-booking#24");
    expect(created.touched).toContain("docs/initiatives/LOCK-42/slot-booking/24-slot-pairing.md");
    const got = json(await client.callTool({ name: "get", arguments: { ref: "slot-booking#24" } }));
    expect(got.dependencies).toEqual([
      expect.objectContaining({ ref: "20", classification: "satisfied", title: "Slot calendar and read model" }),
    ]);
  });

  it("reports its version", async () => {
    fx = fixture({ files: lockExample });
    const client = await connect(fx.repo);
    const v = json(await client.callTool({ name: "version", arguments: {} }));
    expect(v.name).toBe("brindley");
    expect(v.version).toMatch(/^\d+\.\d+\.\d+(-SNAPSHOT)?$/);
    expect(client.getServerVersion()?.version).toBe(v.version);
    expect(client.getInstructions()).toMatch(/ignore:/);
  });

  it("returns tool errors rather than throwing", async () => {
    fx = fixture({ files: lockExample });
    const client = await connect(fx.repo);
    const res = (await client.callTool({ name: "set_status", arguments: { ref: 22, status: "designed" } })) as {
      isError?: boolean;
      content: { text: string }[];
    };
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toMatch(/blocking open question/);
  });

  it("builds the design-review prompt with the conversation rules", async () => {
    fx = fixture({ files: lockExample });
    const client = await connect(fx.repo);
    const p = await client.getPrompt({ name: "design-review", arguments: { ref: "22" } });
    const text = (p.messages[0]!.content as { text: string }).text;
    expect(text).toContain("Open chat, not forms");
    expect(text).toContain("1. Must captains with a booked slot");
    expect(text).toContain("Delegated to implementation (1");
  });

  it("points get and the prompts at a theme's overview doc", async () => {
    fx = fixture({
      files: { ...lockExample, [`${C}/NOTIFICATIONS.md`]: "---\ntheme: notifications\n---\n# Notifications map\n" },
    });
    const client = await connect(fx.repo);
    const res = json(await client.callTool({ name: "get", arguments: { ref: "sb#22" } }));
    const got = res.result ?? res; // first call self-heals the stale theme doc, so it carries notes
    expect(got.themes).toEqual([expect.objectContaining({ tag: "notifications", doc: `${C}/NOTIFICATIONS.md` })]);
    const p = await client.getPrompt({ name: "implement", arguments: { ref: "sb#22" } });
    expect((p.messages[0]!.content as { text: string }).text).toContain(`read the overview \`${C}/NOTIFICATIONS.md\``);
  });

  it("starts implement and spike briefs with a readiness check, and stops when it fails", async () => {
    fx = fixture({ files: lockExample });
    const client = await connect(fx.repo);
    const text = async (name: string, ref: string) =>
      ((await client.getPrompt({ name, arguments: { ref } })).messages[0]!.content as { text: string }).text;
    const ok = await text("implement", "sb#21");
    expect(ok).toMatch(/## Step 1 — verify it is ready \(do this first\)/);
    expect(ok).toContain("All checks pass");
    expect(ok).toContain("## While building");
    expect(ok).toMatch(/don't guess and build on the guess/);
    const blocked = await text("implement", "sb#22");
    expect(blocked).toContain("❌ **Dependencies:** blocked by 23 (designed)");
    expect(blocked).toContain("Stop here:** do not start work.");
    const res = json(await client.callTool({ name: "check_ready", arguments: { ref: "sb#22" } }));
    expect((res.result ?? res).ready).toBe(false);
    const spike = await text("spike", "sb#21");
    expect(spike).toContain("not necessarily throwaway");
    expect(spike).toContain("not `spike`");
  });

  it("reads an initiative resource", async () => {
    fx = fixture({ files: lockExample });
    const client = await connect(fx.repo);
    const r = await client.readResource({ uri: "brindley://initiative/slot-booking/21" });
    expect((r.contents[0] as { text: string }).text).toContain("# Lock sensor CSV import");
  });

  it("finds collections from a sub-directory of the repo", async () => {
    fx = fixture({ files: lockExample });
    const client = await connect(fx.repo + "/services/locks");
    const res = json(await client.callTool({ name: "collections", arguments: {} }));
    expect((res.result ?? res)[0]).toMatchObject({ collection: "slot-booking", path: "docs/initiatives/LOCK-42/slot-booking" });
  });

  it("suggests create_collection when there are no collections", async () => {
    fx = fixture({ files: {} });
    const client = await connect(fx.repo);
    const res = json(await client.callTool({ name: "list", arguments: {} }));
    expect(res.result).toEqual([]);
    expect(res.notes.join(" ")).toMatch(/create_collection/);
  });
});

describe("use_worktree", () => {
  it("switches the server to another worktree, names the checkout, and switches back", async () => {
    fx = fixture({ files: lockExample });
    const wt = `${fx.repo}-wt`;
    git(fx.repo, "worktree", "add", "-q", wt, "-b", "feature");
    try {
      const client = await connect(fx.repo);
      const text = (r: unknown) => (r as { content: { text: string }[] }).content.map((c) => c.text);
      // Not a worktree of this repo: refused.
      const bad = await client.callTool({ name: "use_worktree", arguments: { path: "/tmp" } });
      expect((bad as { isError?: boolean }).isError).toBe(true);
      // Before switching, with a worktree around: every reply names it, and a write warns.
      const early = await client.callTool({ name: "update", arguments: { ref: "sb#23", owner: "gates team" } });
      expect(text(early)[1]).toMatch(/^Checkout: .* \(where this server started, main\)\. Other worktrees: .*-wt on feature — if you are working in one, call use_worktree with its path\.$/);
      expect(json(early).warnings.at(-1)).toMatch(/^Written to .*, where this server started, but other worktrees exist \(.*-wt on feature\)\. If you are implementing in one, call use_worktree with its path first/);
      // Switch, then write: the edit lands in the worktree only.
      const sw = json(await client.callTool({ name: "use_worktree", arguments: { path: wt } }));
      expect(sw.switched).toBe(true);
      const upd = await client.callTool({ name: "update", arguments: { ref: "sb#22", owner: "locks team" } });
      expect(text(upd)[1]).toMatch(/^Checkout: .*-wt \(worktree, feature\)$/);
      expect(json(upd).warnings ?? []).toEqual([]); // switched: no nudge
      expect(readFileSync(join(wt, C, "22-opening-hours-change-impact.md"), "utf8")).toContain("owner: locks team");
      expect(readFileSync(join(fx.repo, C, "22-opening-hours-change-impact.md"), "utf8")).not.toContain("owner: locks team");
      // Back to where the server started.
      const back = json(await client.callTool({ name: "use_worktree", arguments: {} }));
      expect(back.switched).toBe(false);
      // A removed worktree is refused loudly, and use_worktree() still works.
      json(await client.callTool({ name: "use_worktree", arguments: { path: wt } }));
      rmSync(wt, { recursive: true, force: true });
      const gone = await client.callTool({ name: "list", arguments: {} });
      expect((gone as { isError?: boolean }).isError).toBe(true);
      expect(text(gone)[0]).toMatch(/no longer exists\. Call use_worktree\(\) to return to/);
      expect(json(await client.callTool({ name: "use_worktree", arguments: {} })).switched).toBe(false);
    } finally {
      rmSync(wt, { recursive: true, force: true });
    }
  });
});

describe("questions", () => {
  it("leaves out abandoned and superseded work unless asked for by ref", async () => {
    fx = fixture({
      files: {
        "plans/README.md": "---\nbrindley: 1\n---\n# Plans\n",
        "plans/01-gates.md": "---\nstatus: draft\n---\n# Gates\n\n## Open questions\n\n- Steel or oak?\n",
        "plans/02-cloud.md": "---\nstatus: abandoned\nstatus_note: Not needed\n---\n# Cloud\n\n## Open questions\n\n- Which renderer?\n",
        "plans/03-old.md": "---\nstatus: superseded\nsuperseded_by: 1\n---\n# Old gates\n\n## Open questions\n\n- Hinges?\n",
        "plans/04-later.md": "---\nstatus: deferred\n---\n# Later\n\n## Open questions\n\n- When?\n",
      },
    });
    const client = await connect(fx.repo);
    const res = json(await client.callTool({ name: "questions", arguments: {} }));
    const all = res.result ?? res; // notes ride along when READMEs were regenerated
    expect(all.map((x: { ref: string }) => x.ref)).toEqual(["plans#1", "plans#4"]);
    const one = json(await client.callTool({ name: "questions", arguments: { ref: "plans#2" } }));
    expect(one[0].questions[0].text).toBe("Which renderer?");
  });
});
