import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { BEGIN, END } from "../src/readme.js";
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

  it("answers what is ready and leaves a stale README alone", async () => {
    fx = fixture({ files: lockExample });
    const before = readFileSync(join(fx.repo, C, "README.md"), "utf8");
    const client = await connect(fx.repo);
    const res = json(await client.callTool({ name: "ready", arguments: {} }));
    expect(res.map((r: { ref: string }) => r.ref)).toEqual(["slot-booking#21", "slot-booking#23"]);
    expect(readFileSync(join(fx.repo, C, "README.md"), "utf8")).toBe(before);
  });

  it("heals a generated block left with conflict markers", async () => {
    const conflicted = [
      BEGIN,
      "",
      "<<<<<<< HEAD",
      "| 24 | Slot pairing |",
      "=======",
      "| 24 | Lock-keeper rota |",
      ">>>>>>> agent-b",
      "",
      END,
    ].join("\n");
    fx = fixture({ files: { ...lockExample, [`${C}/README.md`]: `${lockExample[`${C}/README.md`]}\n${conflicted}\n` } });
    const client = await connect(fx.repo);
    const res = json(await client.callTool({ name: "list", arguments: {} }));
    expect(res.notes.join(" ")).toMatch(/README\.md was conflicted; regenerated/);
    const text = readFileSync(join(fx.repo, C, "README.md"), "utf8");
    expect(text).not.toMatch(/^(<<<<<<<|=======|>>>>>>>)/m);
    expect(text).toContain(BEGIN);
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
    expect(text).toContain("- Q1 (provisional) Must captains with a booked slot");
    expect(text).toContain("Delegated to implementation (1");
  });

  it("points get and the prompts at a theme's overview doc", async () => {
    fx = fixture({
      files: { ...lockExample, [`${C}/NOTIFICATIONS.md`]: "---\ntheme: notifications\n---\n# Notifications map\n" },
    });
    const client = await connect(fx.repo);
    const res = json(await client.callTool({ name: "get", arguments: { ref: "sb#22" } }));
    expect(res.themes).toEqual([expect.objectContaining({ tag: "notifications", doc: `${C}/NOTIFICATIONS.md` })]);
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

  it("returns each workflow prompt's text from the brief tool", async () => {
    fx = fixture({ files: lockExample });
    const client = await connect(fx.repo);
    const promptText = async (name: string, args: Record<string, string>) =>
      ((await client.getPrompt({ name, arguments: args })).messages[0]!.content as { text: string }).text;
    const briefText = async (args: Record<string, unknown>) => {
      const r = (await client.callTool({ name: "brief", arguments: args })) as { content: { text: string }[]; isError?: boolean };
      if (r.isError) throw new Error(r.content[0]!.text);
      return r.content[0]!.text;
    };
    for (const workflow of ["design-review", "implement", "spike"])
      expect(await briefText({ workflow, ref: "sb#22" })).toBe(await promptText(workflow, { ref: "sb#22" }));
    expect(await briefText({ workflow: "triage", collection: "sb" })).toBe(await promptText("triage", { collection: "sb" }));
    await expect(briefText({ workflow: "implement" })).rejects.toThrow(/needs a ref/);
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

describe("worktree argument", () => {
  const text = (r: unknown) => (r as { content: { text: string }[] }).content.map((c) => c.text);
  const refused = (r: unknown) => (r as { isError?: boolean }).isError === true;
  const owner = (dir: string, file = "22-opening-hours-change-impact.md") => /^owner: (.*)$/m.exec(readFileSync(join(dir, C, file), "utf8"))?.[1];

  it("works without it while there are no other worktrees, and leaves results unmarked", async () => {
    fx = fixture({ files: lockExample });
    const client = await connect(fx.repo);
    const upd = await client.callTool({ name: "update", arguments: { ref: "sb#22", owner: "locks team" } });
    expect(json(upd).worktree).toBeUndefined();
    expect(text(upd)[1]).toMatch(/^Checkout: [^ ]+ \(main\)$/);
    expect(owner(fx.repo)).toBe("locks team");
    expect(json(await client.callTool({ name: "get", arguments: { ref: "sb#22" } })).worktree).toBeUndefined();
  });

  it("sends each call to the checkout it names, interleaved, on one server", async () => {
    fx = fixture({ files: lockExample });
    const a = `${fx.repo}-a`;
    const b = `${fx.repo}-b`;
    git(fx.repo, "worktree", "add", "-q", a, "-b", "feature-a");
    git(fx.repo, "worktree", "add", "-q", b, "-b", "feature-b");
    try {
      const client = await connect(fx.repo);
      const set = (worktree: string, who: string) => client.callTool({ name: "update", arguments: { ref: "sb#22", owner: who, worktree } });
      // Interleaved writes from "two subagents" and "the parent": none moves another.
      const ra = await set(a, "agent a");
      const rp = await set(".", "parent");
      const rb = await set(`../${b.split("/").at(-1)}`, "agent b"); // relative to the starting checkout
      const ra2 = await set(a, "agent a again");
      expect(owner(a)).toBe("agent a again");
      expect(owner(b)).toBe("agent b");
      expect(owner(fx.repo)).toBe("parent");
      // Each result names the checkout it used, in the JSON and in the Checkout line.
      expect(json(ra).worktree).toBe(`../${a.split("/").at(-1)}`);
      expect(json(rp).worktree).toBe(".");
      expect(json(rb).worktree).toBe(`../${b.split("/").at(-1)}`);
      expect(text(ra2)[1]).toMatch(/^Checkout: .*-a \(worktree, feature-a\)$/);
      expect(text(rp)[1]).toMatch(/^Checkout: .* \(where this server started, main\)\. Other worktrees: .*-a on feature-a; .*-b on feature-b — if you are working in one, pass its path as `worktree`\.$/);
      // Reads are never refused, and say which checkout they read; array results are wrapped.
      const read = json(await client.callTool({ name: "get", arguments: { ref: "sb#22" } }));
      expect(read.worktree).toBe(".");
      expect(read.owner ?? read.result?.owner).toBe("parent");
      const list = json(await client.callTool({ name: "list", arguments: { worktree: b } }));
      expect(list.worktree).toBe(`../${b.split("/").at(-1)}`);
      expect(list.result.find((i: { ref: string }) => i.ref === "slot-booking#22")).toBeTruthy();
      // A dry run is not a write.
      expect(refused(await client.callTool({ name: "fix", arguments: {} }))).toBe(false);
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });

  it("refuses a write that names no worktree while others exist, saying which look finished or prunable", async () => {
    fx = fixture({ files: lockExample });
    const done = `${fx.repo}-done`;
    const busy = `${fx.repo}-busy`;
    const gone = `${fx.repo}-gone`;
    git(fx.repo, "worktree", "add", "-q", done, "-b", "merged-work");
    git(fx.repo, "worktree", "add", "-q", busy, "-b", "open-work");
    git(fx.repo, "worktree", "add", "-q", gone, "-b", "lost-work");
    try {
      git(busy, "commit", "-q", "--allow-empty", "-m", "wip");
      rmSync(gone, { recursive: true, force: true });
      const client = await connect(fx.repo);
      const res = await client.callTool({ name: "update", arguments: { ref: "sb#22", owner: "nobody" } });
      expect(refused(res)).toBe(true);
      const msg = text(res)[0]!;
      expect(msg).toMatch(/^Refused: this write names no `worktree`/);
      expect(msg).toMatch(/-done on merged-work — everything on it is in main and nothing is uncommitted: if its work is finished, remove it \(git worktree remove \.\.\/[^)]*-done\)/);
      expect(msg).toMatch(/-busy on open-work\n/);
      expect(msg).not.toMatch(/-busy on open-work —/);
      expect(msg).toMatch(/Prunable \(folder gone\): .*-gone on lost-work — run git worktree prune\./);
      expect(msg).toMatch(/Pass `worktree`: .* or "\." for /);
      expect(owner(fx.repo)).not.toBe("nobody");
      // A worktree whose folder is gone can't be targeted, and alone doesn't trigger the refusal.
      expect(refused(await client.callTool({ name: "list", arguments: { worktree: gone } }))).toBe(true);
      git(fx.repo, "worktree", "remove", done);
      git(fx.repo, "worktree", "remove", "--force", busy);
      const after = await client.callTool({ name: "update", arguments: { ref: "sb#22", owner: "somebody" } });
      expect(refused(after)).toBe(false);
      expect(owner(fx.repo)).toBe("somebody");
    } finally {
      for (const d of [done, busy, gone]) rmSync(d, { recursive: true, force: true });
    }
  });

  it("refuses a path that isn't a live worktree, listing those that are", async () => {
    fx = fixture({ files: lockExample });
    const wt = `${fx.repo}-wt`;
    git(fx.repo, "worktree", "add", "-q", wt, "-b", "feature");
    try {
      const client = await connect(fx.repo);
      const bad = await client.callTool({ name: "get", arguments: { ref: "sb#22", worktree: "/tmp" } });
      expect(refused(bad)).toBe(true);
      expect(text(bad)[0]).toMatch(/^\/tmp is not a worktree of the repository at .*\. Its worktrees: "\." \(.*, where this server started\); \.\.\/.*-wt on feature\.$/);
      // Removing a worktree affects only calls that name it.
      rmSync(wt, { recursive: true, force: true });
      expect(refused(await client.callTool({ name: "get", arguments: { ref: "sb#22", worktree: wt } }))).toBe(true);
      expect(refused(await client.callTool({ name: "update", arguments: { ref: "sb#22", owner: "x" } }))).toBe(false);
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
