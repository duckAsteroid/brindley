import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { ASSET_DIR, COLLECTION_STATUSES, STATUSES, normaliseStatus, type Initiative, type Root } from "./model.js";
import { cycles, target } from "./deps.js";
import { allInitiatives, declaredTags, elsewhereHint, findCollection, ignoreMatcher, initiativeKey, statusFromText, toPosix } from "./repo.js";
import { stripCodeFences, withoutInlineCode } from "./markdown.js";
import { FINDINGS, MEASURES, sectionIsBlank } from "./ops.js";
import { readmeColumns, regenerate } from "./readme.js";
import { checkDocs } from "./docs.js";
import { dimensionsOf, parseDimensions, sameValue } from "./dimensions.js";
import { parseGraph } from "./graph.js";
import { capacity, collectionWidth, fitsWidth, nearFull, numberPrefix, padNumber, roomFor } from "./numbering.js";

export interface Finding {
  level: "error" | "warning";
  rule: string;
  file: string;
  line?: number;
  message: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validate(root: Root, opts: { collection?: string; docs?: boolean } = {}): Finding[] {
  const out: Finding[] = [];
  const rel = (abs: string) => toPosix(relative(root.repoRoot, abs));
  const err = (rule: string, file: string, message: string, line?: number) =>
    out.push({ level: "error", rule, file, message, line });
  const warn = (rule: string, file: string, message: string, line?: number) =>
    out.push({ level: "warning", rule, file, message, line });

  const names = new Map<string, string>();
  const claimed = new Map<string, { path: string; alias: boolean }>(); // lower-cased name/explicit alias → owner
  for (const c of root.collections) {
    for (const key of [c.name, ...(c.meta.aliases ?? [])]) {
      const k = key.toLowerCase();
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(key))
        err("alias-format", rel(c.readme), `"${key}" can't be used in references; use letters, digits, ".", "_" or "-".`);
      const other = claimed.get(k);
      // Two collections with the same name are reported once, as duplicate-collection.
      if (other && other.path !== c.path && (key !== c.name || other.alias))
        err("alias-clash", rel(c.readme), `"${key}" is used by more than one collection (also ${other.path}); references to it are ambiguous.`);
      claimed.set(k, { path: c.path, alias: key !== c.name });
    }
    const prev = names.get(c.name.toLowerCase());
    if (prev) err("duplicate-collection", rel(c.readme), `Collection name "${c.name}" is also used by ${prev}; set a distinct \`name\` in one README.`);
    else names.set(c.name.toLowerCase(), c.path);
    if (root.collections.some((o) => o !== c && o.path !== "." && c.path.startsWith(o.path + "/") && c.initiatives.length && o.initiatives.length))
      warn("nested-collection", rel(c.readme), "Collection is nested inside another collection's folder.");
    for (const p of parseDimensions(c.meta.dimensions).problems) err("dimension-declaration", rel(c.readme), p);
    for (const p of parseGraph(c.meta.graph, c.meta.statuses).problems) warn("graph-setting", rel(c.readme), p);
    for (const p of readmeColumns(root, c).problems) warn("readme-columns", rel(c.readme), p);
    // Padding: every number at the width most files use, and room to grow.
    const width = collectionWidth(c);
    for (const i of c.initiatives) {
      const prefix = numberPrefix(i);
      if (fitsWidth(prefix, width)) continue;
      const name = i.rel.split("/").pop()!;
      const herd = width === 1 ? "this collection doesn't pad its numbers" : `this collection pads to ${width} digits`;
      warn("number-padding", rel(i.file), `${name} is ${prefix.startsWith("0") ? `padded to ${prefix.length} digits` : "unpadded"}; ${herd} (${padNumber(i.number, width)}-). \`repad\` makes them consistent.`);
    }
    const highest = Math.max(0, ...c.initiatives.map((i) => i.number));
    if (highest >= nearFull(width))
      warn(
        "number-width",
        rel(c.readme),
        highest > capacity(width)
          ? `The highest number, ${highest}, has outgrown this collection's width of ${width} digit${width === 1 ? "" : "s"}, so files no longer sort in order. \`repad\` to ${roomFor(highest)} digits (${padNumber(1, roomFor(highest))}-).`
          : `The highest number, ${highest}, is ${Math.round((highest / capacity(width)) * 100)}% of what ${width === 1 ? "1 digit holds" : `${width} digits hold`}. \`repad\` to ${width + 1} digits (${padNumber(1, width + 1)}-) before it runs out.`,
      );
  }

