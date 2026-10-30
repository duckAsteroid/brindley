import { parseDocument, Document, isSeq } from "yaml";
import type { Question } from "./model.js";

// ---------------------------------------------------------------------------
// Front-matter

export interface Split {
  fmText: string | null;
  body: string;
}

export function splitFrontMatter(text: string): Split {
  const normalised = text.replace(/\r\n/g, "\n");
  if (!normalised.startsWith("---\n")) return { fmText: null, body: normalised };
  const end = normalised.indexOf("\n---", 3);
  if (end < 0) return { fmText: null, body: normalised };
  const after = normalised.indexOf("\n", end + 4);
  const fmText = normalised.slice(4, end + 1);
  const body = after < 0 ? "" : normalised.slice(after + 1);
  return { fmText, body };
}

export function parseFrontMatter(fmText: string | null): { data: Record<string, unknown>; error?: string } {
  if (fmText === null) return { data: {} };
  const doc = parseDocument(fmText);
  if (doc.errors.length > 0) return { data: {}, error: doc.errors[0]!.message };
  const data = doc.toJS();
  return { data: data && typeof data === "object" ? (data as Record<string, unknown>) : {} };
}

const FLOW_KEYS = new Set(["depends_on", "related", "tags", "docs", "types"]);

/**
 * Apply changes to front-matter text, preserving comments, key order and
 * formatting of untouched keys. A value of undefined deletes the key.
 */
export function editFrontMatter(fmText: string | null, changes: Record<string, unknown>): string {
  const doc: Document = parseDocument(fmText ?? "");
  if (doc.contents === null) doc.contents = doc.createNode({}) as never;
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) {
      doc.delete(key);
      continue;
    }
    const node = doc.createNode(value);
    if (isSeq(node) && FLOW_KEYS.has(key)) node.flow = true;
    doc.set(key, node);
  }
  return doc.toString({ lineWidth: 0, flowCollectionPadding: false });
}

export function joinFrontMatter(fmText: string | null, body: string): string {
  if (fmText === null || fmText.trim() === "") return body;
  const fm = fmText.endsWith("\n") ? fmText : fmText + "\n";
  return `---\n${fm}---\n${body}`;
}

// ---------------------------------------------------------------------------
// Body structure (line based, so edits never reformat the author's Markdown)

export interface Heading {
  level: number;
  text: string;
  line: number;
}

export function lines(body: string): string[] {
  return body.split("\n");
}

