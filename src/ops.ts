import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import { ASSET_DIR, COLLECTION_STATUSES, STATUSES, normaliseStatus, type Collection, type Initiative, type Root } from "./model.js";
import {
  DEPENDENCIES,
  NONE,
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
  sectionLinks,
  stripCodeFences,
  withoutInlineCode,
  setH1,
  setSection,
  setStatusCallout,
  slugify,
  splitFrontMatter,
} from "./markdown.js";
import {
  BrindleyError,
  elsewhereHint,
  findCollection,
  initiativeKey,
  ignoreMatcher,
  loadRoot,
  lookup,
  numberedFilesMatching,
  parseRef,
  readFrontMatterOf,
  requireCollection,
  resolveRef,
  statusFromText,
  toPosix,
} from "./repo.js";
import { blockers, dependants, dependencyReport, isReady, wouldCycle } from "./deps.js";
import { changedSinceHead, highestNumberElsewhere } from "./git.js";
import { regenerate } from "./readme.js";
import { checkDocs, docsGlobs, inCollection, isProjectDoc } from "./docs.js";
import { dimensionsFor, sameValue, type DimensionValue } from "./dimensions.js";
import { capacity, collectionWidth, nearFull, padNumber } from "./numbering.js";
import { applyRelink, planRefs, planRelink, type Move, type Rewrite } from "./relink.js";

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
function checkFolderPath(root: Root, path: string): string {
  const p = toPosix(path).replace(/^\.\//, "").replace(/^\/+|\/+$/g, "");
  if (!p || p.split("/").some((seg) => seg === ".." || seg === "." || seg.startsWith(".")))
    throw new BrindleyError(`Invalid collection folder "${path}" (use a path relative to the repo root, ${root.repoRoot}).`);
  // A folder that only another worktree has: creating it here would be in the wrong checkout.
  if (!existsSync(join(root.repoRoot, p)) && elsewhereHint(root, p))
    throw new BrindleyError(`${p} does not exist in ${root.repoRoot}.${elsewhereHint(root, p)}`);
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
- If, while building, you reach a decision the initiative doesn't settle and that matters to
  what you build, don't guess: add it as an ordinary open question and stop to ask. The
  initiative stays in-progress, and readiness checks fail until it is resolved. Mark a question
  \`(implementation)\` only when the choice is genuinely yours to make.
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
  const p = checkFolderPath(root, path);
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
  /** Why the dependencies are needed, appended to each `depends_on` bullet (not to related links). */
  why?: string;
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
  const fileRel = `${c.path}/${padNumber(number, collectionWidth(c))}-${slugify(input.title)}.md`;
  // A blocking link should say why it is needed, so dependencies get a prompt to fill in.
  // `why` explains the dependencies; related links have different reasons, so get none.
  const bullets = (refs: (string | number)[] | undefined, note?: string) =>
    (refs ?? []).map((r) => `- ${linkTo(root, fileRel, c!.name, r)}${note ? ` — ${note}` : ""}`);
  const deps = bullets(input.depends_on, input.why?.trim() || "_why this is needed_");
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
    ...(deps.length ? deps : [NONE]),
    "",
    ...(related.length ? ["## Related", "", ...related, ""] : []),
    ...(input.type === "spike" ? SPIKE_SECTIONS : []),
    "## Open questions",
    "",
    NONE,
    "",
    "## Acceptance criteria",
    "",
    CRITERIA_PROMPT,
    "",
  ].join("\n");
  const file = join(root.repoRoot, fileRel);
  writeFileSync(file, joinFrontMatter(fm, body));
  written.push(file);
  return finish(root, [c.name], written, { ref: `${c.name}#${number}`, number, path: rel(root, file) }, note ? [note] : []);
}

/** Skeleton prompt for acceptance criteria; italic, so `sectionIsBlank` still treats it as missing. */
const CRITERIA_PROMPT = "_What must be true when this is done._";

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
  /** Scoring dimension values to set; null clears one. */
  dimensions?: Record<string, DimensionValue | null>;
  /** Records the status an initiative already has, when front-matter has none (not a transition). */
  status?: string;
  /** With `status`: why it was abandoned, superseded or deferred (optional here). */
  reason?: string;
}

/** `docs_impact` written when `done` is recorded rather than reached through `complete`. */
export const PRE_BRINDLEY_DOCS_IMPACT = "none: completed before Brindley";