  const themeOwners = new Map<string, string>();
  for (const t of root.themes) {
    const prev = themeOwners.get(t.tag);
    if (prev) err("duplicate-theme", t.rel, `Theme "${t.tag}" already has an overview doc: ${prev}.`);
    else themeOwners.set(t.tag, t.rel);
    if (!KEBAB.test(t.tag)) warn("tag-format", t.rel, `Theme "${t.tag}" should be lowercase kebab-case (it is used as a tag).`);
  }

  const collections = root.collections.filter((c) => !opts.collection || c.name === opts.collection || c.path === opts.collection);
  for (const c of collections) {
    if (!(COLLECTION_STATUSES as readonly string[]).includes(c.meta.status))
      err("collection-status", rel(c.readme), `Collection status "${c.meta.status}" is not one of ${COLLECTION_STATUSES.join(", ")}.`);

    const seen = new Map<number, Initiative>();
    for (const i of c.initiatives) {
      const prev = seen.get(i.number);
      if (prev) {
        const companion = companionOf(prev, i);
        if (companion) err("duplicate-number", rel(companion.file.file), companionAdvice(c.dir, companion));
        else
          err("duplicate-number", rel(i.file), `Number ${i.number} is also used by ${prev.rel}; renumber one of them, or if one isn't an initiative (e.g. companion notes), exclude it with the \`ignore\` tool / an \`ignore:\` pattern in the collection README.`);
      } else seen.set(i.number, i);
      checkInitiative(root, i, err, warn, rel);
    }

    const numbers = new Set(c.initiatives.map((i) => i.number));
    const ignored = ignoreMatcher(c.meta.ignore);
    for (const e of readdirSync(c.dir)) {
      if (ignored(statSync(join(c.dir, e)).isDirectory() ? `${e}/` : e)) continue;
      const m = /^(\d+)-/.exec(e);
      if (m && ASSET_DIR.test(e) && statSync(join(c.dir, e)).isDirectory() && !numbers.has(Number(m[1])))
        warn("orphan-assets", rel(join(c.dir, e)), `Asset directory matches no initiative numbered ${m[1]}.`);
    }

    if (c.meta.status === "done" && c.initiatives.some((i) => ["draft", "designed", "in-progress"].includes(i.status ?? "")))
      warn("collection-done-open", rel(c.readme), "Collection is done but still has open initiatives.");
  }

  for (const cycle of cycles(root)) {
    err(
      "cycle",
      cycle[0]!,
      `Dependency cycle: ${cycle.join(" → ")}. If one of these links is a back-reference ("depended on by", "precedes") rather than something needed first, move it to ## Related (keeps a non-blocking link) or to a section such as ## See also (a plain link).`,
    );
  }

  for (const ch of regenerate(root, { check: true, collections })) {
    warn("readme-stale", rel(ch.path), "Generated README content is out of date; run regenerate_readmes.");
  }

  if (opts.docs) {
    for (const f of checkDocs(root).findings) {
      warn(f.kind === "initiative-link" ? "doc-links-initiative" : "doc-history", f.file, `Project doc: "${f.text}" (${f.kind}).`, f.line);
    }
  }
  return out;
}

/** Suffixes common enough to suggest a pattern for every file that has them. */
const COMMON_COMPANIONS = ["rationale", "notes", "design"];

/**
 * Of two files sharing a number, the one whose name is the other's plus a suffix
 * (`24-booking-window-rationale.md` beside `24-booking-window.md`): likely companion notes.
 */
function companionOf(a: Initiative, b: Initiative): { file: Initiative; of: Initiative; suffix: string } | null {
  const stem = (i: Initiative) => i.rel.split("/").pop()!.replace(/\.md$/, "");
  for (const [file, of] of [[b, a], [a, b]] as const) {
    if (stem(file).startsWith(`${stem(of)}-`)) return { file, of, suffix: stem(file).slice(stem(of).length + 1) };
  }
  return null;
}

