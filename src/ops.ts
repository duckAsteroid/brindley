import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { COLLECTION_STATUSES, STATUSES, type Collection, type Initiative, type Root } from "./model.js";
import {
  OPEN_QUESTIONS,
  appendToSection,
  editFrontMatter,
  findSection,
  headings,
  joinFrontMatter,
  lines,
  parseFrontMatter,
  parseQuestions,
  replaceLines,
  setH1,
  setSection,
  slugify,
  splitFrontMatter,
} from "./markdown.js";
import {
  BrindleyError,
  findCollection,
  initiativeKey,
  loadRoot,
  lookup,
  parseRef,
  requireCollection,
  resolveRef,
  toPosix,
} from "./repo.js";
import { blockers, dependants, dependencyReport, isReady, wouldCycle } from "./deps.js";
import { changedSinceHead, highestNumberElsewhere } from "./git.js";
import { regenerate } from "./readme.js";
import { checkDocs, docsGlobs, isProjectDoc } from "./docs.js";

export function today(): string {
  return process.env["BRINDLEY_TODAY"] ?? new Date().toISOString().slice(0, 10);
}

export interface OpResult<T = unknown> {
  result: T;
  /** Repo-relative paths written. */
  touched: string[];
  warnings: string[];
}

function rel(root: Root, abs: string): string {
  return toPosix(relative(root.repoRoot, abs));
}

/**
 * Reload, regenerate collection READMEs, and collect touched files. Every
 * collection is regenerated because cross-collection dependencies change other
 * collections' readiness; output is deterministic, so unaffected READMEs aren't rewritten.
 */
function finish<T>(root: Root, _collections: string[], written: string[], result: T, warnings: string[] = []): OpResult<T> {
  const fresh = loadRoot(root.repoRoot);
  const changes = regenerate(fresh);
  const touched = [...new Set([...written.map((w) => rel(root, w)), ...changes.map((c) => rel(root, c.path))])];
  return { result, touched, warnings };
}

function writeInitiative(i: Initiative, changes: Record<string, unknown>, body?: string): void {
  const fm = editFrontMatter(i.fmText, { ...changes, updated: today() });
  writeFileSync(i.file, joinFrontMatter(fm, body ?? i.body));
}

