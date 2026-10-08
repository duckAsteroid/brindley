import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { STATUSES, type Initiative, type Root } from "./model.js";
import {
  BrindleyError,
  allInitiatives,
  findCollection,
  initiativeKey,
  canonicalCollection,
  declaredTags,
  themeFor,
  loadRoot,
  lookup,
  findRepoRoot,
  openRepo,
  resolveRef,
} from "./repo.js";
import { blockers, dependants, dependencyReport, displayRef, isActive, isReady, target, topoSort } from "./deps.js";
import { collectionBlock, mermaid, regenerate, rootBlock } from "./readme.js";
import { currentBranch, mergeInProgress, otherWorktrees, worktrees } from "./git.js";
import { validate } from "./validate.js";
import { checkDocs } from "./docs.js";
import { dimensionReport, filterByDimensions, orderByDimensions } from "./dimensions.js";
import { graphSettings } from "./graph.js";
import { elsewhereFor, type Elsewhere } from "./elsewhere.js";
import { dimensionInfo, fieldsFor } from "./fields.js";
import * as ops from "./ops.js";
import { MEASURES, sectionIsBlank } from "./ops.js";
import { COMMIT, VERSION } from "./version.js";

export { VERSION };

/** Sent to clients on connect: how Brindley sees a repository. */
export const INSTRUCTIONS = `Brindley manages planned work as Markdown files in git. Design fully before anyone digs.

- The unit of work is an **initiative**. People also call them **tickets** or **issues** — all three mean the same thing here, so "create a ticket", "what issues are ready?" or "close ticket lgm#22" all map onto these tools.

- A collection is any folder whose README.md front-matter has \`brindley: 1\`. Mark one with create_collection (existing files are adopted; nothing moves). There is no repo-level file.
- Initiatives are \`<number>-<slug>.md\` files in the collection folder or its immediate sub-folders. Refer to them as \`<collection>#<number>\`, where the collection is its name (front-matter \`name:\`, else the folder name), an alias (\`aliases:\` in front-matter, or the automatic initials of the folder name, e.g. lock-gate-maintenance → lgm), or its path; or a bare number when unambiguous.
- Status comes from front-matter \`status:\`, else the sub-folder name (completed/ → done, deferred/ → deferred, superseded/ → superseded). Core statuses: draft, designed (design complete, ready to implement), in-progress, deferred, done, abandoned, superseded. Common words are aliases (proposed → draft, completed → done, future → deferred, …); a collection can map its own with \`statuses:\`.
- A spike (\`type: spike\`) builds just enough to measure what its \`## Measures\` section asks, then records \`## Findings\`. Its code stays on its own branch and may become the basis of the real implementation. Use the \`spike\` prompt to run one.
- A theme overview doc is a non-numbered .md in a collection folder with \`theme: <tag>\` in its front-matter; initiatives join the theme with \`tags: [<tag>]\`. Brindley keeps a generated list of the theme's initiatives in the doc, and points to it from \`get\`, \`tags\` and the prompts.
- \`ignore:\` in the collection README holds .gitignore-style patterns (relative to the collection folder) for numbered files that are not initiatives, e.g. companion rationale notes. Use the \`ignore\` tool to add/remove/preview patterns; \`collections\` lists what is ignored.
- Dependencies are the links under an initiative's \`## Dependencies\` heading (links to initiative files, in any collection, block it; http links are external prerequisites). Links under \`## Related\` are non-blocking. Use set_dependencies to add or remove them.
- Initiatives can carry scoring dimensions — \`priority\`, \`impact\`, \`complexity\` by default, plus any a collection declares — each a front-matter field whose value comes from an ordered set. Set them with \`update\` (\`dimensions\`), filter and order with \`list\` (\`where\`, \`order_by\`). A ticket with none set simply hasn't been scored yet.
- \`fields\` lists every front-matter field a collection understands and the values each allows (statuses and aliases, types, tags, dimensions with their order and default) — look there rather than guessing.
- If you implement in a git worktree, call \`use_worktree\` with its path first, so your edits land there; every result ends with the checkout it worked on.
- Brindley moves files only for a collection that declares \`folders:\` (status → folder); then status changes move them and rewrite links. Every write regenerates the collection README's generated block. \`validate\` reports structural problems (missing or conflicting statuses, files outside their status folder, duplicate numbers, broken links, …).
- When discussing open questions with the user: one at a time, in open chat (no form or multiple-choice prompts), grounded in the actual code, with concrete examples.`;

export interface ServerOptions {
  cwd: string;
  autoReadme?: boolean;
}

const dimensionValue = z.union([z.string(), z.number()]);
const refArg = z.union([z.string(), z.number()]).describe('Initiative (ticket/issue): "collection#n" (e.g. "lgm#22"), a bare number, or a path.');
const refList = z.array(z.union([z.string(), z.number()]));