/** What an `update` would write — front-matter changes, body and warnings — without writing it. Throws on anything refused. */
function planUpdate(root: Root, i: Initiative, input: UpdateInput): { changes: Record<string, unknown>; body: string; warnings: string[] } {
  let body = i.body;
  if (input.title) body = setH1(body, input.title);
  if (input.section !== undefined) {
    if (input.content === undefined) throw new BrindleyError("`content` is required with `section`.");
    if (input.section.trim().toLowerCase() === OPEN_QUESTIONS.toLowerCase())
      throw new BrindleyError("Use add_question / resolve_question to change open questions.");
    // A new section goes where resolve_question puts Decisions: before Open questions and Acceptance criteria.
    const name = input.section.trim().toLowerCase();
    const before = name === "acceptance criteria" ? [] : [OPEN_QUESTIONS, "Acceptance criteria"];
    body = setSection(body, input.section, input.content, before);
  }
  const changes: Record<string, unknown> = {};
  for (const k of ["type", "owner", "tags", "status_note", "docs"] as const) if (input[k] !== undefined) changes[k] = input[k];
  if (input.dimensions) {
    const dims = dimensionsFor(root, i);
    for (const [name, value] of Object.entries(input.dimensions)) {
      const d = dims.find((x) => x.name === name);
      if (!d) throw new BrindleyError(`"${name}" is not a dimension in ${i.collection}; known: ${dims.map((x) => x.name).join(", ")}.`);
      if (value !== null && !d.values.some((v) => sameValue(v, value)))
        throw new BrindleyError(`\`${name}: ${value}\` is not one of ${d.values.join(", ")}.`);
      // Store the declared spelling (a number stays a number); null removes the field.
      changes[name] = value === null ? undefined : d.values.find((v) => sameValue(v, value));
    }
  }
  const warnings: string[] = [];
  if (input.status !== undefined) {
    // Recording what an initiative already is, not moving it: only when front-matter has no status.
    if (i.statusSource === "front-matter")
      throw new BrindleyError(`${initiativeKey(i)} already records status: ${i.status}. Changing it is a transition: use set_status.`);
    const core = normaliseStatus(input.status, findCollection(root, i.collection)?.meta.statuses);
    if (!core) throw new BrindleyError(`Unknown status "${input.status}". Use one of ${STATUSES.join(", ")} or a known alias.`);
    changes["status"] = core;
    if (core === "done" && i.docsImpact === undefined) changes["docs_impact"] = PRE_BRINDLEY_DOCS_IMPACT;
    if (input.reason?.trim()) changes["status_note"] = input.reason.trim();
    if (CALLOUT_STATUSES.includes(core)) body = setStatusCallout(body, calloutFor(root, i, core, input.reason));
    if (i.folder) warnings.push(`The file stays in "${i.folder}/" (Brindley never moves files); its front-matter status now takes precedence over the folder.`);
  }
  // A changed status_note on abandoned, superseded or deferred work rewrites the callout to match.
  if (input.status === undefined && input.status_note !== undefined && CALLOUT_STATUSES.includes(i.status ?? ""))
    body = setStatusCallout(body, calloutFor(root, i, i.status!, input.status_note));
  return { changes, body, warnings };
}

export function update(root: Root, i: Initiative, input: UpdateInput): OpResult<{ ref: string }> {
  const { changes, body, warnings } = planUpdate(root, i, input);
  writeInitiative(i, changes, body);
  return finish(root, [i.collection], [i.file], { ref: initiativeKey(i) }, warnings);
}

/** One entry of a batch_update: an initiative and the `update` fields for it; `status: "from-text"` reads it from the text. */
export interface BatchEntry extends Omit<UpdateInput, "section" | "content" | "title"> {
  ref: string | number;
  collection?: string;
}

export interface BatchEntryResult {
  ref: string;
  path: string;
  /** Front-matter fields written (or to be written, in a dry run). */
  changes: Record<string, unknown>;
  /** For `status: "from-text"`: the word the status was read from. */
  statusFrom?: string;
  warnings: string[];
}

/**
 * Apply `update`-style changes to many initiatives in one call. Every entry is checked first; if any
 * fails nothing is written and every failure is returned. Otherwise each file is written once and
 * the READMEs are regenerated once. `dry_run` returns the same per-entry result without writing.
 */