export function headings(body: string): Heading[] {
  const out: Heading[] = [];
  let fence: string | null = null;
  lines(body).forEach((line, i) => {
    const f = /^\s*(```|~~~)/.exec(line);
    if (f) {
      if (fence === null) fence = f[1]!;
      else if (fence === f[1]) fence = null;
      return;
    }
    if (fence !== null) return;
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) out.push({ level: h[1]!.length, text: h[2]!, line: i });
  });
  return out;
}

export function h1(body: string): string | null {
  return headings(body).find((h) => h.level === 1)?.text ?? null;
}

export interface SectionRange {
  heading: Heading;
  /** First content line (after the heading). */
  start: number;
  /** Line after the last content line. */
  end: number;
}

export function findSection(body: string, name: string): SectionRange | null {
  const hs = headings(body);
  const total = lines(body).length;
  const want = name.trim().toLowerCase();
  const idx = hs.findIndex((h) => h.level > 1 && h.text.trim().toLowerCase() === want);
  if (idx < 0) return null;
  const heading = hs[idx]!;
  const next = hs.slice(idx + 1).find((h) => h.level <= heading.level);
  return { heading, start: heading.line + 1, end: next ? next.line : total };
}

export interface ListItem {
  index: number;
  start: number;
  end: number;
  marker: string;
  checked: boolean | null;
  text: string;
}

const ITEM = /^([-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/;

/** Top-level list items within [start, end), including continuation lines. */
export function listItems(body: string, start: number, end: number): ListItem[] {
  const ls = lines(body);
  const items: ListItem[] = [];
  let current: ListItem | null = null;
  let parts: string[] = [];
  const close = (at: number) => {
    if (!current) return;
    // Trim trailing blank lines from the item's range.
    let e = at;
    while (e > current.start + 1 && ls[e - 1]!.trim() === "") e--;
    current.end = e;
    current.text = parts.join(" ").replace(/\s+/g, " ").trim();
    items.push(current);
    current = null;
    parts = [];
  };
  for (let i = start; i < end; i++) {
    const line = ls[i]!;
    const m = ITEM.exec(line);
    if (m) {
      close(i);
      current = {
        index: items.length + 1,
        start: i,
        end: i + 1,
        marker: m[1]!,
        checked: m[2] === undefined ? null : m[2].toLowerCase() === "x",
        text: "",
      };
      parts = [m[3]!];
      continue;
    }
    if (current) {
      if (line.trim() === "") {
        // A blank line continues the item only if indented content follows.
        const nextNonBlank = ls.slice(i + 1, end).find((l) => l.trim() !== "");
        if (nextNonBlank !== undefined && /^\s+\S/.test(nextNonBlank)) continue;
        close(i);
        continue;
      }
      if (/^\s+\S/.test(line)) {
        parts.push(line.trim());
        continue;
      }
      close(i);
    }
  }
  close(end);
  return items;
}

export const OPEN_QUESTIONS = "Open questions";
export const ACCEPTANCE = "Acceptance criteria";

/** A question label at the start of an item's text: `**Q3**`, `**Q3.1**`, `**Q3a**`. */
export const LABEL = /^\*\*(Q\d+(?:[a-z]+|\.\d+)*)\*\*(?=\s|$)\s*/;
const ANY_LABEL = /\*\*(Q\d+(?:[a-z]+|\.\d+)*)\*\*/g;
/** The start of a list item, up to where its label goes (after any task box). */
const ITEM_LEAD = /^(\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)/;

/** Every bold label written anywhere in the body, in order. */
export function labelsIn(body: string): string[] {
  return [...body.matchAll(ANY_LABEL)].map((m) => m[1]!);
}

/** The highest leading number of any bold label in the body (Q3.2.1 and Q3a count as 3); 0 if none. */
export function highWaterMark(body: string): number {
  return Math.max(0, ...labelsIn(body).map((l) => parseInt(l.slice(1), 10)));
}

/** A label as a caller may write it (`q3`, `**Q3**`, ` Q3a `), in canonical form. */
export function normaliseLabel(s: string): string {
  const l = s.trim().replace(/^\*\*|\*\*$/g, "").trim();
  return /^q\d/i.test(l) ? `Q${l.slice(1).toLowerCase()}` : l;
}

/** Order of labels: by number, then suffix by suffix (Q3 < Q3.1 < Q3.2 < Q4). */
export function compareLabels(a: string, b: string): number {
  const parts = (l: string) => l.slice(1).match(/\d+|[a-z]+/g) ?? [];
  const pa = parts(a);
  const pb = parts(b);
  for (let k = 0; k < Math.min(pa.length, pb.length); k++) {
    const x = pa[k]!;
    const y = pb[k]!;
    if (x === y) continue;
    const nx = /^\d/.test(x);
    const ny = /^\d/.test(y);
    if (nx && ny) return parseInt(x, 10) - parseInt(y, 10);
    if (nx !== ny) return nx ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return pa.length - pb.length;
}

/**
 * The open questions. A question without a written label gets a provisional one: the next free
 * labels after the body's high-water mark, in order — what `labelQuestions` would write.
 */
export function parseQuestions(body: string): Question[] {
  const s = findSection(body, OPEN_QUESTIONS);
  if (!s) return [];
  let next = highWaterMark(body);
  return listItems(body, s.start, s.end).map((item) => {
    const label = LABEL.exec(item.text);
    const text = label ? item.text.slice(label[0].length) : item.text;
    const implementation = /^\(implementation\)/i.test(text);
    return {
      id: label ? label[1]! : `Q${++next}`,
      provisional: !label,
      text,
      checked: item.checked,
      implementation,
      resolved: item.checked === true,
      start: item.start,
      end: item.end,
    };
  });
}

/** Write the provisional labels of the body's unlabelled questions into it. */
export function labelQuestions(body: string): { body: string; labelled: { line: number; before: string; after: string }[] } {
  const ls = lines(body);
  const labelled: { line: number; before: string; after: string }[] = [];
  for (const q of parseQuestions(body).filter((x) => x.provisional)) {
    const before = ls[q.start]!;
    ls[q.start] = before.replace(ITEM_LEAD, `$1**${q.id}** `);
    labelled.push({ line: q.start, before, after: ls[q.start]! });
  }
  return { body: labelled.length ? ls.join("\n") : body, labelled };
}

/** Labels written at the start of a list item anywhere in the body (outside code fences), with their lines. */
export function itemLabels(body: string): { label: string; line: number }[] {
  const out: { label: string; line: number }[] = [];
  for (const { line, text } of stripCodeFences(body)) {
    const lead = ITEM_LEAD.exec(text);
    const label = lead && LABEL.exec(text.slice(lead[0].length));
    if (label) out.push({ label: label[1]!, line });
  }
  return out;
}

export function parseAcceptance(body: string): string[] {
  const s = findSection(body, ACCEPTANCE);
  if (!s) return [];
  return listItems(body, s.start, s.end).map((i) => i.text);
}

// ---------------------------------------------------------------------------
// Body edits

export function replaceLines(body: string, start: number, end: number, replacement: string[]): string {
  const ls = lines(body);
  ls.splice(start, end - start, ...replacement);
  return ls.join("\n");
}

/** Replace the H1 text, or insert an H1 at the top. */
export function setH1(body: string, title: string): string {
  const h = headings(body).find((x) => x.level === 1);
  if (h) return replaceLines(body, h.line, h.line + 1, [`# ${title}`]);
  return `# ${title}\n\n${body}`;
}

/** Brindley's status callout: a GitHub/VitePress alert whose first text line names the status. */
const CALLOUT_HEAD = /^>\s*\[!(WARNING|NOTE)\]\s*$/;
const CALLOUT_STATUS = /^>\s*\*\*(Abandoned|Superseded|Deferred)\*\*/;

/**
 * Set the status callout directly under the H1 — `lines` (e.g. ["> [!WARNING]", "> **Abandoned** …"])
 * — or remove it (`null`). Only a callout Brindley wrote is replaced; nothing else in the body changes.
 */
export function setStatusCallout(body: string, callout: string[] | null): string {
  const ls = lines(body);
  const h = headings(body).find((x) => x.level === 1);
  const at = h ? h.line + 1 : 0;
  let k = at;
  while (k < ls.length && ls[k]!.trim() === "") k++;
  let end = k;
  if (k + 1 < ls.length && CALLOUT_HEAD.test(ls[k]!) && CALLOUT_STATUS.test(ls[k + 1]!)) {
    end = k;
    while (end < ls.length && ls[end]!.startsWith(">")) end++;
  }
  const rest = ls.slice(end);
  while (rest.length && rest[0]!.trim() === "") rest.shift();
  const head = ls.slice(0, at);
  const block = callout ? ["", ...callout] : [];
  return [...head, ...block, ...(rest.length ? ["", ...rest] : [""])].join("\n");
}

/** Replace a section's content, or add the section at the end (before any appendix). */
export function setSection(body: string, name: string, content: string, before?: string[]): string {
  content = withoutLeadingHeading(content, name);
  const s = findSection(body, name);
  const contentLines = ["", ...content.replace(/\s+$/, "").split("\n"), ""];
  if (s) return replaceLines(body, s.start, s.end, contentLines);
  return insertSection(body, name, content, before);
}

/** Section content minus a leading heading naming that section (callers often include it). */
function withoutLeadingHeading(content: string, name: string): string {
  const m = /^\s*#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*(?:\r?\n|$)/.exec(content);
  if (!m || m[1]!.trim().toLowerCase() !== name.trim().toLowerCase()) return content;
  return content.slice(m[0].length).replace(/^(?:[ \t]*\r?\n)+/, "");
}

/** Insert a new level-2 section before any "Appendix" heading, else at the end. */
export function insertSection(body: string, name: string, content: string, before?: string[]): string {
  const hs = headings(body).filter((h) => h.level === 2);
  const anchors = [...(before ?? []), "appendix"];
  const anchor = hs.find((h) => anchors.some((a) => h.text.toLowerCase().startsWith(a.toLowerCase())));
  const block = [`## ${name}`, "", ...content.replace(/\s+$/, "").split("\n"), ""];
  if (anchor) return replaceLines(body, anchor.line, anchor.line, block);
  const trimmed = body.replace(/\s+$/, "");
  return `${trimmed}\n\n${block.join("\n")}`;
}

/** Placeholder text for a section with nothing in it yet. */
export const NONE = "_None._";

/** Does the section hold only italic placeholder lines (`_None._`, `_What and why._`)? */
export function holdsOnlyPlaceholder(body: string, name: string): boolean {
  const s = findSection(body, name);
  if (!s) return false;
  const text = lines(body).slice(s.start, s.end).filter((l) => l.trim() !== "");
  return text.length > 0 && text.every((l) => /^\s*_[^_]+_\s*$/.test(l));
}

/** Append list item(s) to a section, creating the section if needed and replacing a placeholder. */
export function appendToSection(body: string, name: string, itemText: string, before?: string[]): string {
  const s = findSection(body, name);
  if (!s) return insertSection(body, name, itemText, before);
  if (holdsOnlyPlaceholder(body, name)) return setSection(body, name, itemText);
  const ls = lines(body);
  let at = s.end;
  while (at > s.start && ls[at - 1]!.trim() === "") at--;
  const insert = at === s.start ? ["", ...itemText.split("\n")] : itemText.split("\n");
  ls.splice(at, 0, ...insert);
  return ls.join("\n");
}

/** The line with inline code spans blanked out, so links shown as code aren't read as links. */
export function withoutInlineCode(line: string): string {
  return line.replace(/`[^`]*`/g, (m) => " ".repeat(m.length));
}

export function stripCodeFences(text: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  let fence: string | null = null;
  lines(text).forEach((line, i) => {
    const f = /^\s*(```|~~~)/.exec(line);
    if (f) {
      if (fence === null) fence = f[1]!;
      else if (fence === f[1]) fence = null;
      return;
    }
    if (fence === null) out.push({ line: i, text: line });
  });
  return out;
}

