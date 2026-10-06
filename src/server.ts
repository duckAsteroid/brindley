import { readFileSync } from "node:fs";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { STATUSES, type Initiative, type Root } from "./model.js";
import {
  BrindleyError,
  allInitiatives,
  findCollection,
  initiativeKey,
  declaredTags,
  loadRoot,
  lookup,
  openRepo,
  resolveRef,
} from "./repo.js";
import { blockers, dependants, dependencyReport, displayRef, isActive, isReady, target, topoSort } from "./deps.js";
import { collectionBlock, mermaid, regenerate, rootBlock } from "./readme.js";
import { mergeInProgress } from "./git.js";
import { validate } from "./validate.js";
import { checkDocs } from "./docs.js";
import * as ops from "./ops.js";

export const VERSION = "0.1.0";

export interface ServerOptions {
  cwd: string;
  autoReadme?: boolean;
}

const refArg = z.union([z.string(), z.number()]).describe('Initiative: "collection#n", a bare number, or a path.');
const refList = z.array(z.union([z.string(), z.number()]));

function summary(root: Root, i: Initiative) {
  const open = i.questions.filter((q) => !q.resolved);
  return {
    ref: initiativeKey(i),
    collection: i.collection,
    number: i.number,
    title: i.title,
    type: i.type ?? null,
    status: i.status ?? null,
    statusAsWritten: i.statusRaw ?? null,
    statusFrom: i.statusSource ?? null,
    statusNote: i.statusNote ?? null,
    owner: i.owner ?? null,
    tags: i.tags,
    ready: isReady(root, i),
    blockedBy: blockers(root, i).map((d) => d.ref),
    openQuestions: open.filter((q) => !q.implementation).length,
    implementationQuestions: open.filter((q) => q.implementation).length,
    path: i.rel,
  };
}

function detail(root: Root, i: Initiative) {
  return {
    ...summary(root, i),
    frontMatter: i.fm,
    dependencies: dependencyReport(root, i),
    related: i.related.map((r) => {
      const t = target(root, r);
      return { ref: displayRef(r, i.collection), title: t?.title ?? null, status: t?.status ?? null };
    }),
    dependants: dependants(root, i).map((d) => ({ ref: initiativeKey(d), title: d.title, status: d.status })),
    questions: i.questions.map((q) => ({ index: q.index, text: q.text, resolved: q.resolved, implementation: q.implementation })),
    acceptanceCriteria: i.acceptance,
    docs: i.docs,
    docsImpact: i.docsImpact ?? null,
    body: i.body,
  };
}

function agentFile(root: Root, i: Initiative): string | undefined {
  return findCollection(root, i.collection)?.meta.agent;
}