export function batchUpdate(
  root: Root,
  entries: BatchEntry[],
  opts: { dry_run?: boolean } = {},
): OpResult<{ dryRun: boolean; ok: boolean; entries: BatchEntryResult[]; failures: { entry: BatchEntry; error: string }[] }> {
  const planned: { i: Initiative; plan: ReturnType<typeof planUpdate>; result: BatchEntryResult }[] = [];
  const failures: { entry: BatchEntry; error: string }[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    try {
      const i = resolveRef(root, entry.ref, entry.collection);
      const key = initiativeKey(i);
      if (seen.has(key)) throw new BrindleyError(`${key} is listed more than once; combine its changes into one entry.`);
      seen.add(key);
      const { ref: _ref, collection: _collection, ...fields } = entry;
      let statusFrom: string | undefined;
      if (fields.status === "from-text") {
        const stated = statusFromText(i, findCollection(root, i.collection)?.meta.statuses);
        if (!stated.status) throw new BrindleyError(`No status to take from the text: ${stated.reason}`);
        fields.status = stated.status;
        statusFrom = stated.word;
      }
      const plan = planUpdate(root, i, fields);
      const changes = Object.fromEntries(Object.entries(plan.changes).filter(([k]) => k !== "updated"));
      planned.push({ i, plan, result: { ref: key, path: i.rel, changes, ...(statusFrom ? { statusFrom } : {}), warnings: plan.warnings } });
    } catch (e) {
      failures.push({ entry, error: (e as Error).message });
    }
  }
  const dryRun = opts.dry_run === true;
  const result = { dryRun, ok: failures.length === 0, entries: planned.map((p) => p.result), failures };
  if (failures.length) return { result: { ...result, entries: [] }, touched: [], warnings: [`Nothing written: ${failures.length} of ${entries.length} entries failed.`] };
  if (dryRun) return { result, touched: [], warnings: [] };
  for (const p of planned) writeInitiative(p.i, p.plan.changes, p.plan.body);
  return finish(root, [...new Set(planned.map((p) => p.i.collection))], planned.map((p) => p.i.file), result);
}

/** Statuses that show a callout under the H1 saying so (and why). */
const CALLOUT_STATUSES = ["abandoned", "superseded", "deferred"];

/**
 * The status callout for an initiative in `status` with reason `note`: a warning for abandoned work,
 * a note for superseded (linking its replacement) and deferred work; null for any other status.
 */
function calloutFor(root: Root, i: Initiative, status: string, note: string | undefined, supersededBy?: string | number): string[] | null {
  const why = note?.trim() ? `: ${note.trim()}` : "";
  const date = `(${today()})`;
  if (status === "abandoned") return ["> [!WARNING]", `> **Abandoned** ${date}${why}`];
  if (status === "deferred") return ["> [!NOTE]", `> **Deferred** ${date}${why}`];
  if (status === "superseded") {
    const ref = supersededBy ?? (i.fm["superseded_by"] as string | number | undefined);
    const t = ref !== undefined ? (() => { try { return resolveRef(root, refValue(ref), i.collection); } catch { return undefined; } })() : undefined;
    const by = t ? ` by [${t.collection === i.collection ? `#${t.number}` : initiativeKey(t)} ${t.title ?? t.slug}](${posix.relative(posix.dirname(i.rel), t.rel)})` : "";
    return ["> [!NOTE]", `> **Superseded**${by} ${date}${why}`];
  }
  return null;
}

export function setStatus(
  root: Root,
  i: Initiative,
  status: string,
  opts: { force?: boolean; superseded_by?: string | number; reason?: string; outcome?: string } = {},
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
  // Why it was abandoned (required), superseded or deferred: kept as status_note and shown under the H1.
  if (status === "abandoned" && !opts.reason?.trim())
    throw new BrindleyError("Say why with `reason` — it's shown at the top of the initiative and in the README's Closed list.");
  let body = i.body;
  if (CALLOUT_STATUSES.includes(status)) {
    if (opts.reason?.trim()) changes["status_note"] = opts.reason.trim();
    body = setStatusCallout(body, calloutFor(root, i, status, opts.reason, opts.superseded_by));
  } else if (CALLOUT_STATUSES.includes(i.status ?? "")) {
    // Reopened: the callout and the reason it gave no longer hold.
    body = setStatusCallout(body, null);
    changes["status_note"] = undefined;
  }
  if (opts.outcome?.trim()) body = setSection(body, "Outcome", opts.outcome, [OPEN_QUESTIONS, "Acceptance criteria"]);
  writeInitiative(i, changes, body);
  return finish(root, [i.collection], [i.file], { ref: initiativeKey(i), status }, warnings);
}

