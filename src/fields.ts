import { STATUSES, STATUS_ALIASES, TYPE_ALIASES, type Collection, type Root } from "./model.js";
import { declaredTags } from "./repo.js";
import { dimensionsOf } from "./dimensions.js";

/** The types Brindley suggests when a collection doesn't declare its own (FORMAT §4.1). */
export const SUGGESTED_TYPES = ["feature", "bug", "refactor", "perf", "docs", "chore", "spike"] as const;

/** One front-matter field an initiative in this collection can have, and what it accepts. */
export interface FieldInfo {
  field: string;
  /** `choice`: one of `values`; `list`: any of `values`; `text`, `date`, `paths`: free. */
  kind: "choice" | "list" | "text" | "date" | "paths";
  description: string;
  /** Accepted values: in ranking order for a dimension. */
  values?: (string | number)[];
  /** Other words read as one of the values. */
  aliases?: Record<string, string>;
  /** `strict`: other values are refused or flagged; `open`: other values are accepted. */
  enforced?: "strict" | "open";
  required?: boolean;
  default?: string | number;
  /** A dimension Brindley ships, rather than one the collection declares. */
  builtIn?: boolean;
  /** How the field is set, when a tool should be used rather than editing it directly. */
  setWith?: string;
}

/** The effective scoring dimensions of a collection, as `get`, `collections` and `fields` report them. */
export function dimensionInfo(c: Collection | undefined) {
  return dimensionsOf(c).map((d) => ({
    name: d.name,
    values: d.values,
    required: d.required,
    ...(d.default !== undefined ? { default: d.default } : {}),
    builtIn: d.builtIn,
  }));
}

/** Every front-matter field an initiative in `c` can carry, with the values each accepts. */
export function fieldsFor(root: Root, c: Collection): FieldInfo[] {
  const own = c.meta.statuses ?? {};
  const tags = declaredTags(root);
  const fields: FieldInfo[] = [
    {
      field: "status",
      kind: "choice",
      description: "Where the initiative is in its lifecycle. Required (or taken from a status folder).",
      values: [...STATUSES],
      aliases: { ...STATUS_ALIASES, ...own },
      enforced: "strict",
      required: true,
      setWith: "set_status (changes, with lifecycle checks); update records one only when none is set; complete for done",
    },
    {
      field: "type",
      kind: "choice",
      description: c.meta.types ? "What kind of work it is; this collection declares its types." : "What kind of work it is; any word is accepted.",
      values: c.meta.types ?? [...SUGGESTED_TYPES],
      aliases: { ...TYPE_ALIASES },
      enforced: c.meta.types ? "strict" : "open",
      setWith: "update",
    },
    {
      field: "tags",
      kind: "list",
      description: tags ? "Themes it belongs to; tags must be declared." : "Themes it belongs to (lowercase kebab-case).",
      ...(tags ? { values: Object.keys(tags).sort() } : {}),
      enforced: tags ? "strict" : "open",
      setWith: "update",
    },
    ...dimensionsOf(c).map(
      (d): FieldInfo => ({
        field: d.name,
        kind: "choice",
        description: `Scoring dimension, ranked first to last: ${d.values.join(" > ")}.${d.builtIn ? " Built in." : " Declared by this collection."}`,
        values: d.values,
        enforced: "strict",
        required: d.required,
        ...(d.default !== undefined ? { default: d.default } : {}),
        builtIn: d.builtIn,
        setWith: "update (dimensions) or batch_update",
      }),
    ),
    { field: "owner", kind: "text", description: "Owning team, module or person.", setWith: "update" },
    { field: "status_note", kind: "text", description: "A one-line qualifier shown with the status; for abandoned, superseded or deferred work, the reason.", setWith: "update, or set_status's reason" },
    { field: "superseded_by", kind: "text", description: "The initiative that replaces it (required when superseded).", setWith: "set_status" },
    { field: "branch", kind: "text", description: "While in progress: the branch it is being built on.", setWith: "set_status (recorded when work starts)" },
    { field: "docs", kind: "paths", description: "Project docs it is expected to change.", setWith: "update" },
    { field: "docs_impact", kind: "paths", description: "On completion: the project docs changed, or 'none: <reason>'.", setWith: "complete" },
    { field: "updated", kind: "date", description: "Last meaningful change (YYYY-MM-DD); tools keep it current." },
  ];
  return fields;
}