/** The duplicate-number finding for a likely companion: where it belongs, or how to ignore it. */
function companionAdvice(collectionDir: string, x: { file: Initiative; of: Initiative; suffix: string }): string {
  const name = x.file.rel.split("/").pop()!;
  const ofName = x.of.rel.split("/").pop()!;
  const assets = `${toPosix(relative(collectionDir, x.of.file)).replace(/\.md$/, "")}/${x.suffix}.md`;
  const pattern = COMMON_COMPANIONS.includes(x.suffix.toLowerCase()) ? `*-${x.suffix}.md` : toPosix(relative(collectionDir, x.file.file));
  return (
    `${name} shares number ${x.file.number} with ${ofName} and looks like a companion to it, not an initiative. ` +
    `Move it into the initiative's asset folder (e.g. ${assets}) and link it from the initiative, ` +
    `or, to leave it in place, add \`${pattern}\` to the collection's \`ignore\` (the \`ignore\` tool previews it). ` +
    `Links to a moved file need updating; Brindley moves nothing.`
  );
}

function checkInitiative(
  root: Root,
  i: Initiative,
  err: (rule: string, file: string, message: string, line?: number) => void,
  warn: (rule: string, file: string, message: string, line?: number) => void,
  rel: (abs: string) => string,
) {
  const f = rel(i.file);
  for (const p of i.problems) err("parse", f, p);
  const collection = findCollection(root, i.collection);
  const custom = collection?.meta.statuses;
  const stated = statusFromText(i, custom);
  const prose = stated.status;
  if (!i.status) {
    err("status-missing", f, i.folder
      ? `No \`status\`, and folder "${i.folder}/" is not a known status (map it with \`statuses:\` in the collection README).`
      : stated.status
        ? "No `status` in front-matter (see status-inferable)."
        : i.proseStatus
          ? `No \`status\` in front-matter. ${stated.reason}`
          : "Missing `status`.");
    if (stated.status && !i.folder)
      warn("status-inferable", f, `No status recorded; the body says ${stated.word} (${stated.status}). Record it with \`update\` (\`status: ${stated.status}\`), or many at once with \`batch_update\` (\`status: "from-text"\`).`);
  }
  else if (!(STATUSES as readonly string[]).includes(i.status))
    err("status-invalid", f, `Status "${i.statusRaw}" is not known: use one of ${STATUSES.join(", ")}, a common alias, or map it with \`statuses:\` in the collection README.`);
  if (i.folder && i.statusSource === "front-matter") {
    const byFolder = normaliseStatus(i.folder, custom);
    if (byFolder && byFolder !== i.status)
      warn("status-folder-mismatch", f, `In "${i.folder}/" (${byFolder}) but front-matter says ${i.status}; front-matter wins.`);
  }
  // A collection that files work by status in folders: is this file where its status says?
  if (collection && i.status) {
    const home = statusFolderFor(collection, i.status);
    if (home && i.folder !== home)
      warn("status-not-in-folder", f, `Status ${i.status}, but this collection keeps ${i.status} work in "${collection.path}/${home}/" and this file is ${i.folder ? `in "${collection.path}/${i.folder}/"` : `directly in "${collection.path}/"`}.`);
  }
  if (i.status && prose && prose !== i.status)
    warn("status-prose-mismatch", f, `The body says "${i.proseStatus}" (${prose}), but the status is ${i.status}${i.statusSource === "folder" ? ` (from "${i.folder}/")` : ""}.`);
  if (i.type === "spike" && ["designed", "in-progress"].includes(i.status ?? "") && sectionIsBlank(i.body, MEASURES))
    warn("spike-measures", f, 'A spike needs a "## Measures" section (question, hypothesis, measure, answer criteria, time-box) before it starts.');
  if (i.type === "spike" && i.status === "done" && sectionIsBlank(i.body, FINDINGS))
    warn("spike-findings", f, 'A finished spike needs "## Findings" (method, results, conclusion, adopt / adapt / abandon for the code).');
  for (const key of ["updated", "created"]) {
    const v = i.fm[key];
    if (v !== undefined && !ISO_DATE.test(String(v))) err("date", f, `\`${key}\` must be an ISO date (YYYY-MM-DD).`);
  }
  for (const key of ["depends_on", "related"])
    if (i.fm[key] !== undefined)
      warn("front-matter-dependencies", f, `\`${key}\` in front-matter is ignored; link the initiatives under "## ${key === "depends_on" ? "Dependencies" : "Related"}" instead.`);
  if (i.status === "superseded") {
    if (!i.supersededBy)
      (i.statusSource === "folder" ? warn : err)("superseded-by", f, "Superseded, but no `superseded_by` says by what.");
    else if (i.supersededBy.kind !== "initiative" || !target(root, i.supersededBy))
      err("dangling-ref", f, `\`superseded_by\` refers to ${i.supersededBy.raw}, which does not exist.`);
  }
  if (!i.title) warn("h1-missing", f, "No H1 title.");

  const open = i.questions.filter((q) => !q.resolved);
  const blocking = open.filter((q) => !q.implementation);
  if (i.status === "designed" && blocking.length > 0)
    warn("designed-open-questions", f, `Designed, but ${blocking.length} blocking open question(s) remain.`);
  if ((i.status === "in-progress" || i.status === "done") && open.length > 0)
    warn("open-questions", f, `${i.status}, but ${open.length} open question(s) remain.`);
  if (i.status === "abandoned" && !i.statusNote && i.statusSource !== "folder")
    warn("abandoned-reason", f, "Abandoned, but no reason recorded: set one with `update` (`status_note`), and it shows under the title and in the README.");
  // Work completed before Brindley (status from a legacy folder) can't be held to docs_impact.
  if (i.status === "done" && i.docsImpact === undefined && i.statusSource !== "folder")
    warn("docs-impact", f, "Done, but no `docs_impact` recorded.");

  const types = findCollection(root, i.collection)?.meta.types;
  if (i.type && types && !types.includes(i.type))
    warn("type-unknown", f, `Type "${i.type}" is not declared in the collection's \`types\`.`);
  const tags = declaredTags(root);
  for (const t of i.tags) {
    if (!KEBAB.test(t)) warn("tag-format", f, `Tag "${t}" should be lowercase kebab-case.`);
    else if (tags && !(t in tags)) warn("tag-unknown", f, `Tag "${t}" is not declared in any collection's \`tags\`.`);
  }
  for (const d of dimensionsOf(collection)) {
    const v = i.fm[d.name];
    if (v === undefined || v === null) {
      if (d.required) warn("dimension-missing", f, `\`${d.name}\` is required in this collection (one of ${d.values.join(", ")}).`);
    } else if (!d.values.some((x) => sameValue(x, v as string | number)))
      err("dimension-value", f, `\`${d.name}: ${String(v)}\` is not one of ${d.values.join(", ")}.`);
  }

  for (const { line, text } of stripCodeFences(i.body)) {
    for (const m of withoutInlineCode(text).matchAll(/\]\(([^)\s]+)\)/g)) {
      const href = decodeURIComponent(m[1]!.split("#")[0]!);
      if (!href || /^[a-z]+:/i.test(href)) continue;
      const fmLines = i.fmText === null ? 0 : i.fmText.split("\n").length + 1;
      const abs = resolve(dirname(i.file), href);
      if (!existsSync(abs)) {
        const base = href.split("/").pop()!;
        const moved = collection?.initiatives.find((o) => o.rel.split("/").pop() === base);
        const hint = moved ? ` — it is now at ${relative(dirname(i.file), moved.file).split("\\").join("/")}` : "";
        // Where a relative link points, unless its text already says so; and another worktree that has it.
        const repoRel = toPosix(relative(root.repoRoot, abs));
        const where = repoRel.startsWith("../") ? " (outside the repository)" : href.includes("../") ? ` (${repoRel})` : "";
        const elsewhere = repoRel.startsWith("../") ? "" : elsewhereHint(root, repoRel);
        warn("broken-link", f, `Link target does not exist: ${m[1]}${where}${hint}${elsewhere}`, line + 1 + fmLines);
      }
    }
  }
}

/** The status folder a collection uses for a status (e.g. done → "completed"), if it has one. */
export function statusFolderFor(c: { dir: string; initiatives: Initiative[]; meta: { statuses?: Record<string, string> } }, status: string): string | undefined {
  const folders = [...new Set(c.initiatives.map((i) => i.folder).filter((x): x is string => !!x))].sort();
  return folders.find((sub) => normaliseStatus(sub, c.meta.statuses) === status);
}

export function summarise(findings: Finding[]): string {
  if (findings.length === 0) return "No problems found.";
  const errors = findings.filter((x) => x.level === "error").length;
  const warnings = findings.length - errors;
  const body = findings.map((x) => `${x.level === "error" ? "ERROR" : "warn "} ${x.file}${x.line ? `:${x.line}` : ""} [${x.rule}] ${x.message}`);
  return [`${errors} error(s), ${warnings} warning(s)`, ...body].join("\n");
}

export { initiativeKey };
