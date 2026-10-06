import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { fixture, lockExample, type Fixture } from "./helpers.js";

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
    for (const name of ["init", "create_collection", "list", "get", "ready", "create", "resolve_question", "complete", "next_question", "tags"])
      expect(tools).toContain(name);
    const prompts = (await client.listPrompts()).prompts.map((p) => p.name);
    expect(prompts).toEqual(expect.arrayContaining(["design-review", "implement", "triage"]));
    const resources = (await client.listResources()).resources.map((r) => r.uri);
    expect(resources).toContain("brindley://index");
    expect(resources).toContain("brindley://initiative/LOCK-42/slot-booking/21");
    expect(resources).toContain("brindley://tag/notifications");
  });

  it("answers what is ready and self-heals stale READMEs", async () => {
    fx = fixture({ files: lockExample });
    const client = await connect(fx.repo);
    const res = json(await client.callTool({ name: "ready", arguments: {} }));
    expect(res.result.map((r: { ref: string }) => r.ref)).toEqual(["LOCK-42/slot-booking#21", "LOCK-42/slot-booking#23"]);
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
        arguments: { collection: "LOCK-42/slot-booking", title: "Slot pairing", type: "feature", depends_on: [20], tags: ["notifications"] },
      }),
    );
    expect(created.ref).toBe("LOCK-42/slot-booking#24");
    expect(created.touched).toContain("docs/initiatives/LOCK-42/slot-booking/24-slot-pairing.md");
    expect(created.touched).toContain("docs/initiatives/README.md");
    const got = json(await client.callTool({ name: "get", arguments: { ref: "LOCK-42/slot-booking#24" } }));
    expect(got.dependencies).toEqual([
      expect.objectContaining({ ref: "20", classification: "satisfied", title: "Slot calendar and read model" }),
    ]);
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

  it("reads an initiative resource", async () => {
    fx = fixture({ files: lockExample });
    const client = await connect(fx.repo);
    const r = await client.readResource({ uri: "brindley://initiative/LOCK-42/slot-booking/21" });
    expect((r.contents[0] as { text: string }).text).toContain("# Lock sensor CSV import");
  });

  it("finds the root from a sub-directory of the repo", async () => {
    fx = fixture({ files: lockExample });
    const client = await connect(fx.repo + "/services/locks");
    const res = json(await client.callTool({ name: "collections", arguments: {} }));
    expect((res.result ?? res)[0].collection).toBe("LOCK-42/slot-booking");
  });

  it("tells you to init when there is no root", async () => {
    fx = fixture({ files: lockExample });
    const client = await connect(fx.repo);
    const res = (await client.callTool({ name: "list", arguments: {} })) as { isError?: boolean };
    expect(res.isError).toBeFalsy();
    const bare = await connect("/");
    const none = (await bare.callTool({ name: "list", arguments: {} })) as { isError?: boolean; content: { text: string }[] };
    expect(none.isError).toBe(true);
    expect(none.content[0]!.text).toMatch(/init/);
  });
});
