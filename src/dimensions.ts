import type { Collection, Initiative, Root } from "./model.js";
import { BrindleyError, findCollection } from "./repo.js";

/** A dimension value as written in front-matter: YAML gives strings or numbers. */
export type DimensionValue = string | number;

/** A scoring dimension in effect for a collection. */
export interface Dimension {
  name: string;
  /** Permitted values in ranking order: the first ranks first. */
  values: DimensionValue[];
  required: boolean;
  default?: DimensionValue;
  /** Shipped by Brindley rather than declared by the collection. */
  builtIn: boolean;
}

/** Brindley's default dimensions, all optional. Values are listed first-ranks-first. */
export const DEFAULT_DIMENSIONS: readonly Dimension[] = [
  { name: "priority", values: ["critical", "high", "medium", "low"], required: false, builtIn: true },
  { name: "impact", values: ["high", "medium", "low"], required: false, builtIn: true },
  // Simpler work ranks ahead.
  { name: "complexity", values: ["low", "medium", "high"], required: false, builtIn: true },
];

/** Front-matter keys with a meaning of their own, which a dimension may not reuse. */
export const RESERVED_FIELDS: readonly string[] = [
  "status", "type", "status_note", "owner", "updated", "created", "superseded_by", "tags",
  "docs", "docs_impact", "depends_on", "related", "title", "name",
];

const isValue = (v: unknown): v is DimensionValue => typeof v === "string" || typeof v === "number";

/** Do two values match? YAML may give `3` or `"3"` for the same thing. */
export function sameValue(a: DimensionValue, b: DimensionValue): boolean {
  return String(a) === String(b);
}

/**
 * A collection's `dimensions:` declaration, read leniently: each entry is `{ values, required?,
 * default? }`, or just a list of values. Problems are returned rather than thrown, for `validate`.
 */
export function parseDimensions(raw: unknown): { declared: Dimension[]; problems: string[] } {
  const declared: Dimension[] = [];
  const problems: string[] = [];
  if (raw === undefined || raw === null) return { declared, problems };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    problems.push("`dimensions` must map each dimension name to its declaration.");
    return { declared, problems };
  }
  for (const [name, spec] of Object.entries(raw as Record<string, unknown>)) {
    const obj = Array.isArray(spec) ? { values: spec } : spec && typeof spec === "object" ? (spec as Record<string, unknown>) : null;
    if (!obj) {
      problems.push(`Dimension "${name}" needs \`values\`: a list, first ranking first.`);
      continue;
    }
    const values = Array.isArray(obj["values"]) ? (obj["values"] as unknown[]).filter(isValue) : [];
    if (values.length === 0) problems.push(`Dimension "${name}" has no \`values\`.`);
    const seen = new Set<string>();
    for (const v of values) {
      if (seen.has(String(v))) problems.push(`Dimension "${name}" lists "${v}" more than once.`);
      seen.add(String(v));
    }
    if (RESERVED_FIELDS.includes(name)) {
      // Never treat it as a dimension: its values would be checked against the field's real meaning.
      problems.push(`"${name}" is a front-matter field with its own meaning; name the dimension something else.`);
      continue;
    }
    const def = obj["default"];
    if (def !== undefined && !(isValue(def) && values.some((v) => sameValue(v, def))))
      problems.push(`Dimension "${name}" has \`default: ${String(def)}\`, which is not one of its values.`);
    declared.push({
      name,
      values,
      required: obj["required"] === true,
      ...(isValue(def) ? { default: def } : {}),
      builtIn: false,
    });
  }
  return { declared, problems };
}

/** The dimensions in effect for a collection: the defaults, replaced or added to by its declaration. */
export function dimensionsOf(c: Collection | undefined): Dimension[] {
  const declared = parseDimensions(c?.meta.dimensions).declared;
  const names = new Set(declared.map((d) => d.name));
  return [...DEFAULT_DIMENSIONS.filter((d) => !names.has(d.name)), ...declared];
}

export function dimensionsFor(root: Root, i: Initiative): Dimension[] {
  return dimensionsOf(findCollection(root, i.collection));
}

/** An initiative's value for a dimension: as set, else the dimension's default, else none. */
export function effectiveValue(i: Initiative, d: Dimension): { value: DimensionValue; source: "set" | "default" } | null {
  const v = i.fm[d.name];
  if (isValue(v)) return { value: v, source: "set" };
  if (d.default !== undefined) return { value: d.default, source: "default" };
  return null;
}

/** Each dimension in effect for the initiative, with its value and where that came from. */
export function dimensionReport(root: Root, i: Initiative): Record<string, { value: DimensionValue | null; source: "set" | "default" | null }> {
  return Object.fromEntries(
    dimensionsFor(root, i).map((d) => {
      const e = effectiveValue(i, d);
      return [d.name, { value: e?.value ?? null, source: e?.source ?? null }];
    }),
  );
}

/** Position in the dimension's ranking (0 ranks first); Infinity when unset or not a permitted value. */
export function rankOf(i: Initiative, d: Dimension | undefined): number {
  if (!d) return Infinity;
  const e = effectiveValue(i, d);
  if (!e) return Infinity;
  const k = d.values.findIndex((v) => sameValue(v, e.value));
  return k < 0 ? Infinity : k;
}

/** Every dimension name declared or defaulted anywhere in the repo. */
export function knownDimensions(root: Root): Set<string> {
  const names = new Set(DEFAULT_DIMENSIONS.map((d) => d.name));
  for (const c of root.collections) for (const d of dimensionsOf(c)) names.add(d.name);
  return names;
}

function requireKnown(root: Root, names: string[]): void {
  const known = knownDimensions(root);
  const unknown = names.filter((n) => !known.has(n));
  if (unknown.length)
    throw new BrindleyError(`Unknown dimension ${unknown.map((n) => `"${n}"`).join(", ")}; known: ${[...known].sort().join(", ")}.`);
}

/** Keep initiatives whose value (or default) for each dimension is one of the permitted values. */
export function filterByDimensions(root: Root, items: Initiative[], where: Record<string, DimensionValue[]>): Initiative[] {
  requireKnown(root, Object.keys(where));
  return items.filter((i) => {
    const dims = dimensionsFor(root, i);
    return Object.entries(where).every(([name, wanted]) => {
      const d = dims.find((x) => x.name === name);
      const e = d ? effectiveValue(i, d) : null;
      return e !== null && wanted.some((w) => sameValue(w, e.value));
    });
  });
}

/**
 * Order by each dimension's declared ranking (each initiative ranked by its own collection's
 * declaration), later dimensions breaking ties, then collection and number. Unset values sort last.
 */
export function orderByDimensions(root: Root, items: Initiative[], orderBy: string[]): Initiative[] {
  requireKnown(root, orderBy);
  const keyed = items.map((i) => {
    const dims = dimensionsFor(root, i);
    return { i, ranks: orderBy.map((name) => rankOf(i, dims.find((d) => d.name === name))) };
  });
  keyed.sort((a, b) => {
    for (let k = 0; k < orderBy.length; k++) {
      const x = a.ranks[k]!;
      const y = b.ranks[k]!;
      if (x !== y) return x < y ? -1 : 1;
    }
    return a.i.collection.localeCompare(b.i.collection) || a.i.number - b.i.number;
  });
  return keyed.map((k) => k.i);
}