/** Where an initiative is in progress in another worktree or on another branch (none if it is here). */
function elsewhereOf(root: Root, i: Initiative): Elsewhere[] {
  const c = findCollection(root, i.collection);
  return c && i.status !== "in-progress" ? elsewhereFor(root, c, i) : [];
}

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
    branch: i.branch ?? null,
    elsewhere: elsewhereOf(root, i),
    owner: i.owner ?? null,
    tags: i.tags,
    // Only dimensions with a value (set, or from its default): unset ones are listed by `get` and `fields`.
    dimensions: Object.fromEntries(Object.entries(dimensionReport(root, i)).filter(([, d]) => d.value !== null)),
    ready: isReady(root, i),
    blockedBy: blockers(root, i).map((d) => d.ref),
    openQuestions: open.filter((q) => !q.implementation).length,
    implementationQuestions: open.filter((q) => q.implementation).length,
    path: i.rel,
  };
}

/** Theme overview docs for the initiative's tags. */
function themesOf(root: Root, i: Initiative) {
  return i.tags
    .map((t) => themeFor(root, t))
    .filter((t): t is NonNullable<typeof t> => !!t)
    .map((t) => ({ tag: t.tag, title: t.title, summary: t.summary ?? null, doc: t.rel }));
}

function detail(root: Root, i: Initiative) {
  return {
    ...summary(root, i),
    // Every dimension the collection has, with its allowed values, so what could be set is visible.
    dimensions: Object.fromEntries(
      dimensionInfo(findCollection(root, i.collection)).map(({ name, ...d }) => [name, { ...dimensionReport(root, i)[name], ...d }]),
    ),
    themes: themesOf(root, i),
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

/** The brief for running a spike: implement enough to take the measurements, then report. */
function spikeBrief(root: Root, i: Initiative): string {
  const agent = agentFile(root, i);
  const measures = !sectionIsBlank(i.body, MEASURES);
  const askers = dependants(root, i)
    .concat(allInitiatives(root).filter((o) => o.related.some((r) => r.kind === "initiative" && r.collection === i.collection && r.number === i.number)))
    .filter((o, k, arr) => arr.indexOf(o) === k);
  const notSpike = i.type !== "spike" ? `\n> Note: this initiative is \`type: ${i.type ?? "unset"}\`, not \`spike\`. If it really is a spike, set \`type: spike\` (\`update\`).\n` : "";
  return `Run spike ${initiativeKey(i)} "${i.title}" — this one only.
${notSpike}
A spike builds just enough to **measure something specific** and answer a question. Its main output is knowledge, written into the initiative. Its code is **not necessarily throwaway**: if the spike proves useful it may become the basis of the real implementation, so write it to be built on, and keep it.

${themesOf(root, i).map((t) => `**Theme "${t.tag}":** read the overview \`${t.doc}\` for context.\n`).join("")}${agent ? `**Repo workflow:** read and follow \`${agent}\` for worktrees, branches, verification and commits — except that spike code is **not merged into the main line** (see below).\n` : ""}
${verifyStep(root, i)}
## Step 2 — before writing code

- ${measures ? "Re-read `## Measures` and keep to it: this spike answers that question, measured that way." : "Settle `## Measures` with me first (in open chat): the question, the hypothesis, what to measure and how, the answer criteria (thresholds for yes / no), and the time-box. Record it before writing code."}
- Set \`status\` to in-progress (\`set_status\`) when you begin.

## While running it

- Build the **smallest implementation that makes the measurements meaningful** — realistic where it affects the numbers, simplified elsewhere. Note every shortcut you take.
- Work on a **dedicated spike branch** (e.g. \`spike/${i.collection}-${i.number}\`); do not merge it into the main line. Commit it so it can be found and built on later.
- Keep code tidy enough to build on: sensible structure and names, the measuring harness separate from the code under test, no secrets or hacks you would be embarrassed to inherit.
- Stay within the time-box. If it runs out, stop and report what you have — an incomplete answer is still an answer.
- Measure exactly what \`## Measures\` asks, the way it says. If that turns out to be impossible or misleading, stop and ask before changing the measure.

## Finishing

1. Write \`## Findings\` in the initiative (\`update\` with \`section: "Findings"\`):
   - **Method** — what was built and how it was measured (environment, data size, runs).
   - **Results** — the numbers, against each answer criterion.
   - **Conclusion** — the answer to the question, and how confident it is.
   - **Code** — adopt / adapt / abandon, where it lives (branch and commit), and what would have to change to ship it (the shortcuts above).
2. Answer what you can elsewhere: these initiatives link to this spike and have open questions it may settle — resolve each one you can with \`resolve_question\`, linking to the findings:
${askers.length ? askers.map((o) => `   - ${initiativeKey(o)} "${o.title}": ${o.questions.filter((q) => !q.resolved).length} open question(s)`).join("\n") : "   - (none link to this spike yet)"}
3. Propose follow-ups with \`create\`: e.g. an implementation initiative that links this spike under \`## Dependencies\` and names the spike branch as its starting point; or new questions the spike raised.
4. Call \`complete\`. Spike code does not change project docs, so \`docs_impact\` defaults to none; \`complete\` lists the linked open questions again so nothing is missed.

<initiative path="${i.rel}">
${readFileSync(i.file, "utf8")}
</initiative>`;
}

