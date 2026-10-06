import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { ASSET_DIR, COLLECTION_STATUSES, STATUSES, normaliseStatus, type Initiative, type Root } from "./model.js";
import { cycles, target } from "./deps.js";
import { allInitiatives, declaredTags, findCollection, initiativeKey, toPosix } from "./repo.js";
import { stripCodeFences } from "./markdown.js";
import { regenerate } from "./readme.js";
import { checkDocs } from "./docs.js";

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
  for (const c of root.collections) {
    const prev = names.get(c.name);
    if (prev) err("duplicate-collection", rel(c.readme), `Collection name "${c.name}" is also used by ${prev}; set a distinct \`name\` in one README.`);
    else names.set(c.name, c.path);
    if (root.collections.some((o) => o !== c && o.path !== "." && c.path.startsWith(o.path + "/") && c.initiatives.length && o.initiatives.length))
      warn("nested-collection", rel(c.readme), "Collection is nested inside another collection's folder.");
  }

  const collections = root.collections.filter((c) => !opts.collection || c.name === opts.collection || c.path === opts.collection);
  for (const c of collections) {
    if (!(COLLECTION_STATUSES as readonly string[]).includes(c.meta.status))
      err("collection-status", rel(c.readme), `Collection status "${c.meta.status}" is not one of ${COLLECTION_STATUSES.join(", ")}.`);

    const seen = new Map<number, Initiative>();
    for (const i of c.initiatives) {
      const prev = seen.get(i.number);
      if (prev) err("duplicate-number", rel(i.file), `Number ${i.number} is also used by ${prev.rel}; renumber one of them.`);
      else seen.set(i.number, i);
      checkInitiative(root, i, err, warn, rel);
    }

    const numbers = new Set(c.initiatives.map((i) => i.number));
    for (const e of readdirSync(c.dir)) {
      const m = /^(\d+)-/.exec(e);
      if (m && ASSET_DIR.test(e) && statSync(join(c.dir, e)).isDirectory() && !numbers.has(Number(m[1])))
        warn("orphan-assets", rel(join(c.dir, e)), `Asset directory matches no initiative numbered ${m[1]}.`);
    }

    if (c.meta.status === "done" && c.initiatives.some((i) => ["draft", "designed", "in-progress"].includes(i.status ?? "")))
      warn("collection-done-open", rel(c.readme), "Collection is done but still has open initiatives.");
  }

  for (const cycle of cycles(root)) {
    err("cycle", cycle[0]!, `Dependency cycle: ${cycle.join(" → ")}.`);
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
  const prose = normaliseStatus(i.proseStatus, custom);
  if (!i.status)
    err("status-missing", f, i.folder
      ? `No \`status\`, and folder "${i.folder}/" is not a known status (map it with \`statuses:\` in the collection README).`
      : i.proseStatus
        ? `No \`status\` in front-matter; the body says "${i.proseStatus}"${prose ? ` — add \`status: ${prose}\`` : ""}.`
        : "Missing `status`.");
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
      warn("status-not-in-folder", f, `Status ${i.status}, but this collection keeps ${i.status} work in "${home}/" and this file is ${i.folder ? `in "${i.folder}/"` : "not in a status folder"}.`);
  }
  if (i.status && prose && prose !== i.status)
    warn("status-prose-mismatch", f, `The body says "${i.proseStatus}" (${prose}), but the status is ${i.status}${i.statusSource === "folder" ? ` (from "${i.folder}/")` : ""}.`);
  if (/^0\d/.test(i.rel.split("/").pop()!)) warn("number-padding", f, `Zero-padded number; the format uses "${i.number}-…".`);
  for (const key of ["updated", "created"]) {
    const v = i.fm[key];
    if (v !== undefined && !ISO_DATE.test(String(v))) err("date", f, `\`${key}\` must be an ISO date (YYYY-MM-DD).`);
  }
  for (const [field, refs] of [["depends_on", i.dependsOn], ["related", i.related]] as const) {
    for (const r of refs) {
      if (r.kind === "initiative" && !target(root, r)) err("dangling-ref", f, `\`${field}\` refers to ${r.raw}, which does not exist.`);
    }
  }
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

  for (const { line, text } of stripCodeFences(i.body)) {
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const href = decodeURIComponent(m[1]!.split("#")[0]!);
      if (!href || /^[a-z]+:/i.test(href)) continue;
      const fmLines = i.fmText === null ? 0 : i.fmText.split("\n").length + 1;
      if (!existsSync(resolve(dirname(i.file), href))) {
        const base = href.split("/").pop()!;
        const moved = collection?.initiatives.find((o) => o.rel.split("/").pop() === base);
        const hint = moved ? ` — it is now at ${relative(dirname(i.file), moved.file).split("\\").join("/")}` : "";
        warn("broken-link", f, `Link target does not exist: ${m[1]}${hint}`, line + 1 + fmLines);
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
