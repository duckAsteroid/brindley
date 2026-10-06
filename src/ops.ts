import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import { COLLECTION_STATUSES, STATUSES, normaliseStatus, type Collection, type Initiative, type Root } from "./model.js";
import {
  DEPENDENCIES,
  OPEN_QUESTIONS,
  RELATED,
  listItems,
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
  ignoreMatcher,
  loadRoot,
  lookup,
  numberedFilesMatching,
  parseRef,
  requireCollection,
  resolveRef,
  toPosix,
} from "./repo.js";
import { blockers, dependants, dependencyReport, isReady, wouldCycle } from "./deps.js";
import { changedSinceHead, highestNumberElsewhere, otherWorktrees } from "./git.js";
import { regenerate } from "./readme.js";
import { checkDocs, docsGlobs, inCollection, isProjectDoc } from "./docs.js";

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

export const AGENT_SNIPPET = `## Initiatives (tickets / issues)
Planned work lives in Brindley collections — "initiative", "ticket" and "issue" all mean the same
thing: folders whose \`README.md\` front-matter contains
\`brindley: 1\`, holding one Markdown file per initiative, named \`<number>-<slug>.md\`
(format: https://github.com/duckAsteroid/brindley/blob/main/FORMAT.md).
- Never rename or move initiative files or their asset directories. Status is the \`status\`
  front-matter field.
- Dependencies are the links under an initiative's \`## Dependencies\` heading (non-blocking
  links go under \`## Related\`). Implement only an initiative that is \`designed\` and whose
  linked initiatives are all \`done\`. Confirm external (http) dependencies yourself; report any
  you cannot confirm.
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
- A spike (\`type: spike\`) measures what its \`## Measures\` section asks and records
  \`## Findings\`; its code stays on its own branch and may become the basis of the real
  implementation, so write it to be built on.
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
  statuses?: Record<string, string>;
  ignore?: string[];
  aliases?: string[];
}

const COLLECTION_KEYS = ["name", "aliases", "title", "summary", "status", "owner", "link", "agent", "docs", "types", "tags", "statuses", "ignore"] as const;

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
  const clash = root.collections.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (clash) throw new BrindleyError(`A collection named "${name}" already exists at ${clash.path}; pass a distinct \`name\`.`);
  for (const a of meta.aliases ?? []) {
    const owner = findCollection(root, a);
    if (owner) throw new BrindleyError(`Alias "${a}" already refers to collection "${owner.name}".`);
  }
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

/**
 * Add or remove `ignore:` patterns on a collection (or, with dryRun, preview them). Returns the
 * resulting patterns, the numbered files they ignore, and which files changed status.
 */
export function setIgnore(
  root: Root,
  nameOrPath: string,
  input: { add?: string[]; remove?: string[]; dryRun?: boolean },
): OpResult<{ collection: string; patterns: string[]; ignored: string[]; newlyIgnored: string[]; noLongerIgnored: string[]; dryRun: boolean }> {
  const c = requireCollection(root, nameOrPath);
  const current = c.meta.ignore ?? [];
  let patterns = current.filter((p) => !(input.remove ?? []).includes(p));
  for (const p of input.add ?? []) if (!patterns.includes(p)) patterns = [...patterns, p];
  const ignored = numberedFilesMatching(c.dir, ignoreMatcher(patterns));
  const before = new Set(c.ignored);
  const result = {
    collection: c.name,
    patterns,
    ignored,
    newlyIgnored: ignored.filter((f) => !before.has(f)),
    noLongerIgnored: c.ignored.filter((f) => !ignored.includes(f)),
    dryRun: !!input.dryRun,
  };
  const warnings = (input.remove ?? []).filter((p) => !current.includes(p)).map((p) => `Pattern "${p}" was not in the list.`);
  if (input.dryRun) return { result, touched: [], warnings };
  const { fmText, body } = splitFrontMatter(readFileSync(c.readme, "utf8"));
  writeFileSync(c.readme, joinFrontMatter(editFrontMatter(fmText, { ignore: patterns.length ? patterns : undefined }), body));
  return finish(root, [c.name], [c.readme], result, warnings);
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
  const fileRel = `${c.path}/${number}-${slugify(input.title)}.md`;
  const bullets = (refs: (string | number)[] | undefined) =>
    (refs ?? []).map((r) => `- ${linkTo(root, fileRel, c!.name, r)} — _why this is needed_`);
  const deps = bullets(input.depends_on);
  const related = bullets(input.related);
  const fm = editFrontMatter(null, {
    ...(input.type ? { type: input.type } : {}),
    status: "draft",
    ...(input.tags?.length ? { tags: input.tags } : {}),
    ...(input.owner ? { owner: input.owner } : {}),
    updated: today(),
  });
  const body = [
    `# ${input.title}`,
    "",
    "## Goal",
    "",
    input.goal?.trim() || "_What and why._",
    "",
    "## Dependencies",
    "",
    ...(deps.length ? deps : ["_None._"]),
    "",
    ...(related.length ? ["## Related", "", ...related, ""] : []),
    ...(input.type === "spike" ? SPIKE_SECTIONS : []),
    "## Open questions",
    "",
    "## Acceptance criteria",
    "",
  ].join("\n");
  const file = join(root.repoRoot, fileRel);
  writeFileSync(file, joinFrontMatter(fm, body));
  written.push(file);
  return finish(root, [c.name], written, { ref: `${c.name}#${number}`, number, path: rel(root, file) }, note ? [note] : []);
}

