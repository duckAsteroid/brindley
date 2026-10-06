import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { ASSET_DIR, COLLECTION_STATUSES, STATUSES, type Initiative, type Root } from "./model.js";
import { cycles, target } from "./deps.js";
import { allInitiatives, initiativeKey, toPosix } from "./repo.js";
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

  for (const s of root.strays) err("root-stray", rel(s), "Initiative files must live in a collection, not directly in the root.");

  const collections = root.collections.filter((c) => !opts.collection || c.path === opts.collection);
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

  for (const ch of regenerate(root, { check: true, collections: collections, includeRoot: !opts.collection })) {
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
  if (!i.status) err("status-missing", f, "Missing `status`.");
  else if (!(STATUSES as readonly string[]).includes(i.status)) err("status-invalid", f, `Status "${i.status}" is not one of ${STATUSES.join(", ")}.`);
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
    if (!i.supersededBy) err("superseded-by", f, "`status: superseded` requires `superseded_by`.");
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
  if (i.status === "done" && i.docsImpact === undefined) warn("docs-impact", f, "Done, but no `docs_impact` recorded.");

  if (i.type && root.meta.types && !root.meta.types.includes(i.type))
    warn("type-unknown", f, `Type "${i.type}" is not declared in the root's \`types\`.`);
  for (const t of i.tags) {
    if (!KEBAB.test(t)) warn("tag-format", f, `Tag "${t}" should be lowercase kebab-case.`);
    else if (root.meta.tags && !(t in root.meta.tags)) warn("tag-unknown", f, `Tag "${t}" is not declared in the root's \`tags\`.`);
  }

  for (const { line, text } of stripCodeFences(i.body)) {
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const href = decodeURIComponent(m[1]!.split("#")[0]!);
      if (!href || /^[a-z]+:/i.test(href)) continue;
      const fmLines = i.fmText === null ? 0 : i.fmText.split("\n").length + 1;
      if (!existsSync(resolve(dirname(i.file), href)))
        warn("broken-link", f, `Link target does not exist: ${m[1]}`, line + 1 + fmLines);
    }
  }
}

export function summarise(findings: Finding[]): string {
  if (findings.length === 0) return "No problems found.";
  const errors = findings.filter((x) => x.level === "error").length;
  const warnings = findings.length - errors;
  const body = findings.map((x) => `${x.level === "error" ? "ERROR" : "warn "} ${x.file}${x.line ? `:${x.line}` : ""} [${x.rule}] ${x.message}`);
  return [`${errors} error(s), ${warnings} warning(s)`, ...body].join("\n");
}

export { initiativeKey };