export function createServer(opts: ServerOptions): McpServer {
  const server = new McpServer({ name: "brindley", version: VERSION });

  const open = (): { root: Root; notes: string[] } => {
    let root = openRepo(opts.cwd);
    const notes: string[] = [];
    if (root.collections.length === 0)
      notes.push("No collections in this repository yet. Mark a folder as one with create_collection.");
    if (opts.autoReadme !== false) {
      const onlyConflicted = mergeInProgress(root.repoRoot);
      const changes = regenerate(root, { onlyConflicted });
      if (changes.length) {
        for (const c of changes)
          notes.push(`${c.path.slice(root.repoRoot.length + 1)} was ${c.reason === "conflict" ? "conflicted" : "stale"}; regenerated.`);
        root = loadRoot(root.repoRoot);
      }
    }
    return { root, notes };
  };

  const reply = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
  const fail = (e: unknown) => ({
    isError: true,
    content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }],
  });

  /** Register a tool whose handler receives a freshly loaded (and self-healed) root. */
  const tool = <S extends z.ZodRawShape>(
    name: string,
    description: string,
    shape: S,
    handler: (root: Root, args: z.infer<z.ZodObject<S>>) => unknown,
    annotations: { readOnlyHint?: boolean } = {},
  ) => {
    server.registerTool(name, { description, inputSchema: shape, annotations }, (async (args: z.infer<z.ZodObject<S>>) => {
      try {
        const { root, notes } = open();
        const out = handler(root, args) as Record<string, unknown> | unknown;
        if (out && typeof out === "object" && "touched" in (out as object) && "result" in (out as object)) {
          const r = out as ops.OpResult;
          return reply({ ...(r.result as object), touched: r.touched, warnings: r.warnings, ...(notes.length ? { notes } : {}) });
        }
        return reply(notes.length ? { result: out, notes } : out);
      } catch (e) {
        return fail(e);
      }
    }) as never);
  };

  // --- Setup ------------------------------------------------------------------

  const collectionFields = {
    title: z.string().optional(),
    types: z.array(z.string()).optional().describe("Initiative types this collection uses; others are flagged"),
    tags: z.record(z.string(), z.string()).optional().describe("Tags (themes) with one-line descriptions"),
    summary: z.string().optional(),
    owner: z.string().optional(),
    link: z.string().optional().describe("External ticket/epic URL"),
    agent: z.string().optional().describe("Repo workflow agent file for this collection"),
    docs: z.array(z.string()).optional().describe("Globs of project docs this collection usually affects"),
  };

  tool(
    "create_collection",
    "Mark a folder as a collection: adds `brindley: 1` and the given details to its README.md front-matter, creating the folder and README if needed. Works on a folder that already holds numbered initiative files. The first collection in a repo also returns the agent-instructions snippet for AGENTS.md / CLAUDE.md.",
    {
      path: z.string().describe('Folder relative to the repo root, e.g. "docs/initiatives/LOCK-42/slot-booking"'),
      name: z.string().optional().describe("Short name used in references (name#n); defaults to the folder name"),
      ...collectionFields,
    },
    (root, a) => ops.createCollection(root, a.path, a),
  );

  tool(
    "update_collection",
    "Edit a collection README's details, including its status (active | done | abandoned).",
    { collection: z.string().describe("Collection name or folder path"), status: z.enum(["active", "done", "abandoned"]).optional(), ...collectionFields },
    (root, a) => ops.updateCollection(root, a.collection, a),
  );

  // --- Reading ----------------------------------------------------------------

  tool(
    "collections",
    "Every collection with its details, counts by initiative status, and number ready.",
    {},
    (root) =>
      root.collections.map((c) => {
        const count = (s: string) => c.initiatives.filter((i) => i.status === s).length;
        return {
          collection: c.name,
          path: c.path,
          ...c.meta,
          counts: Object.fromEntries(STATUSES.map((s) => [s, count(s)])),
          ready: c.initiatives.filter((i) => isReady(root, i)).length,
        };
      }),
    { readOnlyHint: true },
  );

  tool(
    "list",
    "List initiatives (whole root unless `collection` is given), optionally filtered.",
    {
      collection: z.string().optional(),
      type: z.string().optional(),
      status: z.string().optional(),
      tag: z.string().optional(),
      owner: z.string().optional(),
      ready: z.boolean().optional(),
    },
    (root, a) =>
      allInitiatives(root)
        .filter((i) => !a.collection || i.collection === a.collection)
        .filter((i) => !a.type || i.type === a.type)
        .filter((i) => !a.status || i.status === a.status)
        .filter((i) => !a.tag || i.tags.includes(a.tag))
        .filter((i) => !a.owner || i.owner === a.owner)
        .filter((i) => a.ready === undefined || isReady(root, i) === a.ready)
        .map((i) => summary(root, i)),
    { readOnlyHint: true },
  );

  tool(
    "get",
    "Full detail of one initiative, including its dependency report (each dependency classified satisfied / blocking / external / missing), dependants, open questions and acceptance criteria.",
    { ref: refArg, collection: z.string().optional() },
    (root, a) => detail(root, resolveRef(root, a.ref, a.collection)),
    { readOnlyHint: true },
  );

  tool(
    "ready",
    "Initiatives that are designed with nothing blocking — what an agent can pick up now — in suggested order (prerequisites first).",
    { collection: z.string().optional(), type: z.string().optional() },
    (root, a) =>
      topoSort(
        root,
        allInitiatives(root).filter(
          (i) => isReady(root, i) && (!a.collection || i.collection === a.collection) && (!a.type || i.type === a.type),
        ),
      ).map((i) => ({ ...summary(root, i), external: dependencyReport(root, i).filter((d) => d.classification === "external").map((d) => d.ref) })),
    { readOnlyHint: true },
  );

  tool(
    "graph",
    "Dependency graph as an adjacency list plus Mermaid: a collection's active work, one initiative's neighbourhood, or a tag (theme) across collections.",
    { collection: z.string().optional(), ref: refArg.optional(), tag: z.string().optional(), include_done: z.boolean().optional() },
    (root, a) => {
      let items: Initiative[];
      let from = a.collection ?? "";
      if (a.ref !== undefined) {
        const i = resolveRef(root, a.ref, a.collection);
        from = i.collection;
        const deps = i.dependsOn.map((r) => target(root, r)).filter((x): x is Initiative => !!x);
        items = [i, ...deps, ...dependants(root, i)];
      } else if (a.tag) {
        items = allInitiatives(root).filter((i) => i.tags.includes(a.tag!));
      } else {
        items = a.collection ? (findCollection(root, a.collection)?.initiatives ?? []) : allInitiatives(root);
      }
      if (!a.include_done && a.ref === undefined) items = items.filter(isActive);
      const unique = [...new Map(items.map((i) => [initiativeKey(i), i])).values()];
      return {
        nodes: unique.map((i) => ({ ref: initiativeKey(i), title: i.title, status: i.status, ready: isReady(root, i) })),
        edges: unique.flatMap((i) => i.dependsOn.map((r) => ({ from: r.kind === "initiative" ? `${r.collection}#${r.number}` : r.raw, to: initiativeKey(i) }))),
        mermaid: mermaid(root, unique, from),
      };
    },
    { readOnlyHint: true },
  );

  tool(
    "questions",
    "Unresolved open questions, grouped by initiative.",
    { collection: z.string().optional(), ref: refArg.optional(), include_implementation: z.boolean().optional() },
    (root, a) => {
      const items = a.ref !== undefined ? [resolveRef(root, a.ref, a.collection)] : allInitiatives(root).filter((i) => !a.collection || i.collection === a.collection);
      return items
        .map((i) => ({
          ref: initiativeKey(i),
          title: i.title,
          status: i.status,
          questions: i.questions
            .filter((q) => !q.resolved && (a.include_implementation !== false || !q.implementation))
            .map((q) => ({ index: q.index, text: q.text, implementation: q.implementation })),
        }))
        .filter((x) => x.questions.length > 0);
    },
    { readOnlyHint: true },
  );

  tool(
    "next_question",
    "The next unresolved blocking question in one initiative (after `after`, if given), with the count remaining. Drives the design-review conversation.",
    { ref: refArg, collection: z.string().optional(), after: z.number().int().optional() },
    (root, a) => ops.nextQuestion(resolveRef(root, a.ref, a.collection), a.after),
    { readOnlyHint: true },
  );

  tool(
    "tags",
    "Every tag (theme) in use plus declared-but-unused ones, with descriptions and counts by status.",
    {},
    (root) => {
      const declared = declaredTags(root);
      const names = new Set([...allInitiatives(root).flatMap((i) => i.tags), ...Object.keys(declared ?? {})]);
      return [...names].sort().map((tag) => {
        const items = allInitiatives(root).filter((i) => i.tags.includes(tag));
        const counts: Record<string, number> = {};
        for (const i of items) counts[i.status ?? "?"] = (counts[i.status ?? "?"] ?? 0) + 1;
        return { tag, description: declared?.[tag] ?? null, declared: !!declared && tag in declared, total: items.length, counts };
      });
    },
    { readOnlyHint: true },
  );

  tool(
    "validate",
    "Check initiatives and collection structure: missing or unknown statuses, status vs folder vs body-prose disagreements, files not in their collection's status folder, duplicate numbers, dangling references, cycles, broken links (with where a moved file now lives), stale READMEs. Returns errors and warnings with file and line.",
    {
      collection: z.string().optional(),
      rules: z.array(z.string()).optional().describe('Only these rules, e.g. ["status-not-in-folder", "status-prose-mismatch"]'),
      docs: z.boolean().optional().describe("Also lint project docs"),
    },
    (root, a) => validate(root, { collection: a.collection, docs: a.docs }).filter((f) => !a.rules?.length || a.rules.includes(f.rule)),
    { readOnlyHint: true },
  );

  tool(
    "check_docs",
    "Lint project docs for history phrasing, design debate and links into initiatives (docs must describe only what the code is). Defaults to docs changed vs HEAD.",
    { paths: z.array(z.string()).optional() },
    (root, a) => checkDocs(root, a.paths),
    { readOnlyHint: true },
  );

  // --- Writing ----------------------------------------------------------------

  tool(
    "create",
    "Create a new initiative. The number is coined automatically by scanning the working tree, other worktrees, branches and history. A folder path that isn't a collection yet is marked as one.",
    {
      collection: z.string().describe("Collection name, or a folder path"),
      title: z.string(),
      type: z.string().optional().describe("feature, bug, refactor, perf, docs, chore, spike, …"),
      tags: z.array(z.string()).optional(),
      goal: z.string().optional(),
      depends_on: refList.optional(),
      related: refList.optional(),
      owner: z.string().optional(),
    },
    (root, a) => ops.create(root, a),
  );

  tool(
    "update",
    "Edit an initiative's front-matter fields or H1, or replace a named body section. Cannot change its number or filename.",
    {
      ref: refArg,
      collection: z.string().optional(),
      title: z.string().optional(),
      type: z.string().optional(),
      owner: z.string().optional(),
      tags: z.array(z.string()).optional(),
      status_note: z.string().optional(),
      docs: z.array(z.string()).optional(),
      section: z.string().optional(),
      content: z.string().optional(),
    },
    (root, a) => ops.update(root, resolveRef(root, a.ref, a.collection), a),
  );

  tool(
    "set_status",
    "Change status, enforcing the lifecycle: designed needs no blocking open questions; in-progress needs ready; done goes through `complete`.",
    {
      ref: refArg,
      collection: z.string().optional(),
      status: z.string().describe(`One of ${STATUSES.join(", ")} (common aliases and the collection's own status words are accepted)`),
      superseded_by: z.union([z.string(), z.number()]).optional(),
      force: z.boolean().optional(),
    },
    (root, a) => ops.setStatus(root, resolveRef(root, a.ref, a.collection), a.status, a),
  );

  tool(
    "add_question",
    "Add an open question. A blocking question moves a designed initiative back to draft. Use implementation=true for questions deliberately left to the implementer.",
    { ref: refArg, collection: z.string().optional(), text: z.string(), implementation: z.boolean().optional() },
    (root, a) => ops.addQuestion(root, resolveRef(root, a.ref, a.collection), a.text, a.implementation),
  );

  tool(
    "resolve_question",
    'Resolve an open question. Default mode "remove": delete it and record the decision in `record_in` (default "Decisions", e.g. "Agreed direction"). Mode "tick": keep it as "- [x] … — answer".',
    {
      ref: refArg,
      collection: z.string().optional(),
      index: z.number().int().optional(),
      match: z.string().optional(),
      answer: z.string(),
      record_in: z.string().optional(),
      mode: z.enum(["remove", "tick"]).optional(),
    },
    (root, a) => ops.resolveQuestion(root, resolveRef(root, a.ref, a.collection), a, a.answer, a),
  );

  tool(
    "set_dependencies",
    "Add or remove `depends_on` (blocking) and `related` (non-blocking) entries. Refuses unknown initiatives and cycles.",
    {
      ref: refArg,
      collection: z.string().optional(),
      add: refList.optional(),
      remove: refList.optional(),
      related_add: refList.optional(),
      related_remove: refList.optional(),
    },
    (root, a) => ops.setDependencies(root, resolveRef(root, a.ref, a.collection), a),
  );

  tool(
    "complete",
    'Mark an initiative done. `docs_impact` is required: the project doc paths updated in this change, or "none: <reason>". Reports which initiatives became ready.',
    {
      ref: refArg,
      collection: z.string().optional(),
      docs_impact: z.union([z.array(z.string()), z.string()]),
    },
    (root, a) => ops.complete(root, resolveRef(root, a.ref, a.collection), a.docs_impact),
  );

  tool(
    "regenerate_readmes",
    "Rebuild the generated README blocks (tables + Mermaid). check=true only reports what is stale (for CI).",
    { collection: z.string().optional(), check: z.boolean().optional() },
    (root, a) => ops.regenerateReadmes(root, a.collection, a.check),
  );

  // --- Resources --------------------------------------------------------------

  const tryRoot = (): Root | null => {
    try {
      return open().root;
    } catch {
      return null;
    }
  };

  server.registerResource(
    "index",
    "brindley://index",
    { description: "Overview of all collections, cross-collection dependencies and themes", mimeType: "text/markdown" },
    async (uri) => {
      const root = open().root;
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: `# Initiatives\n\n${rootBlock(root)}\n` }] };
    },
  );

  server.registerResource(
    "collection",
    new ResourceTemplate("brindley://collection/{+path}", {
      list: async () => ({
        resources: (tryRoot()?.collections ?? []).map((c) => ({
          uri: `brindley://collection/${c.name}`,
          name: c.meta.title,
          mimeType: "text/markdown",
        })),
      }),
    }),
    { description: "One collection's overview: tables and dependency graph", mimeType: "text/markdown" },
    async (uri, vars) => {
      const root = open().root;
      const c = findCollection(root, String(vars["path"]));
      if (!c) throw new BrindleyError(`No collection ${vars["path"]}.`);
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: `# ${c.meta.title}\n\n${collectionBlock(root, c)}\n` }] };
    },
  );

  server.registerResource(
    "initiative",
    new ResourceTemplate("brindley://initiative/{+ref}", {
      list: async () => ({
        resources: allInitiatives(tryRoot() ?? ({ collections: [] } as unknown as Root)).map((i) => ({
          uri: `brindley://initiative/${i.collection}/${i.number}`,
          name: `${initiativeKey(i)} ${i.title ?? i.slug}`,
          mimeType: "text/markdown",
        })),
      }),
    }),
    { description: "The raw Markdown of one initiative (brindley://initiative/<collection>/<number>)", mimeType: "text/markdown" },
    async (uri, vars) => {
      const root = open().root;
      const m = /^(.+)\/(\d+)$/.exec(String(vars["ref"]));
      const i = m ? lookup(root, m[1]!, Number(m[2])) : undefined;
      if (!i) throw new BrindleyError(`No initiative ${vars["ref"]}.`);
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: readFileSync(i.file, "utf8") }] };
    },
  );

  server.registerResource(
    "tag",
    new ResourceTemplate("brindley://tag/{tag}", {
      list: async () => ({
        resources: [...new Set(allInitiatives(tryRoot() ?? ({ collections: [] } as unknown as Root)).flatMap((i) => i.tags))]
          .sort()
          .map((t) => ({ uri: `brindley://tag/${t}`, name: `Theme: ${t}`, mimeType: "text/markdown" })),
      }),
    }),
    { description: "Every initiative with a tag, across collections, as one document", mimeType: "text/markdown" },
    async (uri, vars) => {
      const root = open().root;
      const tag = String(vars["tag"]);
      const items = allInitiatives(root).filter((i) => i.tags.includes(tag));
      const desc = declaredTags(root)?.[tag];
      const text = [
        `# Theme: ${tag}`,
        ...(desc ? ["", desc] : []),
        ...items.map((i) => `\n---\n\n<!-- ${initiativeKey(i)} (${i.rel}) -->\n\n${readFileSync(i.file, "utf8")}`),
      ].join("\n");
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text }] };
    },
  );

  // --- Prompts ----------------------------------------------------------------

  const prompt = (text: string) => ({ messages: [{ role: "user" as const, content: { type: "text" as const, text } }] });

  server.registerPrompt(
    "design-review",
    {
      description: "Work through an initiative's open questions with the user, one at a time, grounded in the code.",
      argsSchema: { ref: z.string().describe('Initiative: "collection#n" or a number') },
    },
    ({ ref }) => {
      const root = open().root;
      const i = resolveRef(root, ref);
      const d = detail(root, i);
      const blocking = i.questions.filter((q) => !q.resolved && !q.implementation);
      const impl = i.questions.filter((q) => !q.resolved && q.implementation);
      return prompt(`We are going to work through the open questions of initiative ${initiativeKey(i)} "${i.title}" together, until it is design-complete.

## How to run this conversation

1. **Open chat, not forms.** Ask in the normal conversation, in prose. Never use a structured question, multiple-choice or form tool, even if one is available — I want to reply freely, push back and redirect.
2. **One question at a time**, in order unless I pick another. Say which question we are on and how many remain.
3. **Grounded in the code, not theory.** Before discussing a question, read the code that owns the behaviour: classes, queries, tests and docs. Cite every claim about how the system works (\`path:line\`, test name, doc section). If the code doesn't establish something, say *unclear from code* and what you checked — never fill the gap with how such systems usually work.
4. **Clear, concrete examples** drawn from the real domain and code: actual types, fields and data, and what a caller sees before and after. No \`Foo\`/\`x\` placeholders.
5. **Recommend, then let me decide.** Lay out the realistic options (usually 2–3) with their consequences in this codebase, recommend one and say why, then ask. Don't move on until I have decided, deferred it, or marked it \`(implementation)\`.
6. **Record as you go** with the Brindley tools: \`resolve_question\` (removes the question and records the decision — pass \`record_in\` to choose the section, e.g. "Agreed direction"), \`add_question\` for new questions, \`update\` for acceptance criteria. Show me the edited text. If a decision changes documented behaviour, add the doc to the initiative's \`docs\` list. Rationale and rejected options stay in the initiative, never in project docs.
7. **Finish cleanly.** When no blocking questions remain, offer to \`set_status\` to designed; don't do it unprompted.

Use \`next_question\` to step through.

## The initiative

Status: ${i.status}${i.type ? ` · type: ${i.type}` : ""}${i.tags.length ? ` · tags: ${i.tags.join(", ")}` : ""}

Dependencies:
${d.dependencies.length ? d.dependencies.map((x) => `- ${x.ref} — ${x.classification}${x.title ? ` (${x.title}, ${x.status})` : ""}`).join("\n") : "- none"}

Related:
${d.related.length ? d.related.map((x) => `- ${x.ref}${x.title ? ` — ${x.title} (${x.status})` : ""}`).join("\n") : "- none"}

Blocking open questions (${blocking.length}):
${blocking.map((q) => `${q.index}. ${q.text}`).join("\n") || "- none"}

Delegated to implementation (${impl.length}, not discussed unless I ask):
${impl.map((q) => `${q.index}. ${q.text}`).join("\n") || "- none"}

<initiative path="${i.rel}">
${readFileSync(i.file, "utf8")}
</initiative>`);
    },
  );

  server.registerPrompt(
    "implement",
    {
      description: "Hand-off brief for an agent implementing one initiative.",
      argsSchema: { ref: z.string().describe('Initiative: "collection#n" or a number') },
    },
    ({ ref }) => {
      const root = open().root;
      const i = resolveRef(root, ref);
      const report = dependencyReport(root, i);
      const done = report.filter((x) => x.classification === "satisfied");
      const agent = agentFile(root, i);
      const docs = i.docs.length ? i.docs : (findCollection(root, i.collection)?.meta.docs ?? []);
      return prompt(`Implement initiative ${initiativeKey(i)} "${i.title}" — this one only; do not pick up other initiatives.

${agent ? `**Repo workflow:** read and follow \`${agent}\` (worktrees, verification, commits). Where it conflicts with the generic rules below on repo specifics, it wins.\n` : ""}
## Before you start

- Readiness: ${isReady(root, i) ? "ready." : `NOT ready (status ${i.status}; blocked by ${blockers(root, i).map((x) => x.ref).join(", ") || "nothing"}). Stop and report.`}
- Dependencies: ${report.length ? report.map((x) => `${x.ref} (${x.classification})`).join(", ") : "none"}.
${report.some((x) => x.classification === "external") ? "- External dependencies cannot be checked by the tool: confirm each one yourself and report any you cannot confirm.\n" : ""}- Ask about any product, data or API choice the initiative doesn't settle before writing code. \`(implementation)\` questions are yours to settle — record each decision in the initiative (\`resolve_question\`).
- Set \`status\` to in-progress (\`set_status\`) when you begin.

## Finishing (same commit as the code)

1. Update the project docs so they describe the code **as it now is**: present tense, what exists, how callers use it, constraints and failure modes. No history ("previously", "now", "we added"), no rejected alternatives, no links to initiatives. Say *unclear from code* rather than guess.
   Docs this initiative is expected to touch: ${docs.length ? docs.map((x) => `\`${x}\``).join(", ") : "none listed — decide and state."}