export const MEASURES = "Measures";
export const FINDINGS = "Findings";

/** Extra skeleton for `type: spike`: what it measures, settled during design; and its findings. */
const SPIKE_SECTIONS = [
  "## Measures",
  "",
  "- **Question:** _what this spike must answer_",
  "- **Hypothesis:** _what we expect, and why_",
  "- **Measure:** _what is measured, and how_",
  "- **Answer criteria:** _the threshold(s) that mean yes / no_",
  "- **Time-box:** _e.g. 3 days_",
  "",
  "## Findings",
  "",
  "_Written when the spike completes: method, results against the criteria, conclusion, and whether the code should be adopted, adapted or abandoned (and where it lives)._",
  "",
];

/** Is a section missing, empty, or still only the skeleton's placeholder text? */
export function sectionIsBlank(body: string, name: string): boolean {
  const s = findSection(body, name);
  if (!s) return true;
  // Drop placeholder italics (_…_) and bold labels (**Question:**), then list punctuation.
  const text = lines(body)
    .slice(s.start, s.end)
    .join("\n")
    .replace(/_[^_\n]*_/g, "")
    .replace(/\*\*[^*\n]*\*\*/g, "")
    .replace(/[-*:\s]/g, "");
  return text.length === 0;
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
  const core = normaliseStatus(status, findCollection(root, i.collection)?.meta.statuses);
  if (!core) throw new BrindleyError(`Unknown status "${status}". Use one of ${STATUSES.join(", ")} or a known alias.`);
  status = core;
  const warnings: string[] = [];
  if (i.folder) warnings.push(`The file stays in "${i.folder}/" (Brindley never moves files); its front-matter status now takes precedence over the folder.`);
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

/** A Markdown link from the file at repo-relative `fromRel` to an initiative ref or a URL. */
function linkTo(root: Root, fromRel: string, fromCollection: string, ref: string | number): string {
  const r = String(ref).trim();
  if (/^https?:\/\//i.test(r)) return `[${r}](${r})`;
  const t = resolveRef(root, r, fromCollection);
  const label = t.collection === fromCollection ? `${t.number}` : initiativeKey(t);
  return `[${label} ${t.title ?? t.slug}](${posix.relative(posix.dirname(fromRel), t.rel)})`;
}

/** Does a link (as written in `i`) point at initiative `t` (or, for URLs, equal `url`)? */
function linkHits(i: Initiative, href: string, t: Initiative | null, url: string | null): boolean {
  if (url) return href === url;
  if (!t) return false;
  const path = href.split("#")[0]!;
  return resolve(dirname(i.file), path) === t.file || path.split("/").pop() === t.file.split(sep).pop();
}

export function setDependencies(
  root: Root,
  i: Initiative,
  input: {
    add?: (string | number)[];
    remove?: (string | number)[];
    related_add?: (string | number)[];
    related_remove?: (string | number)[];
    why?: string;
  },
): OpResult<{ ref: string; dependencies: string; related: string }> {
  const warnings: string[] = [];
  let body = i.body;
  const edit = (section: string, add: (string | number)[] = [], remove: (string | number)[] = [], blocking: boolean) => {
    for (const x of remove) {
      const url = /^https?:\/\//i.test(String(x)) ? String(x) : null;
      const t = url ? null : resolveRef(root, x, i.collection);
      const s = findSection(body, section);
      const items = s ? listItems(body, s.start, s.end) : [];
      const hits = items.filter((item) =>
        [...lines(body).slice(item.start, item.end).join("\n").matchAll(/\]\(\s*<?([^)\s>]+)/g)].some((m) => linkHits(i, m[1]!, t, url)),
      );
      if (hits.length === 0) warnings.push(`${x} is not linked under "## ${section}".`);
      for (const item of [...hits].reverse()) body = replaceLines(body, item.start, item.end, []);
      const after = findSection(body, section);
      if (after && lines(body).slice(after.start, after.end).every((l) => l.trim() === "") && blocking)
        body = setSection(body, section, "_None._");
    }
    for (const x of add) {
      const url = /^https?:\/\//i.test(String(x));
      if (!url) {
        const t = resolveRef(root, x, i.collection);
        if (t === i) throw new BrindleyError("An initiative cannot depend on itself.");
        if (blocking && wouldCycle(root, i, t)) throw new BrindleyError(`Adding ${initiativeKey(t)} would create a dependency cycle.`);
        const existing = blocking ? i.dependsOn : i.related;
        if (existing.some((r) => r.kind === "initiative" && r.collection === t.collection && r.number === t.number)) {
          warnings.push(`${initiativeKey(t)} is already linked under "## ${section}".`);
          continue;
        }
      }
      const item = `- ${linkTo(root, i.rel, i.collection, x)}${input.why ? ` — ${input.why}` : ""}`;
      const s = findSection(body, section);
      const content = s ? lines(body).slice(s.start, s.end).filter((l) => l.trim() !== "") : [];
      if (s && content.length === 1 && /^_?none\.?_?$/i.test(content[0]!.trim())) body = setSection(body, section, item);
      else body = appendToSection(body, section, item, [...(blocking ? [RELATED] : []), OPEN_QUESTIONS, "Acceptance criteria"]);
    }
  };
  edit(DEPENDENCIES, input.add, input.remove, true);
  edit(RELATED, input.related_add, input.related_remove, false);
  writeInitiative(i, {}, body);
  const sectionText = (name: string) => {
    const s = findSection(body, name);
    return s ? lines(body).slice(s.heading.line, s.end).join("\n").trim() : "";
  };
  return finish(root, [i.collection], [i.file], {
    ref: initiativeKey(i),
    dependencies: sectionText(DEPENDENCIES),
    related: sectionText(RELATED),
  }, warnings);
}

/** A docs_impact entry as a repo-relative path; absolute paths inside the repo are accepted. */
function docPath(root: Root, p: string): string {
  const rel = isAbsolute(p) ? relative(root.repoRoot, p) : p;
  return toPosix(rel).replace(/^\.\//, "");
}

/** Says where the path was looked for, and whether another worktree has it (the server works on one). */
function missingDocMessage(root: Root, p: string): string {
  if (p.startsWith("../")) return `docs_impact path ${p} is outside the repository at ${root.repoRoot}; give paths relative to its root.`;
  const elsewhere = otherWorktrees(root.repoRoot).filter((wt) => existsSync(join(wt, p)));
  const hint = elsewhere.length
    ? ` It exists in the worktree ${elsewhere.join(", ")}: this server works on ${root.repoRoot}, so run it from the worktree you are changing.`
    : " Give paths relative to the repository root.";
  return `docs_impact path does not exist in ${root.repoRoot}: ${p}.${hint}`;
}

export function complete(
  root: Root,
  i: Initiative,
  docsImpactIn: string | string[] | undefined,
): OpResult<{
  ref: string;
  becameReady: string[];
  docFindings: unknown[];
  questionsToRevisit?: { ref: string; title: string | null; questions: { index: number; text: string }[] }[];
}> {
  const warnings: string[] = [];
  const collection = requireCollection(root, i.collection);
  const spike = i.type === "spike";
  if (spike && sectionIsBlank(i.body, FINDINGS))
    warnings.push('This spike has no "## Findings" yet: record the method, results against the answer criteria, conclusion, and adopt / adapt / abandon for the code.');
  // A spike's output is knowledge recorded in the initiative, so docs are normally untouched.
  const docsImpact = docsImpactIn ?? (spike ? "none: spike — findings recorded in the initiative" : undefined);
  if (docsImpact === undefined) throw new BrindleyError('`docs_impact` is required: the docs updated, or "none: <reason>".');
  let impact: string | string[];
  if (typeof docsImpact === "string" && /^none:/i.test(docsImpact.trim())) {
    if (docsImpact.trim().slice(5).trim().length === 0) throw new BrindleyError("`docs_impact: none:` needs a reason.");
    impact = docsImpact.trim();
  } else {
    const paths = (Array.isArray(docsImpact) ? docsImpact : [docsImpact]).map((p) => docPath(root, p)).filter(Boolean);
    if (paths.length === 0) throw new BrindleyError('`docs_impact` must list the docs updated, or be "none: <reason>".');
    const globs = docsGlobs(root, collection.meta.docs);
    if (!globs.length) warnings.push("No `docs` globs declared in any collection README; doc paths were not checked against them.");
    let gitChecked = true;
    for (const p of paths) {
      if (!existsSync(join(root.repoRoot, p))) throw new BrindleyError(missingDocMessage(root, p));
      if (inCollection(root, p))
        throw new BrindleyError(`${p} is part of a collection, not project documentation; list the project docs you updated, or "none: <reason>".`);
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
  const out = finish(
    root,
    [i.collection],
    [i.file],
    {
      ref: initiativeKey(i),
      becameReady: [] as string[],
      docFindings: [] as unknown[],
    } as {
      ref: string;
      becameReady: string[];
      docFindings: unknown[];
      questionsToRevisit?: { ref: string; title: string | null; questions: { index: number; text: string }[] }[];
    },
    warnings,
  );
  const fresh = loadRoot(root.repoRoot);
  const self = lookup(fresh, i.collection, i.number)!;
  out.result.becameReady = dependants(fresh, self)
    .filter((d) => isReady(fresh, d) && !before.has(initiativeKey(d)))
    .map(initiativeKey);
  if (Array.isArray(impact)) out.result.docFindings = checkDocs(fresh, impact).findings;
  if (spike) {
    // Questions the findings may now answer: open questions in initiatives that depend on, or relate to, this spike.
    const linked = fresh.collections
      .flatMap((c) => c.initiatives)
      .filter((o) => [...o.dependsOn, ...o.related].some((r) => r.kind === "initiative" && r.collection === i.collection && r.number === i.number));
    out.result.questionsToRevisit = linked
      .map((o) => ({
        ref: initiativeKey(o),
        title: o.title,
        questions: o.questions.filter((q) => !q.resolved).map((q) => ({ index: q.index, text: q.text })),
      }))
      .filter((x) => x.questions.length > 0);
  }
  return out;
}

export function regenerateReadmes(root: Root, collection?: string, check = false) {
  const cs = collection ? [requireCollection(root, collection)] : undefined;
  const changes = regenerate(root, { collections: cs, check });
  return changes.map((c) => ({ path: rel(root, c.path), reason: c.reason }));
}

export { dependencyReport, resolveRef };

export interface Check {
  check: string;
  result: "pass" | "fail" | "note";
  detail: string;
}

/**
 * Is this initiative complete enough, and unblocked, to start work on? The first task of the
 * implement and spike briefs. Failures mean: stop and report, don't start.
 */
export function preflight(root: Root, i: Initiative, problems: { level: string; rule: string; message: string }[] = []): {
  ref: string;
  kind: "spike" | "implementation";
  ready: boolean;
  checks: Check[];
} {
  const spike = i.type === "spike";
  const checks: Check[] = [];
  const add = (check: string, ok: boolean | "note", detail: string) =>
    checks.push({ check, result: ok === "note" ? "note" : ok ? "pass" : "fail", detail });

  const startable = i.status === "designed" || i.status === "in-progress";
  add("Status", startable, startable
    ? i.status === "in-progress" ? "in-progress — resuming work already started" : "designed (design complete)"
    : `${i.status ?? "missing"} — only a designed initiative can be started`);

  const report = dependencyReport(root, i);
  const blocking = report.filter((d) => d.classification === "blocking" || d.classification === "missing");
  add("Dependencies", blocking.length === 0, blocking.length
    ? `blocked by ${blocking.map((d) => `${d.ref}${d.status ? ` (${d.status})` : " (missing)"}`).join(", ")}`
    : report.filter((d) => d.classification === "satisfied").length
      ? `all linked initiatives are done: ${report.filter((d) => d.classification === "satisfied").map((d) => d.ref).join(", ")}`
      : "none linked");
  const external = report.filter((d) => d.classification === "external");
  if (external.length) add("External dependencies", "note", `confirm yourself before starting: ${external.map((d) => d.ref).join(", ")}`);

  const open = i.questions.filter((q) => !q.resolved);
  const blockingQs = open.filter((q) => !q.implementation);
  add("Open questions", blockingQs.length === 0, blockingQs.length
    ? `${blockingQs.length} unresolved: ${blockingQs.map((q) => `${q.index}. ${q.text.slice(0, 80)}${q.text.length > 80 ? "…" : ""}`).join(" | ")}`
    : "none blocking");
  const implQs = open.filter((q) => q.implementation);
  if (implQs.length) add("Implementation questions", "note", `${implQs.length} left to you to settle and record: ${implQs.map((q) => q.index).join(", ")}`);

  if (spike) {
    add("Measures", !sectionIsBlank(i.body, MEASURES), sectionIsBlank(i.body, MEASURES)
      ? 'no usable "## Measures" (question, hypothesis, measure, answer criteria, time-box)'
      : '"## Measures" states what to measure');
  } else {
    add("Acceptance criteria", i.acceptance.length > 0, i.acceptance.length
      ? `${i.acceptance.length} criteria`
      : 'no "## Acceptance criteria" — the definition of done is missing');
  }

  const errors = problems.filter((p) => p.level === "error");
  add("Validation", errors.length === 0, errors.length ? errors.map((e) => `[${e.rule}] ${e.message}`).join(" | ") : "no errors");

  return { ref: initiativeKey(i), kind: spike ? "spike" : "implementation", ready: checks.every((c) => c.result !== "fail"), checks };
}