/** Preflight for an initiative, including validation errors on its own file. */
function preflightOf(root: Root, i: Initiative) {
  const problems = validate(root, { collection: i.collection }).filter((f) => f.file === i.rel);
  return ops.preflight(root, i, problems);
}

/** "Step 1" of the implement and spike briefs: verify before doing anything else. */
function verifyStep(root: Root, i: Initiative): string {
  const p = preflightOf(root, i);
  const mark = { pass: "✅", fail: "❌", note: "ℹ️" } as const;
  return `## Step 1 — verify it is ready (do this first)

Before reading code or making any change, confirm this initiative is complete and ready to work on. Call \`check_ready\` with ref \`${p.ref}\` to re-run these checks against the current files (this brief is a snapshot), and read the initiative in full.

${p.checks.map((c) => `- ${mark[c.result]} **${c.check}:** ${c.detail}`).join("\n")}

${p.ready
    ? "All checks pass. Also confirm for yourself that the design actually answers every product, data and API choice the work needs; if it doesn't, stop and ask."
    : "**One or more checks fail. Stop here:** do not start work. Report what fails and what would fix it (e.g. resolve the questions with `design-review`, finish the dependencies first), and wait for me."}
`;
}

function agentFile(root: Root, i: Initiative): string | undefined {
  return findCollection(root, i.collection)?.meta.agent;
}