2. Settle the initiative's wording into a concise account of what was decided and built; move rejected alternatives and design debate into \`## Appendix: Rejected alternatives\`.
3. Call \`complete\` with \`docs_impact\`: the doc paths you updated, or \`"none: <reason>"\`. Run \`check_docs\` on what you wrote.
4. Commit the code, docs, initiative and regenerated READMEs together.

${done.length ? `## Done dependencies (for context)\n\n${done.map((x) => `- ${x.ref} ${x.title} — ${x.path}`).join("\n")}\n\n` : ""}<initiative path="${i.rel}">
${readFileSync(i.file, "utf8")}
</initiative>`);
    },
  );

  server.registerPrompt(
    "triage",
    {
      description: "Review the initiatives: stale drafts, unresolved questions, blocked chains, unconfirmed external dependencies, and what to pick next.",
      argsSchema: { collection: z.string().optional() },
    },
    ({ collection }) => {
      const root = open().root;
      const items = allInitiatives(root).filter((i) => !collection || i.collection === collection);
      const lines = items.filter(isActive).map((i) => {
        const s = summary(root, i);
        return `- ${s.ref} "${s.title}" — ${s.type ?? "untyped"}, ${s.status}${s.ready ? ", READY" : ""}${s.blockedBy.length ? `, blocked by ${s.blockedBy.join(", ")}` : ""}, ${s.openQuestions} open question(s), updated ${i.updated ?? "unknown"}`;
      });
      return prompt(`Triage ${collection ? `collection ${collection}` : "all initiatives"}. Using the Brindley tools (\`get\`, \`questions\`, \`graph\`, \`validate\`), report:

1. Drafts that look stale (old \`updated\`, no progress on questions).
2. Unresolved blocking questions, grouped by initiative — which would unblock the most work if settled?
3. Blocked chains: what is waiting on what, and the shortest path to unblocking them.
4. External dependencies nobody has confirmed.
5. Your suggested next pick from what is ready, and why.

Talk it through with me in open chat; don't change anything without asking.

Active initiatives:
${lines.join("\n") || "- none"}`);
    },
  );

  return server;
}