/** Validate a repo-relative folder path for a collection. */
function checkFolderPath(path: string): string {
  const p = toPosix(path).replace(/^\.\//, "").replace(/^\/+|\/+$/g, "");
  if (!p || p.split("/").some((seg) => seg === ".." || seg === "." || seg.startsWith(".")))
    throw new BrindleyError(`Invalid collection folder "${path}" (use a path relative to the repo root).`);
  if (/^\d+-/.test(p.split("/").pop()!))
    throw new BrindleyError(`Collection folder names must not start with "<number>-" (reserved for asset directories): "${path}".`);
  return p;
}

function refValue(raw: string | number): string | number {
  if (typeof raw === "number") return raw;
  return /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : raw.trim();
}

// ---------------------------------------------------------------------------
// Setup

export const AGENT_SNIPPET = `## Initiatives
Planned work lives in Brindley collections: folders whose \`README.md\` front-matter contains
\`brindley: 1\`, holding one Markdown file per initiative, named \`<number>-<slug>.md\`
(format: https://github.com/duckAsteroid/brindley/blob/main/FORMAT.md).
- Never rename or move initiative files or their asset directories. Status is the \`status\`
  front-matter field.
- Implement only an initiative that is \`designed\` and whose numbered \`depends_on\` are all
  \`done\`. Confirm string (external) dependencies yourself; report any you cannot confirm.
- Ask about open questions before implementing; \`(implementation)\` questions are yours to
  settle — record the decision in the initiative.
- When discussing open questions with the user: one at a time, in open chat (no form or
  multiple-choice prompts), grounded in the actual code (cite \`path:line\`; say "unclear from
  code" rather than guess), with concrete examples from the real domain. Record each decision
  in the initiative as it is made.
- On completion, in the same commit as the code: update the project docs to describe the code
  as it now is — present tense, no history, no rejected alternatives, no links to initiatives —
  and record \`docs_impact\` (files updated, or \`none: <reason>\`); settle the initiative's
  wording, moving rejected alternatives into \`## Appendix: Rejected alternatives\`; set
  \`status: done\` and \`updated\`.
- New initiative: next number in the collection, filename \`<number>-<slug>.md\`,
  \`status: draft\`, and a \`type\` (e.g. \`feature\`, \`bug\`, \`refactor\`).
`;

export interface CollectionInput {
  name?: string;
  title?: string;
  summary?: string;
  status?: string;
  owner?: string;
  link?: string;
  agent?: string;
  docs?: string[];
  types?: string[];
  tags?: Record<string, string>;
}

const COLLECTION_KEYS = ["name", "title", "summary", "status", "owner", "link", "agent", "docs", "types", "tags"] as const;

/** Keep only collection README fields, dropping undefined values and any other arguments. */
function collectionFields(input: CollectionInput): Record<string, unknown> {
  return Object.fromEntries(COLLECTION_KEYS.map((k) => [k, input[k]]).filter(([, v]) => v !== undefined));
}

/**
 * Mark a folder as a collection: add `brindley: 1` (and any details) to its
 * README.md front-matter, creating the folder and README if needed. Works on a
 * folder that already holds numbered initiative files.
 */
function markCollection(root: Root, path: string, meta: CollectionInput): { path: string; name: string; readme: string } {
  const p = checkFolderPath(path);
  const existing = root.collections.find((c) => c.path === p);
  if (existing) throw new BrindleyError(`${p} is already a collection ("${existing.name}").`);
  const name = meta.name ?? p.split("/").pop()!;
  const clash = root.collections.find((c) => c.name === name);
  if (clash) throw new BrindleyError(`A collection named "${name}" already exists at ${clash.path}; pass a distinct \`name\`.`);
  const dir = join(root.repoRoot, p);
  mkdirSync(dir, { recursive: true });
  const readme = join(dir, "README.md");
  const fields = collectionFields({ ...meta, status: meta.status ?? "active" });
  if (existsSync(readme)) {
    const { fmText, body } = splitFrontMatter(readFileSync(readme, "utf8"));
    const fm = editFrontMatter(fmText, { brindley: 1, ...fields });
    writeFileSync(readme, joinFrontMatter(fm, meta.title ? setH1(body, meta.title) : body));
  } else {
    const title = meta.title ?? p.split("/").pop()!;
    const body = `# ${title}\n${meta.summary ? `\n${meta.summary}\n` : ""}`;
    writeFileSync(readme, joinFrontMatter(editFrontMatter(null, { brindley: 1, ...fields }), body));
  }
  return { path: p, name, readme };
}

export function createCollection(
  root: Root,
  path: string,
  meta: CollectionInput,
): OpResult<{ collection: string; path: string; agentSnippet?: string }> {
  const first = root.collections.length === 0;
  const m = markCollection(root, path, meta);
  return finish(root, [m.name], [m.readme], {
    collection: m.name,
    path: m.path,
    // The first collection in a repo: hand back the instructions for AGENTS.md / CLAUDE.md.
    ...(first ? { agentSnippet: AGENT_SNIPPET } : {}),
  });
}

export function updateCollection(root: Root, nameOrPath: string, changes: CollectionInput): OpResult<{ collection: string }> {
  const c = requireCollection(root, nameOrPath);
  if (changes.name !== undefined && changes.name !== c.name)
    throw new BrindleyError("A collection's name can't be changed here: references to it would break.");
  if (changes.status && !(COLLECTION_STATUSES as readonly string[]).includes(changes.status))
    throw new BrindleyError(`Collection status must be one of ${COLLECTION_STATUSES.join(", ")}.`);
  const warnings: string[] = [];
  if (changes.status === "done") {
    const open = c.initiatives.filter((i) => ["draft", "designed", "in-progress"].includes(i.status ?? ""));
    if (open.length) warnings.push(`Collection marked done with open initiatives: ${open.map((i) => i.number).join(", ")}.`);
  }
  const { fmText, body } = splitFrontMatter(readFileSync(c.readme, "utf8"));
  const defined = collectionFields({ ...changes, name: undefined });
  const newBody = changes.title ? setH1(body, changes.title) : body;
  writeFileSync(c.readme, joinFrontMatter(editFrontMatter(fmText, defined), newBody));
  return finish(root, [c.name], [c.readme], { collection: c.name }, warnings);
}

// ---------------------------------------------------------------------------
// Initiatives

export interface CreateInput {
  collection: string;
  title: string;
  type?: string;
  tags?: string[];
  goal?: string;
  depends_on?: (string | number)[];
  related?: (string | number)[];
  owner?: string;
}

export function nextNumber(root: Root, c: Collection): { number: number; note?: string } {
  const local = Math.max(0, ...c.initiatives.map((i) => i.number));
  const elsewhere = highestNumberElsewhere(root.repoRoot, c.path);
  return {
    number: Math.max(local, elsewhere.max) + 1,
    note: elsewhere.usedGit ? undefined : "git unavailable: number allocated from the working tree only.",
  };
}

export function create(root: Root, input: CreateInput): OpResult<{ ref: string; number: number; path: string }> {
  let c = findCollection(root, input.collection);
  const written: string[] = [];
  if (!c) {
    if (!input.collection.includes("/"))
      throw new BrindleyError(
        `No collection "${input.collection}". Mark a folder as a collection with create_collection, or pass a folder path to create one here.`,
      );
    const m = markCollection(root, input.collection, {});
    written.push(m.readme);
    root = loadRoot(root.repoRoot);
    c = requireCollection(root, m.path);
  }
  const { number, note } = nextNumber(root, c);
  const deps = (input.depends_on ?? []).map(refValue);
  const related = (input.related ?? []).map(refValue);
  for (const r of [...deps, ...related]) {
    const ref = parseRef(r, c.name);
    if (ref.kind === "initiative" && !lookup(root, ref.collection, ref.number))
      throw new BrindleyError(`Dependency ${ref.raw} does not exist.`);
  }
  const fm = editFrontMatter(null, {
    ...(input.type ? { type: input.type } : {}),
    status: "draft",
    ...(deps.length ? { depends_on: deps } : {}),
    ...(related.length ? { related } : {}),
    ...(input.tags?.length ? { tags: input.tags } : {}),
    ...(input.owner ? { owner: input.owner } : {}),
    updated: today(),
  });
  const depLines = deps.length ? deps.map((d) => `- ${d}: _why this is needed_`).join("\n") : "_None._";
  const body = [
    `# ${input.title}`,
    "",
    "## Goal",
    "",
    input.goal?.trim() || "_What and why._",
    "",
    "## Dependencies",
    "",
    depLines,
    "",
    "## Open questions",
    "",
    "## Acceptance criteria",
    "",
  ].join("\n");
  const file = join(c.dir, `${number}-${slugify(input.title)}.md`);
  writeFileSync(file, joinFrontMatter(fm, body));
  written.push(file);
  return finish(root, [c.name], written, { ref: `${c.name}#${number}`, number, path: rel(root, file) }, note ? [note] : []);
}

export interface UpdateInput {
  title?: string;
  type?: string;
  owner?: string;
  tags?: string[];
  status_note?: string;
  docs?: string[];
  section?: string;
  content?: string;
}

export function update(root: Root, i: Initiative, input: UpdateInput): OpResult<{ ref: string }> {
  let body = i.body;
  if (input.title) body = setH1(body, input.title);
  if (input.section !== undefined) {
    if (input.content === undefined) throw new BrindleyError("`content` is required with `section`.");
    if (input.section.trim().toLowerCase() === OPEN_QUESTIONS.toLowerCase())
      throw new BrindleyError("Use add_question / resolve_question to change open questions.");
    body = setSection(body, input.section, input.content);
  }
  const changes: Record<string, unknown> = {};
  for (const k of ["type", "owner", "tags", "status_note", "docs"] as const) if (input[k] !== undefined) changes[k] = input[k];
  writeInitiative(i, changes, body);
  return finish(root, [i.collection], [i.file], { ref: initiativeKey(i) });
}

export function setStatus(
  root: Root,
  i: Initiative,
  status: string,
  opts: { force?: boolean; superseded_by?: string | number } = {},
): OpResult<{ ref: string; status: string }> {
  if (!(STATUSES as readonly string[]).includes(status)) throw new BrindleyError(`Status must be one of ${STATUSES.join(", ")}.`);
  const warnings: string[] = [];
  const refuse = (why: string) => {
    if (!opts.force) throw new BrindleyError(`${why} (pass force to override).`);
    warnings.push(`Forced: ${why}`);
  };
  if (status === "designed") {
    const blocking = i.questions.filter((q) => !q.resolved && !q.implementation);
    if (blocking.length) refuse(`${blocking.length} blocking open question(s) remain`);
  }
  if (status === "in-progress") {
    if (i.status !== "designed") refuse(`Only a designed initiative can start (currently ${i.status})`);
    const b = blockers(root, i);
    if (b.length) refuse(`Blocked by ${b.map((d) => d.ref).join(", ")}`);
  }
  if (status === "done") refuse("Use `complete`, which records docs_impact");
  const changes: Record<string, unknown> = { status };
  if (status === "superseded") {
    if (opts.superseded_by === undefined) throw new BrindleyError("`superseded_by` is required for status superseded.");
    const r = parseRef(refValue(opts.superseded_by), i.collection);
    if (r.kind !== "initiative" || !lookup(root, r.collection, r.number)) throw new BrindleyError(`No initiative ${r.raw}.`);
    changes["superseded_by"] = refValue(opts.superseded_by);
  }
  writeInitiative(i, changes);
  return finish(root, [i.collection], [i.file], { ref: initiativeKey(i), status }, warnings);
}

export function addQuestion(root: Root, i: Initiative, text: string, implementation = false): OpResult<{ ref: string; index: number; status: string | undefined }> {
  const clean = text.trim().replace(/^[-*+]\s+/, "");
  const item = `- ${implementation && !/^\(implementation\)/i.test(clean) ? "(implementation) " : ""}${clean}`;
  const body = appendToSection(i.body, OPEN_QUESTIONS, item, ["Acceptance criteria"]);
  const warnings: string[] = [];
  const changes: Record<string, unknown> = {};
  let status = i.status;
  if (i.status === "designed" && !implementation) {
    changes["status"] = "draft";
    status = "draft";
    warnings.push("A blocking question was added to a designed initiative; it is back to draft.");
  }
  writeInitiative(i, changes, body);
  const index = parseQuestions(body).length;
  return finish(root, [i.collection], [i.file], { ref: initiativeKey(i), index, status }, warnings);
}

export function findQuestion(i: Initiative, sel: { index?: number; match?: string }) {
  const q =
    sel.index !== undefined
      ? i.questions.find((x) => x.index === sel.index)
      : sel.match
        ? i.questions.find((x) => x.text.toLowerCase().includes(sel.match!.toLowerCase()))
        : undefined;
  if (!q) throw new BrindleyError("No matching open question (give `index` or `match`).");
  return q;
}

export function resolveQuestion(
  root: Root,
  i: Initiative,
  sel: { index?: number; match?: string },
  answer: string,
  opts: { record_in?: string; mode?: "remove" | "tick" } = {},
): OpResult<{ ref: string; question: string; recordedIn: string | null; section: string }> {
  const q = findQuestion(i, sel);
  if (q.resolved) throw new BrindleyError(`Question ${q.index} is already resolved.`);
  const mode = opts.mode ?? "remove";
  let body: string;
  let recordedIn: string | null = null;
  if (mode === "tick") {
    const ls = lines(i.body);
    ls[q.start] = ls[q.start]!.replace(/^([-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, "$1 [x] ");
    ls[q.end - 1] = `${ls[q.end - 1]!.replace(/\s+$/, "")} — ${answer.trim()}`;
    body = ls.join("\n");
  } else {
    const ls = lines(i.body);
    let end = q.end;
    // Swallow one blank line so removing an item doesn't leave a gap.
    if (ls[end] !== undefined && ls[end]!.trim() === "" && (q.start === 0 || ls[q.start - 1]!.trim() === "")) end++;
    body = replaceLines(i.body, q.start, end, []);
    recordedIn = opts.record_in ?? "Decisions";
    const decision = answer.trim().split("\n").map((l, k) => (k === 0 ? `- ${l}` : `  ${l}`)).join("\n");
    body = appendToSection(body, recordedIn, decision, [OPEN_QUESTIONS, "Acceptance criteria"]);
  }
  writeInitiative(i, {}, body);
  const sectionName = recordedIn ?? OPEN_QUESTIONS;
  const s = findSection(body, sectionName);
  const section = s ? lines(body).slice(s.heading.line, s.end).join("\n").trim() : "";
  return finish(root, [i.collection], [i.file], { ref: initiativeKey(i), question: q.text, recordedIn, section });
}

export function nextQuestion(i: Initiative, after?: number) {
  const open = i.questions.filter((q) => !q.resolved);
  const blocking = open.filter((q) => !q.implementation);
  const q = blocking.find((x) => after === undefined || x.index > after) ?? null;
  return {
    ref: initiativeKey(i),
    question: q ? { index: q.index, text: q.text } : null,
    remaining: blocking.filter((x) => after === undefined || x.index > after).length,
    implementationQuestions: open.filter((x) => x.implementation).map((x) => ({ index: x.index, text: x.text })),
    sections: headings(i.body).filter((h) => h.level === 2).map((h) => h.text),
  };
}

export function setDependencies(
  root: Root,
  i: Initiative,
  input: { add?: (string | number)[]; remove?: (string | number)[]; related_add?: (string | number)[]; related_remove?: (string | number)[] },
): OpResult<{ ref: string; depends_on: unknown[]; related: unknown[] }> {
  const warnings: string[] = [];
  const same = (a: string | number, b: string | number) => String(refValue(a)) === String(refValue(b));
  const current = (key: string) => {
    const v = i.fm[key];
    return (Array.isArray(v) ? v : v === undefined ? [] : [v]) as (string | number)[];
  };
  const apply = (list: (string | number)[], add: (string | number)[] = [], remove: (string | number)[] = [], blocking: boolean) => {
    let out = list.filter((x) => !remove.some((r) => same(x, r)));
    for (const a of add.map(refValue)) {
      if (out.some((x) => same(x, a))) continue;
      const r = parseRef(a, i.collection);
      if (r.kind === "initiative") {
        const t = lookup(root, r.collection, r.number);
        if (!t) throw new BrindleyError(`No initiative ${r.raw}.`);
        if (t === i) throw new BrindleyError("An initiative cannot depend on itself.");
        if (blocking && wouldCycle(root, i, t)) throw new BrindleyError(`Adding ${r.raw} would create a dependency cycle.`);
      }
      out = [...out, a];
    }
    return out;
  };
  const deps = apply(current("depends_on"), input.add, input.remove, true);
  const related = apply(current("related"), input.related_add, input.related_remove, false);
  const narrative = findSection(i.body, "Dependencies");
  const narrativeText = narrative ? lines(i.body).slice(narrative.start, narrative.end).join("\n") : "";
  for (const a of input.add ?? []) {
    const v = String(refValue(a));
    if (!new RegExp(`(^|[^0-9])${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^0-9]|$)`).test(narrativeText))
      warnings.push(`The "## Dependencies" section doesn't mention ${v}; add a line saying why it is needed.`);
  }
  writeInitiative(i, { depends_on: deps.length ? deps : undefined, related: related.length ? related : undefined });
  return finish(root, [i.collection], [i.file], { ref: initiativeKey(i), depends_on: deps, related }, warnings);
}

export function complete(
  root: Root,
  i: Initiative,
  docsImpact: string | string[],
): OpResult<{ ref: string; becameReady: string[]; docFindings: unknown[] }> {
  const warnings: string[] = [];
  const collection = requireCollection(root, i.collection);
  let impact: string | string[];
  if (typeof docsImpact === "string" && /^none:/i.test(docsImpact.trim())) {
    if (docsImpact.trim().slice(5).trim().length === 0) throw new BrindleyError("`docs_impact: none:` needs a reason.");
    impact = docsImpact.trim();
  } else {
    const paths = (Array.isArray(docsImpact) ? docsImpact : [docsImpact]).map((p) => toPosix(p).replace(/^\.\//, "")).filter(Boolean);
    if (paths.length === 0) throw new BrindleyError('`docs_impact` must list the docs updated, or be "none: <reason>".');
    const globs = docsGlobs(root, collection.meta.docs);
    if (!globs.length) warnings.push("No `docs` globs declared in any collection README; doc paths were not checked against them.");
    let gitChecked = true;
    for (const p of paths) {
      if (!existsSync(join(root.repoRoot, p))) throw new BrindleyError(`docs_impact path does not exist: ${p}`);
      if (globs.length && !isProjectDoc(root, p, globs)) throw new BrindleyError(`${p} is not project documentation (does not match the \`docs\` globs).`);
      const changed = changedSinceHead(root.repoRoot, p);
      if (changed === false) throw new BrindleyError(`${p} has not been changed in this change (no difference from HEAD).`);
      if (changed === null) gitChecked = false;
    }
    if (!gitChecked) warnings.push("git unavailable: could not confirm docs were edited.");
    impact = paths;
  }
  if (i.status !== "in-progress") warnings.push(`Completing an initiative that was ${i.status}, not in-progress.`);
  const open = i.questions.filter((q) => !q.resolved);
  if (open.length) warnings.push(`${open.length} open question(s) remain unresolved.`);
  const debate = headings(i.body).find(
    (h) => h.level === 2 && /rejected alternatives|alternatives considered|options considered/i.test(h.text) && !/^appendix/i.test(h.text),
  );
  if (debate) warnings.push(`"## ${debate.text}" is in the main body; move it to "## Appendix: Rejected alternatives".`);

  const before = new Set(dependants(root, i).filter((d) => isReady(root, d)).map(initiativeKey));
  writeInitiative(i, { status: "done", docs_impact: impact });
  const out = finish(root, [i.collection], [i.file], { ref: initiativeKey(i), becameReady: [] as string[], docFindings: [] as unknown[] }, warnings);
  const fresh = loadRoot(root.repoRoot);
  const self = lookup(fresh, i.collection, i.number)!;
  out.result.becameReady = dependants(fresh, self)
    .filter((d) => isReady(fresh, d) && !before.has(initiativeKey(d)))
    .map(initiativeKey);
  if (Array.isArray(impact)) out.result.docFindings = checkDocs(fresh, impact).findings;
  return out;
}

export function regenerateReadmes(root: Root, collection?: string, check = false) {
  const cs = collection ? [requireCollection(root, collection)] : undefined;
  const changes = regenerate(root, { collections: cs, check });
  return changes.map((c) => ({ path: rel(root, c.path), reason: c.reason }));
}

export { dependencyReport, resolveRef };