export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "initiative"
  );
}

export function humanise(folderName: string): string {
  const words = folderName.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The status written in the body, as legacy initiatives do: a "**Status:** Proposed -- …" line,
 * or the first line under a "## Status" heading. Returns the leading status word, if any.
 */
export function proseStatus(body: string): string | undefined {
  // Leading status word, keeping a meaningful second word ("in progress", "design complete").
  const pick = (text: string) =>
    /^[\s`*_"']*([A-Za-z][A-Za-z-]*(?:[ -](?:progress|hold|review|complete|completed|settled))?)/i.exec(text)?.[1];
  for (const { text } of stripCodeFences(body)) {
    const m = /^\s*\*\*Status:?\*\*:?\s*(.+)$/i.exec(text);
    if (m) return pick(m[1]!);
  }
  const s = findSection(body, "Status");
  if (s) {
    const first = lines(body).slice(s.start, s.end).find((l) => l.trim() !== "");
    if (first) return pick(first);
  }
  return undefined;
}

export interface SectionLink {
  text: string;
  href: string;
  /** 0-based body line. */
  line: number;
}

export const DEPENDENCIES = "Dependencies";
export const RELATED = "Related";
/** A milestone doc's member list. */
export const DELIVERED_BY = "Delivered by";

/** Markdown links (`[text](href)`) in a named section, outside code. */
export function sectionLinks(body: string, name: string): SectionLink[] {
  const s = findSection(body, name);
  if (!s) return [];
  const out: SectionLink[] = [];
  let fence: string | null = null;
  lines(body).forEach((line, i) => {
    if (i < s.start || i >= s.end) return;
    const f = /^\s*(```|~~~)/.exec(line);
    if (f) {
      if (fence === null) fence = f[1]!;
      else if (fence === f[1]) fence = null;
      return;
    }
    if (fence !== null) return;
    for (const m of withoutInlineCode(line).matchAll(/\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
      out.push({ text: m[1]!, href: m[2]!, line: i });
    }
  });
  return out;
}