export function addQuestion(root: Root, i: Initiative, text: string, implementation = false): OpResult<{ ref: string; index: number; status: string | undefined }> {
  const clean = text.trim().replace(/^[-*+]\s+/, "");
  const prefix = implementation && !/^\(implementation\)/i.test(clean) ? "(implementation) " : "";
  // Indent continuation lines so a multi-line question stays one list item, as decisions are.
  const item = `- ${prefix}${clean.split("\n").map((l, k) => (k === 0 || l.trim() === "" ? l : `  ${l}`)).join("\n")}`;
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
    const s = findSection(body, OPEN_QUESTIONS);
    if (s && lines(body).slice(s.start, s.end).every((l) => l.trim() === "")) body = setSection(body, OPEN_QUESTIONS, NONE);
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

/** 1-based line in the file for a 0-based body line, counting the front-matter block. */
function fileLine(i: Initiative, bodyLine: number): number {
  return bodyLine + 1 + (i.fmText === null ? 0 : i.fmText.split("\n").length + 1);
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
      for (const item of [...hits].reverse()) body = replaceLines(body, item.start, item.end, []);
      // Whatever still links to the target sits outside a bullet; say where, rather than "not linked".
      const left = s ? sectionLinks(body, section).filter((l) => linkHits(i, l.href, t, url)) : [];
      const name = t ? initiativeKey(t) : String(x);
      for (const l of left)
        warnings.push(
          `${name} is linked in a paragraph under "## ${section}" (line ${fileLine(i, l.line)}), not a bullet, so it was not removed. Edit the text: delete the link, or move the sentence to ## Related or ## See also.`,
        );
      if (hits.length === 0 && left.length === 0) warnings.push(`${x} is not linked under "## ${section}".`);
      const after = findSection(body, section);
      // An emptied Dependencies says so; an emptied Related goes, as `create` omits it when empty.
      if (after && lines(body).slice(after.start, after.end).every((l) => l.trim() === ""))
        body = blocking ? setSection(body, section, NONE) : replaceLines(body, after.heading.line, after.end, []);
    }
    for (const x of add) {
      const url = /^https?:\/\//i.test(String(x));
      if (!url) {
        const t = resolveRef(root, x, i.collection);
        if (t === i) throw new BrindleyError("An initiative cannot depend on itself.");
        if (blocking && wouldCycle(root, i, t))
          throw new BrindleyError(`Adding ${initiativeKey(t)} would create a dependency cycle. If it is related rather than needed first, add it under ## Related instead (related_add).`);
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
  const hint = elsewhereHint(root, p) || " Give paths relative to the repository root.";
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

export interface RepadResult {
  collection: string;
  /** The width the collection is (or would be) padded to. */
  width: number;
  dryRun: boolean;
  moves: Move[];
  rewrites: Rewrite[];
}

/**
 * Pad every initiative number in a collection to one width — the given one, or the width most
 * files already use — renaming files and their asset folders and rewriting every link to them.
 * Dry run by default: returns the plan without writing.
 */
export function repad(root: Root, collection: string, opts: { width?: number; dry_run?: boolean } = {}): OpResult<RepadResult> {
  const c = requireCollection(root, collection);
  const width = opts.width ?? collectionWidth(c);
  if (!Number.isInteger(width) || width < 1) throw new BrindleyError(`Width must be a whole number of digits, 1 or more (got ${opts.width}).`);
  const highest = Math.max(0, ...c.initiatives.map((i) => i.number), ...c.ignored.map((f) => Number(/(\d+)-/.exec(f.split("/").pop()!)?.[1] ?? 0)));
  if (highest > capacity(width))
    throw new BrindleyError(`Width ${width} is too small for ${c.name}: its highest number is ${highest}. Use ${String(highest).length} or more.`);
  const warnings: string[] = [];
  if (highest >= nearFull(width))
    warnings.push(`${c.name}'s highest number, ${highest}, is ${Math.round((highest / capacity(width)) * 100)}% of what ${width === 1 ? "1 digit holds" : `${width} digits hold`}; consider ${width + 1} (${padNumber(1, width + 1)}-).`);
  const moves: Move[] = [];
  const renamedNumbers = new Map<number, string>();
  for (const i of c.initiatives) {
    const base = i.rel.split("/").pop()!;
    const m = /^(\d+)-(.*)$/.exec(base)!;
    const want = padNumber(i.number, width);
    if (m[1] === want) continue;
    moves.push({ from: i.rel, to: `${i.rel.slice(0, -base.length)}${want}-${m[2]}` });
    renamedNumbers.set(i.number, want);
  }
  // Asset folders (`<n>-…/`) beside the initiatives follow their initiative's number.
  for (const dir of [c.dir, ...readdirSync(c.dir).map((e) => join(c.dir, e)).filter((p) => statSync(p).isDirectory() && !ASSET_DIR.test(p.split(sep).pop()!))]) {
    for (const e of readdirSync(dir)) {
      const m = /^(\d+)-(.*)$/.exec(e);
      if (!m || !statSync(join(dir, e)).isDirectory()) continue;
      const want = renamedNumbers.get(Number(m[1]));
      if (want && m[1] !== want) {
        const from = toPosix(relative(root.repoRoot, join(dir, e)));
        moves.push({ from, to: `${from.slice(0, -e.length)}${want}-${m[2]}` });
      }
    }
  }
  const plan = planRelink(root, moves);
  const result: RepadResult = { collection: c.name, width, dryRun: opts.dry_run !== false, moves: plan.moves, rewrites: plan.rewrites };
  if (result.dryRun) return { result, touched: [], warnings };
  const written = applyRelink(root, plan);
  return finish(root, [c.name], written, result, warnings);
}

export interface RenumberResult {
  from: string;
  to: string;
  number: number;
  dryRun: boolean;
  moves: Move[];
  rewrites: Rewrite[];
}

/**
 * Give an initiative a new number — the next one, coined as `create` does, unless `to` is given —
 * renaming its file and asset folder (keeping the slug, padded to the collection's width) and
 * rewriting every link and `"<collection>#<n>"` reference to it. For one file of a
 * `duplicate-number` pair, pass it by path; its number's references are then ambiguous and left
 * alone, while links (which name the file) are rewritten.
 */
export function renumber(root: Root, i: Initiative, opts: { to?: number; dry_run?: boolean } = {}): OpResult<RenumberResult> {
  const c = requireCollection(root, i.collection);
  const used = new Set([...c.initiatives.map((x) => x.number), ...c.ignored.map((f) => Number(/(\d+)-/.exec(f.split("/").pop()!)?.[1] ?? 0))]);
  let n: number;
  const warnings: string[] = [];
  if (opts.to !== undefined) {
    if (!Number.isInteger(opts.to) || opts.to < 1) throw new BrindleyError(`A number must be a whole number, 1 or more (got ${opts.to}).`);
    if (opts.to === i.number) throw new BrindleyError(`${initiativeKey(i)} is already number ${opts.to}.`);
    if (used.has(opts.to)) throw new BrindleyError(`Number ${opts.to} is already used in ${c.name}.`);
    n = opts.to;
  } else {
    const next = nextNumber(root, c);
    n = next.number;
    if (next.note) warnings.push(next.note);
  }
  const shared = c.initiatives.filter((x) => x.number === i.number).length > 1;
  const base = i.rel.split("/").pop()!;
  const slug = /^\d+-(.*)\.md$/.exec(base)![1]!;
  const prefix = padNumber(n, collectionWidth(c));
  const moves: Move[] = [{ from: i.rel, to: `${i.rel.slice(0, -base.length)}${prefix}-${slug}.md` }];
  // Its asset folder(s): `<n>-…/` beside it — for a shared number, only one named after this file.
  const dir = dirname(i.file);
  for (const e of readdirSync(dir)) {
    const m = /^(\d+)-(.*)$/.exec(e);
    if (!m || Number(m[1]) !== i.number || !statSync(join(dir, e)).isDirectory()) continue;
    if (shared && m[2] !== slug) continue;
    const from = toPosix(relative(root.repoRoot, join(dir, e)));
    moves.push({ from, to: `${from.slice(0, -e.length)}${prefix}-${m[2]}` });
  }
  const plan = planRelink(root, moves);
  if (!shared)
    plan.rewrites.push(
      ...planRefs(root, (col, num, written) => (col === c.name && num === i.number ? written.replace(/\d+$/, String(n)) : null)),
    );
  const result: RenumberResult = { from: initiativeKey(i), to: `${c.name}#${n}`, number: n, dryRun: opts.dry_run === true, moves: plan.moves, rewrites: plan.rewrites };
  if (shared) warnings.push(`Number ${i.number} is shared in ${c.name}, so "${c.name}#${i.number}" references were left alone; check any that meant this initiative.`);
  if (result.dryRun) return { result, touched: [], warnings };
  return finish(root, [c.name], applyRelink(root, plan), result, warnings);
}

export interface RenameCollectionResult {
  from: string;
  to: string;
  name: string;
  dryRun: boolean;
  moves: Move[];
  rewrites: Rewrite[];
}

/**
 * Move a collection's folder, rewriting every relative link into it from anywhere in the repo and
 * out of it from inside. When its name comes from the folder (no `name:`), the name changes too, so
 * `"<name>#<n>"` references — by its old name, old path or old automatic alias — become the new name.
 * Explicit aliases are kept, and references through them still work.
 */
export function renameCollection(root: Root, collection: string, to: string, opts: { dry_run?: boolean } = {}): OpResult<RenameCollectionResult> {
  const c = requireCollection(root, collection);
  const dest = checkFolderPath(root, to);
  if (dest === c.path) throw new BrindleyError(`${c.name} is already at ${dest}.`);
  if (dest.startsWith(c.path + "/")) throw new BrindleyError(`Can't move ${c.path} inside itself (${dest}).`);
  const host = root.collections.find((o) => o !== c && (o.path === "." || dest.startsWith(o.path + "/")));
  if (host) throw new BrindleyError(`${dest} is inside the collection ${host.name} (${host.path}); collections don't nest.`);
  const explicitName = readFrontMatterOf(c.readme)?.["name"] !== undefined;
  const name = explicitName ? c.name : dest.split("/").pop()!;
  if (name !== c.name) {
    const clash = root.collections.find(
      (o) => o !== c && (o.name.toLowerCase() === name.toLowerCase() || o.aliases.some((a) => a.toLowerCase() === name.toLowerCase())),
    );
    if (clash) throw new BrindleyError(`The new name "${name}" is already used by the collection ${clash.name} (${clash.path}); set \`name:\` in its README or choose another folder.`);
  }
  const plan = planRelink(root, [{ from: c.path, to: dest }]);
  if (name !== c.name) {
    // References that named it by its old name, path or automatic alias; explicit aliases still resolve.
    const old = new Set([c.name, c.path, ...(c.autoAlias ? [c.autoAlias] : [])].map((x) => x.toLowerCase()));
    plan.rewrites.push(
      ...planRefs(root, (col, n, written) => (col === c.name && old.has(written.replace(/#\d+$/, "").toLowerCase()) ? `${name}#${n}` : null)),
    );
  }
  const result: RenameCollectionResult = { from: c.path, to: dest, name, dryRun: opts.dry_run === true, moves: plan.moves, rewrites: plan.rewrites };
  if (result.dryRun) return { result, touched: [], warnings: [] };
  return finish(root, [c.name], applyRelink(root, plan), result);
}

export interface FixEdit {
  file: string;
  line: number;
  rule: "broken-link" | "front-matter-dependencies";
  before: string;
  after: string;
}

/**
 * Repair the validate findings that have one obvious fix, editing text in place — never renaming
 * or moving a file: a broken link whose filename matches exactly one initiative in its collection
 * (relinked to it), and `depends_on` / `related` front-matter (turned into links under
 * `## Dependencies` / `## Related`, field removed). Anything else is reported, not fixed.
 * Dry run by default.
 */
export function fix(root: Root, opts: { collection?: string; dry_run?: boolean } = {}): OpResult<{ dryRun: boolean; edits: FixEdit[]; unfixed: { file: string; line: number; message: string }[] }> {
  const dryRun = opts.dry_run !== false;
  const edits: FixEdit[] = [];
  const unfixed: { file: string; line: number; message: string }[] = [];
  const written: string[] = [];
  const collections = opts.collection ? [requireCollection(root, opts.collection)] : root.collections;
  for (const c of collections) {
    for (const i of c.initiatives) {
      const fileEdits: { line: number; column: number; before: string; after: string }[] = [];
      const original = readFileSync(i.file, "utf8");
      const ls = lines(original);
      // Broken links that one initiative in the collection, found by filename, explains.
      for (const { line, text } of stripCodeFences(ls.join("\n"))) {
        for (const m of withoutInlineCode(text).matchAll(/\]\(\s*<?([^)\s>]+)>?/g)) {
          const href = m[1]!;
          if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#")) continue;
          const [path, fragment] = href.split(/(?=#)/);
          if (existsSync(resolve(dirname(i.file), decodeURIComponent(path!)))) continue;
          const base = path!.split("/").pop()!;
          const candidates = c.initiatives.filter((o) => o.rel.split("/").pop() === base);
          if (candidates.length !== 1) {
            unfixed.push({
              file: i.rel,
              line: line + 1,
              message: candidates.length
                ? `Broken link ${href} matches ${candidates.length} files (${candidates.map((o) => o.rel).join(", ")}); choose one by hand.`
                : `Broken link ${href} matches no initiative in ${c.name}.`,
            });
            continue;
          }
          const after = `${toPosix(relative(dirname(i.file), candidates[0]!.file))}${fragment ?? ""}`;
          fileEdits.push({ line, column: m.index! + m[0].indexOf(href), before: href, after });
          edits.push({ file: i.rel, line: line + 1, rule: "broken-link", before: href, after });
        }
      }
      for (const e of [...fileEdits].sort((a, b) => a.line - b.line || b.column - a.column))
        ls[e.line] = ls[e.line]!.slice(0, e.column) + e.after + ls[e.line]!.slice(e.column + e.before.length);
      // depends_on / related in front-matter: ignored by Brindley, so move them into the body as links.
      let text = ls.join("\n");
      const fmRefs = (["depends_on", "related"] as const).filter((k) => i.fm[k] !== undefined);
      if (fmRefs.length) {
        const { fmText, body } = splitFrontMatter(text);
        let newBody = body;
        const changes: Record<string, unknown> = {};
        let ok = true;
        const bullets: Record<string, string[]> = {};
        for (const k of fmRefs) {
          const refs = Array.isArray(i.fm[k]) ? (i.fm[k] as unknown[]) : [i.fm[k]];
          try {
            bullets[k] = refs.map((r) => `- ${linkTo(root, i.rel, c.name, String(r))}`);
          } catch (e) {
            ok = false;
            unfixed.push({ file: i.rel, line: fmLineOf(fmText, k), message: `\`${k}\` lists something that isn't an initiative (${(e as Error).message}); move it by hand.` });
          }
        }
        if (ok) {
          for (const k of fmRefs) {
            const section = k === "depends_on" ? DEPENDENCIES : RELATED;
            for (const b of bullets[k]!) newBody = appendToSection(newBody, section, b, k === "depends_on" ? [RELATED, OPEN_QUESTIONS, "Acceptance criteria"] : [OPEN_QUESTIONS, "Acceptance criteria"]);
            changes[k] = undefined;
            edits.push({ file: i.rel, line: fmLineOf(fmText, k), rule: "front-matter-dependencies", before: `${k}: ${JSON.stringify(i.fm[k])}`, after: `${bullets[k]!.join(" ")} under ## ${section}` });
          }
          text = joinFrontMatter(editFrontMatter(fmText, changes), newBody);
        }
      }
      if (!dryRun && text !== original) {
        writeFileSync(i.file, text);
        written.push(i.file);
      }
    }
  }
  const result = { dryRun, edits, unfixed };
  if (dryRun || written.length === 0) return { result, touched: [], warnings: [] };
  return finish(root, collections.map((c) => c.name), written, result);
}

/** 1-based line of a front-matter key in the file (the opening `---` is line 1). */
function fmLineOf(fmText: string | null, key: string): number {
  const k = (fmText ?? "").split("\n").findIndex((l) => l.startsWith(`${key}:`));
  return k < 0 ? 1 : k + 2;
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