export function createServer(opts: ServerOptions): McpServer {
  const server = new McpServer({ name: "brindley", version: VERSION }, { instructions: INSTRUCTIONS });

  // The checkout the server works on: where it was started, unless use_worktree has switched it.
  const started = findRepoRoot(opts.cwd);
  let checkout = started;

  const open = (): { root: Root; notes: string[] } => {
    if (checkout !== started && !existsSync(checkout))
      throw new BrindleyError(`The worktree ${checkout} no longer exists. Call use_worktree() to return to ${started}, or name another worktree.`);
    let root = openRepo(checkout);
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

  /** Other worktrees, when the server is still on the checkout it started in (the case to nudge about). */
  const unswitchedOthers = () =>
    checkout === started ? worktrees(started).filter((w) => w.path !== resolve(started) && existsSync(w.path)) : [];
  const describe = (w: { path: string; branch: string | null }) => `${w.path}${w.branch ? ` on ${w.branch}` : ""}`;

  /**
   * Every result names the checkout it worked on, after the JSON — and, when the server hasn't
   * switched but other worktrees exist, names them and how to switch, since that is how edits
   * end up in the wrong checkout.
   */
  const checkoutLine = () => {
    const branch = currentBranch(checkout);
    if (checkout !== started) return `Checkout: ${checkout} (worktree${branch ? `, ${branch}` : ""})`;
    const others = unswitchedOthers();
    if (!others.length) return `Checkout: ${checkout}${branch ? ` (${branch})` : ""}`;
    return `Checkout: ${checkout} (where this server started${branch ? `, ${branch}` : ""}). Other worktrees: ${others.map(describe).join("; ")} — if you are working in one, call use_worktree with its path.`;
  };
  const reply = (value: unknown) => ({
    content: [
      { type: "text" as const, text: JSON.stringify(value, null, 2) },
      { type: "text" as const, text: checkoutLine() },
    ],
  });
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
          // Writing to the starting checkout while worktrees exist: the edits may belong in one of them.
          const others = r.touched.length ? unswitchedOthers() : [];
          if (others.length)
            r.warnings = [
              ...r.warnings,
              `Written to ${checkout}, where this server started, but other worktrees exist (${others.map(describe).join("; ")}). If you are implementing in one, call use_worktree with its path first — these edits are here, not there.`,
            ];
          return reply({ ...(r.result as object), touched: r.touched, warnings: r.warnings, ...(notes.length ? { notes } : {}) });
        }
        return reply(notes.length ? { result: out, notes } : out);
      } catch (e) {
        return fail(e);
      }
    }) as never);
  };

  // --- Setup ------------------------------------------------------------------

  // Not a `tool`: it must work even when the current worktree has gone, which `open` refuses.
  server.registerTool(
    "use_worktree",
    {
      description:
        "Switch this server to another git worktree of the same repository, for the rest of this session: every later call reads and writes that checkout. Call it right after creating the worktree you will implement in, so initiative edits land in that branch's commit. With no `path` (or the original checkout's path), switch back — do that after merging, before removing the worktree. Returns the checkout now in use.",
      inputSchema: { path: z.string().optional().describe("The worktree's folder; omit to return to the checkout the server started in.") },
    },
    (async (a: { path?: string }) => {
      try {
        const real = (p: string) => (existsSync(p) ? realpathSync(p) : resolve(p));
        if (a.path === undefined || real(resolve(started, a.path)) === real(started)) checkout = started;
        else {
          const want = real(resolve(started, a.path));
          const trees = otherWorktrees(started).filter(existsSync).map(real);
          if (!trees.includes(want))
            throw new BrindleyError(`${want} is not a worktree of the repository at ${started} (git worktree list: ${trees.join(", ") || "no others"}).`);
          checkout = want;
        }
        return reply({ checkout, started, switched: checkout !== started });
      } catch (e) {
        return fail(e);
      }
    }) as never,
  );

  const collectionFields = {
    title: z.string().optional(),
    types: z.array(z.string()).optional().describe("Initiative types this collection uses; others are flagged"),
    tags: z.record(z.string(), z.string()).optional().describe("Tags (themes) with one-line descriptions"),
    statuses: z.record(z.string(), z.string()).optional().describe("This collection's own status words mapped to core statuses"),
    ignore: z.array(z.string()).optional().describe('Paths or globs relative to the collection folder to ignore, e.g. ["code-review/", "completed/24-*-rationale.md"]'),
    summary: z.string().optional(),
    owner: z.string().optional(),
    link: z.string().optional().describe("External ticket/epic URL"),
    agent: z.string().optional().describe("Repo workflow agent file for this collection"),
    docs: z.array(z.string()).optional().describe("Globs of project docs this collection usually affects"),
    dimensions: z
      .record(z.string(), z.unknown())
      .nullable()
      .optional()
      .describe('Scoring dimensions: name → { values (first ranks first), required?, default? } or a list of values. null removes.'),
    graph: z
      .record(z.string(), z.unknown())
      .nullable()
      .optional()
      .describe("Dependency graph settings: direction, arrows, related, show, external, themes, enabled. null removes."),
    columns: z
      .record(z.string(), z.array(z.string()))
      .nullable()
      .optional()
      .describe("README table columns: { active: [...], completed: [...] }. null removes."),
    folders: z
      .record(z.string(), z.string())
      .nullable()
      .optional()
      .describe("Opt in to status folders: status → folder name, e.g. { done: done }. Status changes then move files; run tidy for existing ones. null removes (files stay where they are)."),
  };

  tool(
    "create_collection",
    "Mark a folder as a collection: adds `brindley: 1` and the given details to its README.md front-matter, creating the folder and README if needed. Works on a folder that already holds numbered initiative files. The first collection in a repo also returns the agent-instructions snippet for AGENTS.md / CLAUDE.md.",
    {
      path: z.string().describe('Folder relative to the repo root, e.g. "docs/initiatives/LOCK-42/slot-booking"'),
      name: z.string().optional().describe("Name used in references (name#n); defaults to the folder name"),
      aliases: z.array(z.string()).optional().describe('Short names for references, e.g. ["lgm"] for "lgm#22"'),
      ...collectionFields,
    },
    (root, a) => ops.createCollection(root, a.path, a),
  );

  tool(
    "update_collection",
    "Edit a collection README's details, including its status (active | done | abandoned).",
    {
      collection: z.string().describe("Collection name, alias or folder path"),
      aliases: z.array(z.string()).optional().describe("Replace the explicit aliases"),
      status: z.enum(["active", "done", "abandoned"]).optional(),
      ...collectionFields,
    },
    (root, a) => ops.updateCollection(root, a.collection, a),
  );

  server.registerTool(
    "version",
    {
      description: "The Brindley server's version (computed from git tags + Conventional Commits) and build commit.",
      annotations: { readOnlyHint: true },
    },
    async () => reply({ name: "brindley", version: VERSION, commit: COMMIT, formatVersion: 1 }),
  );

  tool(
    "ignore",
    "Add or remove a collection's `ignore:` patterns — numbered files that are not initiatives (companion notes, reviews). .gitignore semantics, relative to the collection folder: `#` comments, `!` re-includes, leading `/` anchors, trailing `/` = folder, no `/` = any depth. Use dry_run to preview which files a change would ignore. Ignored numbers are still never reused.",
    {
      collection: z.string().describe("Collection name or folder path"),
      add: z.array(z.string()).optional(),
      remove: z.array(z.string()).optional(),
      dry_run: z.boolean().optional(),
    },
    (root, a) => ops.setIgnore(root, a.collection, { add: a.add, remove: a.remove, dryRun: a.dry_run }),
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
          aliases: c.aliases,
          ...c.meta,
          // Effective dimensions (the defaults merged with the declaration), not the raw declaration.
          dimensions: dimensionInfo(c),
          counts: Object.fromEntries(STATUSES.map((s) => [s, count(s)])),
          ready: c.initiatives.filter((i) => isReady(root, i)).length,
          ignoredFiles: c.ignored,
        };
      }),
    { readOnlyHint: true },
  );

  tool(
    "fields",
    "Every front-matter field an initiative (ticket/issue) can have in a collection, and the values each accepts: statuses and their aliases, types, tags, scoring dimensions (in ranking order, with any default and whether required), and the free-text fields — with the tool that sets each. Give a `collection` or an initiative `ref`; with neither, every collection.",
    { collection: z.string().optional(), ref: refArg.optional() },
    (root, a) => {
      const cols =
        a.ref !== undefined
          ? [findCollection(root, resolveRef(root, a.ref, a.collection).collection)!]
          : a.collection
            ? [findCollection(root, a.collection) ?? (() => { throw new BrindleyError(`No collection "${a.collection}".`); })()]
            : root.collections;
      return cols.map((c) => ({ collection: c.name, fields: fieldsFor(root, c) }));
    },
    { readOnlyHint: true },
  );

  tool(
    "list",
    "List initiatives (a.k.a. tickets or issues) across the repo, or in one `collection`, optionally filtered.",
    {
      collection: z.string().optional(),
      type: z.string().optional(),
      status: z.string().optional(),
      tag: z.string().optional(),
      owner: z.string().optional(),
      ready: z.boolean().optional(),
      where: z
        .record(z.string(), z.array(dimensionValue))
        .optional()
        .describe('Scoring dimensions to filter by: permitted values per dimension, e.g. { "priority": ["critical", "high"] }. An unset value counts as the dimension\'s default, if it has one.'),
      order_by: z
        .array(z.string())
        .optional()
        .describe('Scoring dimensions to order by, e.g. ["priority", "impact"]: each by its declared order (first value first), later ones breaking ties, then by number. Unset values use the default, else sort last.'),
    },
    (root, a) => {
      let items = allInitiatives(root)
        .filter((i) => !a.collection || i.collection === canonicalCollection(root, a.collection))
        .filter((i) => !a.type || i.type === a.type)
        .filter((i) => !a.status || i.status === a.status)
        .filter((i) => !a.tag || i.tags.includes(a.tag))
        .filter((i) => !a.owner || i.owner === a.owner)
        .filter((i) => a.ready === undefined || (isReady(root, i) && !elsewhereOf(root, i).length) === a.ready);
      if (a.where) items = filterByDimensions(root, items, a.where);
      if (a.order_by?.length) items = orderByDimensions(root, items, a.order_by);
      return items.map((i) => summary(root, i));
    },
    { readOnlyHint: true },
  );

  tool(
    "get",
    "Full detail of one initiative (ticket/issue), including its dependency report (each dependency classified satisfied / blocking / external / missing), dependants, open questions and acceptance criteria.",
    { ref: refArg, collection: z.string().optional() },
    (root, a) => detail(root, resolveRef(root, a.ref, a.collection)),
    { readOnlyHint: true },
  );

  tool(
    "ready",
    "Initiatives (tickets/issues) that are designed with nothing blocking — what an agent can pick up now — in suggested order (prerequisites first).",
    { collection: z.string().optional(), type: z.string().optional() },
    (root, a) =>
      topoSort(
        root,
        allInitiatives(root).filter(
          (i) => isReady(root, i) && !elsewhereOf(root, i).length && (!a.collection || i.collection === canonicalCollection(root, a.collection)) && (!a.type || i.type === a.type),
        ),
      ).map((i) => ({ ...summary(root, i), external: dependencyReport(root, i).filter((d) => d.classification === "external").map((d) => d.ref) })),
    { readOnlyHint: true },
  );

  tool(
    "graph",
    "Dependency graph as an adjacency list plus Mermaid: a collection's active work, one initiative's neighbourhood, or a tag (theme) across collections.",
    {
      collection: z.string().optional(),
      ref: refArg.optional(),
      tag: z.string().optional(),
      include_done: z.boolean().optional(),
      related: z.boolean().optional().describe("Draw ## Related links as dotted edges."),
      themes: z.union([z.boolean(), z.string(), z.array(z.string())]).optional().describe('Show themes: "box", "icon", "label" (or true), or a list such as ["box", "icon"].'),
      show: z.array(z.string()).optional().describe("Statuses to include as nodes beyond active work, e.g. [\"done\"]."),
      external: z.boolean().optional().describe("false leaves out external dependencies and other collections' initiatives."),
      direction: z.string().optional().describe("Where the do-first work goes: left-to-right, right-to-left, top-to-bottom, bottom-to-top."),
      arrows: z.enum(["from", "to"]).optional().describe("from: edges point at what an initiative needs (X depends on Y → X --> Y); to: the reverse."),
    },
    (root, a) => {
      let items: Initiative[];
      let from = canonicalCollection(root, a.collection) ?? "";
      if (a.ref !== undefined) {
        const i = resolveRef(root, a.ref, a.collection);
        from = i.collection;
        const deps = i.dependsOn.map((r) => target(root, r)).filter((x): x is Initiative => !!x);
        items = [i, ...deps, ...dependants(root, i)];
      } else if (a.tag) {
        items = allInitiatives(root).filter((i) => i.tags.includes(a.tag!));
      } else {
        items = a.collection ? (findCollection(root, from)?.initiatives ?? []) : allInitiatives(root);
      }
      // The settings of the collection being drawn (a tag graph spans collections: defaults), with this call's overrides.
      const own = a.tag && a.ref === undefined ? undefined : findCollection(root, from);
      const settings = graphSettings(
        own?.meta.graph,
        { related: a.related, themes: a.themes, show: a.show, external: a.external, direction: a.direction, arrows: a.arrows },
        own?.meta.statuses,
      );
      if (!a.include_done && a.ref === undefined) items = items.filter((i) => isActive(i) || settings.show.includes(i.status ?? ""));
      const unique = [...new Map(items.map((i) => [initiativeKey(i), i])).values()];
      return {
        nodes: unique.map((i) => ({ ref: initiativeKey(i), title: i.title, status: i.status, ready: isReady(root, i) })),
        edges: unique.flatMap((i) => i.dependsOn.map((r) => ({ from: r.kind === "initiative" ? `${r.collection}#${r.number}` : r.raw, to: initiativeKey(i) }))),
        mermaid: mermaid(root, unique, from, settings),
      };
    },
    { readOnlyHint: true },
  );

  tool(
    "questions",
    "Unresolved open questions, grouped by initiative. Abandoned and superseded initiatives are left out — dropping the work settles them — unless asked for by `ref`.",
    { collection: z.string().optional(), ref: refArg.optional(), include_implementation: z.boolean().optional() },
    (root, a) => {
      const items =
        a.ref !== undefined
          ? [resolveRef(root, a.ref, a.collection)]
          : allInitiatives(root).filter(
              (i) => (!a.collection || i.collection === canonicalCollection(root, a.collection)) && i.status !== "abandoned" && i.status !== "superseded",
            );
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
    "Every tag in use plus declared-but-unused ones, with descriptions, counts by status, and the theme overview doc if one exists (a doc whose front-matter says `theme: <tag>`).",
    {},
    (root) => {
      const declared = declaredTags(root);
      const names = new Set([...allInitiatives(root).flatMap((i) => i.tags), ...Object.keys(declared ?? {})]);
      return [...names].sort().map((tag) => {
        const items = allInitiatives(root).filter((i) => i.tags.includes(tag));
        const counts: Record<string, number> = {};
        for (const i of items) counts[i.status ?? "?"] = (counts[i.status ?? "?"] ?? 0) + 1;
        const doc = themeFor(root, tag);
        return {
          tag,
          description: declared?.[tag] ?? null,
          declared: !!declared && tag in declared,
          themeDoc: doc ? { title: doc.title, path: doc.rel } : null,
          total: items.length,
          counts,
        };
      });
    },
    { readOnlyHint: true },
  );

  tool(
    "check_ready",
    "Is this initiative (ticket/issue) complete and ready to work on? Runs the preflight the implement and spike briefs start with: status, dependencies, blocking open questions, acceptance criteria (or ## Measures for a spike), validation errors. `ready: false` means stop and report, don't start.",
    { ref: refArg, collection: z.string().optional() },
    (root, a) => preflightOf(root, resolveRef(root, a.ref, a.collection)),
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
    "Create a new initiative (ticket/issue). The number is coined automatically by scanning the working tree, other worktrees, branches and history. A folder path that isn't a collection yet is marked as one.",
    {
      collection: z.string().describe("Collection name, or a folder path"),
      title: z.string(),
      type: z.string().optional().describe("feature, bug, refactor, perf, docs, chore, spike, …"),
      tags: z.array(z.string()).optional(),
      goal: z.string().optional(),
      depends_on: refList.optional().describe('Initiatives (e.g. "lgm#22", 23) or ticket URLs to link under ## Dependencies'),
      related: refList.optional().describe("Initiatives or URLs to link under ## Related (non-blocking)"),
      why: z.string().optional().describe("Why the dependencies are needed (appended to each depends_on bullet; related links get no note — add one with set_dependencies)"),
      owner: z.string().optional(),
    },
    (root, a) => ops.create(root, a),
  );

  tool(
    "update",
    "Edit an initiative's (ticket's/issue's) front-matter fields or H1, or replace a named body section — including on a done initiative, which is how settled work is refined (no status change needed). `status` records the status an initiative already has when its front-matter has none (no lifecycle checks); to change a recorded status, use set_status. Cannot change its number or filename.",
    {
      ref: refArg,
      collection: z.string().optional(),
      title: z.string().optional(),
      type: z.string().optional(),
      owner: z.string().optional(),
      tags: z.array(z.string()).optional(),
      status_note: z.string().optional(),
      docs: z.array(z.string()).optional(),
      status: z.string().optional().describe("Record the status this initiative already has, when its front-matter has none (e.g. backfilling an adopted folder). Refused if a status is recorded: use set_status."),
      reason: z.string().optional().describe("With `status`: why it was abandoned, superseded or deferred, if known."),
      dimensions: z
        .record(z.string(), dimensionValue.nullable())
        .optional()
        .describe('Scoring dimension values to set, e.g. { "priority": "high" }; each must be one of the dimension\'s values. null clears one.'),
      section: z.string().optional().describe('Name of the "## " section to replace, or add if missing.'),
      content: z
        .string()
        .optional()
        .describe("The section's body, without its heading (a leading heading naming the section is dropped)."),
    },
    (root, a) => ops.update(root, resolveRef(root, a.ref, a.collection), a),
  );

  tool(
    "fix",
    "Repair the validate findings that have one obvious fix, editing text in place (never renaming or moving a file): a broken link whose filename matches exactly one initiative in its collection, and `depends_on` / `related` front-matter (turned into links under ## Dependencies / ## Related). Anything ambiguous is listed in `unfixed`. Dry run by default: returns each edit (file, line, before, after); pass dry_run: false to write. Padding is fixed by repad, numbers by renumber.",
    { collection: z.string().optional(), dry_run: z.boolean().optional() },
    (root, a) => ops.fix(root, { collection: a.collection, dry_run: a.dry_run }),
  );

  tool(
    "rename_collection",
    "Move a collection to a new folder, rewriting every relative link into it from anywhere in the repo and out of it from inside. If its name comes from its folder (no `name:` in its README), the name changes too and \"<name>#<n>\" references by the old name, path or automatic alias are rewritten; explicit aliases are kept. Refuses a destination that exists or is inside another collection, and a new name another collection uses. `dry_run: true` returns the plan.",
    { collection: z.string(), to: z.string().describe("The new folder, relative to the repo root."), dry_run: z.boolean().optional() },
    (root, a) => ops.renameCollection(root, a.collection, a.to, { dry_run: a.dry_run }),
  );

  tool(
    "renumber",
    "Give an initiative a new number — fixing a number collision after a merge. Renames its file and asset folder (keeping the slug, padded to the collection's width) and rewrites every link and \"<collection>#<n>\" reference to it across the repo. `to` defaults to the next number, coined as `create` does. For one file of a duplicate-number pair, pass `ref` as its path. `dry_run: true` returns the plan without writing.",
    {
      ref: refArg,
      collection: z.string().optional(),
      to: z.number().int().optional().describe("The new number; default: the next free one."),
      dry_run: z.boolean().optional(),
    },
    (root, a) => ops.renumber(root, resolveRef(root, a.ref, a.collection), { to: a.to, dry_run: a.dry_run }),
  );

  tool(
    "tidy",
    "For a collection that declares `folders:` (status → folder), move every initiative to where its status belongs — its folder, or the top of the collection — with its asset folder, rewriting every link to them. Dry run by default: returns each move and link rewrite; pass dry_run: false to apply. Status changes keep things in step after that; tidy is for files already out of place.",
    { collection: z.string(), dry_run: z.boolean().optional() },
    (root, a) => ops.tidy(root, a.collection, { dry_run: a.dry_run }),
  );

  tool(
    "repad",
    "Pad every initiative number in a collection to one width (`01-`, `001-`) — the given `width`, or the width most of its files use — renaming the files and their asset folders and rewriting every link to them across the repo. Dry run by default: returns each rename and link rewrite; pass dry_run: false to apply. Refuses a width too small for the highest number.",
    {
      collection: z.string(),
      width: z.number().int().optional().describe("Digits to pad to; default: the width most of the collection's files use."),
      dry_run: z.boolean().optional().describe("Default true: plan only."),
    },
    (root, a) => ops.repad(root, a.collection, { width: a.width, dry_run: a.dry_run }),
  );

  tool(
    "batch_update",
    "Apply update-style changes to many initiatives (tickets/issues) in one call — e.g. recording statuses across an adopted folder. Each entry is a ref plus any of status, reason, type, owner, tags, status_note, docs, dimensions; `status: \"from-text\"` takes the status from the initiative's **Status:** line or ## Status section. Every entry is checked first: if any fails, nothing is written and every failure is returned. `dry_run: true` shows what each file would get.",
    {
      entries: z
        .array(
          z.object({
            ref: refArg,
            collection: z.string().optional(),
            status: z.string().optional(),
            reason: z.string().optional(),
            type: z.string().optional(),
            owner: z.string().optional(),
            tags: z.array(z.string()).optional(),
            status_note: z.string().optional(),
            docs: z.array(z.string()).optional(),
            dimensions: z.record(z.string(), dimensionValue.nullable()).optional(),
          }),
        )
        .min(1),
      dry_run: z.boolean().optional(),
    },
    (root, a) => ops.batchUpdate(root, a.entries, { dry_run: a.dry_run }),
  );

  tool(
    "set_status",
    "Change an initiative's (ticket's/issue's) status, enforcing the lifecycle: designed needs no blocking open questions; in-progress needs ready; done goes through `complete`. Abandoning needs a `reason`; abandoned, superseded and deferred work gets a callout under its title saying so, which is removed when it is reopened.",
    {
      ref: refArg,
      collection: z.string().optional(),
      status: z.string().describe(`One of ${STATUSES.join(", ")} (common aliases and the collection's own status words are accepted)`),
      superseded_by: z.union([z.string(), z.number()]).optional(),
      force: z.boolean().optional(),
      reason: z
        .string()
        .optional()
        .describe("Why — required to abandon, optional to supersede or defer. Kept as status_note and shown in a callout under the initiative's title and in the README."),
      outcome: z.string().optional().describe("The fuller account (what was learned, what replaced it), written into ## Outcome."),
      branch: z.string().optional().describe("Starting work (in-progress): the branch it is built on, if not the one checked out here — recorded so others can see it."),
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
    "Add or remove dependency links. Dependencies are the links under an initiative's `## Dependencies` heading (blocking); `## Related` links are non-blocking. Adds a bullet with a relative link (and optional `why`); removes the bullet(s) linking to the target — bullets only: a link inside a paragraph is left in place and reported with its line, to edit by hand. Refuses unknown initiatives and cycles.",
    {
      ref: refArg,
      collection: z.string().optional(),
      add: refList.optional(),
      remove: refList.optional(),
      related_add: refList.optional(),
      related_remove: refList.optional(),
      why: z.string().optional().describe("Why the added dependency is needed (appended to each new bullet)"),
    },
    (root, a) => ops.setDependencies(root, resolveRef(root, a.ref, a.collection), a),
  );

  tool(
    "complete",
    'Mark an initiative (ticket/issue) done — "close" it. `docs_impact` is required: the project doc paths updated in this change, or "none: <reason>". Reports which initiatives became ready.',
    {
      ref: refArg,
      collection: z.string().optional(),
      docs_impact: z
        .union([z.array(z.string()), z.string()])
        .optional()
        .describe(
          'Project doc paths updated in this change, relative to the repository root (bare paths, no notes) — not initiative files; or "none: <reason>". Required, except for spikes (defaults to none).',
        ),
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
    { description: "A theme as one document: its overview doc (if any), then every initiative tagged with it, across collections", mimeType: "text/markdown" },
    async (uri, vars) => {
      const root = open().root;
      const tag = String(vars["tag"]);
      const items = allInitiatives(root).filter((i) => i.tags.includes(tag));
      const desc = declaredTags(root)?.[tag];
      const doc = themeFor(root, tag);
      const text = [
        `# Theme: ${tag}`,
        ...(desc ? ["", desc] : []),
        ...(doc ? [`\n---\n\n<!-- theme overview (${doc.rel}) -->\n\n${readFileSync(doc.file, "utf8")}`] : []),
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
      description: "Work through an initiative's (ticket's/issue's) open questions with the user, one at a time, grounded in the code.",
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
${themesOf(root, i).map((t) => `Theme "${t.tag}": read the overview \`${t.doc}\` first — it explains how this initiative fits the wider theme.`).join("\n")}

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
      description: "Hand-off brief for an agent implementing one initiative (ticket/issue).",
      argsSchema: { ref: z.string().describe('Initiative: "collection#n" or a number') },
    },
    ({ ref }) => {
      const root = open().root;
      const i = resolveRef(root, ref);
      if (i.type === "spike") return prompt(spikeBrief(root, i));
      const report = dependencyReport(root, i);
      const done = report.filter((x) => x.classification === "satisfied");
      const agent = agentFile(root, i);
      const docs = i.docs.length ? i.docs : (findCollection(root, i.collection)?.meta.docs ?? []);
      return prompt(`Implement initiative ${initiativeKey(i)} "${i.title}" — this one only; do not pick up other initiatives.

${themesOf(root, i).map((t) => `**Theme "${t.tag}":** read the overview \`${t.doc}\` for how this fits the wider theme; if your change alters the theme's model, update that doc too.\n`).join("")}${agent ? `**Repo workflow:** read and follow \`${agent}\` (worktrees, verification, commits). Where it conflicts with the generic rules below on repo specifics, it wins.\n` : ""}
${verifyStep(root, i)}
## Step 2 — before writing code

- Ask about any product, data or API choice the initiative doesn't settle before writing code. \`(implementation)\` questions are yours to settle — record each decision in the initiative (\`resolve_question\`).
- Set \`status\` to in-progress (\`set_status\`) when you begin.
- If you work in a git worktree: once it exists, call \`use_worktree\` with its path, so every Brindley edit (status, questions, \`complete\`) lands in that worktree and its commit. After merging, call \`use_worktree()\` with no path before removing the worktree.

## While building

- If you reach a decision the initiative doesn't settle and that matters to what you build — a placement, a contract detail, an ordering — don't guess and build on the guess. Record it with \`add_question\` as an ordinary question (not \`implementation\`) and stop to ask. The initiative stays in-progress; \`check_ready\` fails until you settle it with \`resolve_question\`, then carry on.
- \`(implementation)\` questions are only for choices that are genuinely yours, such as naming or internal structure.

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
    "spike",
    {
      description:
        "Hand-off brief for a spike (type: spike): build enough to measure what the initiative's ## Measures asks, record ## Findings, and keep the code on its own branch — it may become the basis of the real implementation.",
      argsSchema: { ref: z.string().describe('Spike initiative: "collection#n" or a number') },
    },
    ({ ref }) => {
      const root = open().root;
      return prompt(spikeBrief(root, resolveRef(root, ref)));
    },
  );

  server.registerPrompt(
    "triage",
    {
      description: "Review the initiatives (tickets/issues): stale drafts, unresolved questions, blocked chains, unconfirmed external dependencies, and what to pick next.",
      argsSchema: { collection: z.string().optional() },
    },
    ({ collection }) => {
      const root = open().root;
      const items = allInitiatives(root).filter((i) => !collection || i.collection === canonicalCollection(root, collection));
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
