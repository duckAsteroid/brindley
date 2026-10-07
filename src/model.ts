import type { SectionLink } from "./markdown.js";

export const STATUSES = ["draft", "designed", "in-progress", "deferred", "done", "abandoned", "superseded"] as const;
export type Status = (typeof STATUSES)[number];

/** Statuses of work still moving towards done. Deferred is parked: neither active nor closed. */
export const ACTIVE_STATUSES: readonly string[] = ["draft", "designed", "in-progress"];
export const CLOSED_STATUSES: readonly string[] = ["done", "abandoned", "superseded"];

/** Common words accepted for the core statuses (in front-matter or as status folder names). */
export const STATUS_ALIASES: Readonly<Record<string, Status>> = {
  proposed: "draft",
  proposal: "draft",
  exploratory: "draft",
  unresolved: "draft",
  idea: "draft",
  design: "draft",
  designing: "draft",
  "in-design": "draft",
  ready: "designed",
  "design-complete": "designed",
  "design-completed": "designed",
  "design-settled": "designed",
  "in-review": "in-progress",
  wip: "in-progress",
  parked: "deferred",
  "on-hold": "deferred",
  backlog: "deferred",
  future: "deferred",
  complete: "done",
  completed: "done",
  implemented: "done",
  cancelled: "abandoned",
  canceled: "abandoned",
  rejected: "abandoned",
  dropped: "abandoned",
  "wont-do": "abandoned",
  "won't-do": "abandoned",
  wontfix: "abandoned",
  replaced: "superseded",
};

export const COLLECTION_STATUSES = ["active", "done", "abandoned"] as const;

export const INITIATIVE_FILE = /^(\d+)-(.+)\.md$/;
export const ASSET_DIR = /^\d+-/;

/** A reference to another initiative, or to something outside Brindley. */
export type Ref =
  | {
      kind: "initiative";
      raw: string;
      collection: string;
      number: number;
      /** Set when the link's path no longer exists and the target was found by filename instead. */
      movedTo?: string;
    }
  | { kind: "external"; raw: string };

export interface Question {
  /** 1-based position among the section's top-level list items. */
  index: number;
  text: string;
  /** null for a plain bullet, true/false for a task-list item. */
  checked: boolean | null;
  implementation: boolean;
  resolved: boolean;
  /** 0-based line range within the body, end exclusive. */
  start: number;
  end: number;
}

export interface Initiative {
  collection: string;
  number: number;
  slug: string;
  /** Absolute path. */
  file: string;
  /** Path relative to the repo root. */
  rel: string;
  fm: Record<string, unknown>;
  fmText: string | null;
  body: string;
  title: string | null;
  /** Core status (one of STATUSES), resolved from front-matter, else the status folder. */
  status: string | undefined;
  /** The status word as written (front-matter value or folder name), before alias mapping. */
  statusRaw?: string;
  statusSource?: "front-matter" | "folder";
  /** Status word found in the body prose ("**Status:** …" or "## Status"), if any. */
  proseStatus?: string;
  /** Sub-folder of the collection the file lives in (e.g. "completed"), if any. */
  folder?: string;
  statusNote?: string;
  type?: string;
  tags: string[];
  owner?: string;
  updated?: string;
  /** From links under "## Dependencies" (resolved when the repo is loaded). */
  dependsOn: Ref[];
  /** From links under "## Related". */
  related: Ref[];
  /** Raw links found in those sections, before resolution. */
  links: { dependencies: SectionLink[]; related: SectionLink[] };
  supersededBy?: Ref;
  docs: string[];
  docsImpact?: unknown;
  questions: Question[];
  acceptance: string[];
  problems: string[];
}

export interface CollectionMeta {
  title: string;
  summary?: string;
  status: string;
  owner?: string;
  link?: string;
  agent?: string;
  docs?: string[];
  /** Declared initiative types; when present, others are flagged. */
  types?: string[];
  /** Declared tags (themes) with descriptions; when present, others are flagged. */
  tags?: Record<string, string>;
  /** Collection-specific status words mapped to core statuses, e.g. { spiked: designed }. */
  statuses?: Record<string, string>;
  /** Paths or globs, relative to the collection folder, that Brindley ignores. */
  ignore?: string[];
  /** Explicit short names for references, e.g. [lgm] for "lgm#22". */
  aliases?: string[];
  /** Scoring dimensions as declared in front-matter; read with `dimensionsOf` (dimensions.ts). */
  dimensions?: unknown;
  /** What the generated dependency graph shows, as written; read with `parseGraph` (graph.ts). */
  graph?: unknown;
}

export interface Collection {
  /** Short name used in references ("name#n"): front-matter `name`, else the folder name. */
  name: string;
  /** Folder path relative to the repo root, using "/" separators. */
  path: string;
  dir: string;
  readme: string;
  meta: CollectionMeta;
  initiatives: Initiative[];
  /** Explicit aliases, plus the automatic initials alias when it is unambiguous. */
  aliases: string[];
  /** The automatic alias (initials of the folder name), if it was usable. */
  autoAlias?: string;
  /** Numbered files (relative to the collection folder) excluded by `ignore:` patterns. */
  ignored: string[];
}

/** Everything Brindley knows about one repository: its collections. There is no repo-level file. */
/**
 * An overview document for a theme: a non-initiative .md in a collection folder whose
 * front-matter has `theme: <tag>`. Initiatives join the theme with `tags: [<tag>]`.
 */
export interface Theme {
  /** The tag initiatives use to join the theme. */
  tag: string;
  title: string;
  summary?: string;
  /** Shown for the theme in graphs (`graph: { themes: icon }`), from the doc's `icon:`. */
  icon?: string;
  /** Absolute path. */
  file: string;
  /** Path relative to the repo root. */
  rel: string;
  /** Name of the collection whose folder holds the doc. */
  collection: string;
}

export interface Root {
  repoRoot: string;
  collections: Collection[];
  /** Theme overview documents found in collection folders. */
  themes: Theme[];
}

/** Other words for initiative types. "Raconitering" is James Brindley's own spelling of a reconnoitre. */
export const TYPE_ALIASES: Readonly<Record<string, string>> = {
  raconiter: "spike",
  raconitering: "spike",
  reconnoitre: "spike",
  investigation: "spike",
  bugfix: "bug",
  fix: "bug",
  feat: "feature",
};

export function normaliseType(word: string | undefined): string | undefined {
  if (!word) return undefined;
  const w = word.trim().toLowerCase();
  return TYPE_ALIASES[w] ?? word.trim();
}

/** Map a status word to a core status: core names, collection mappings, then common aliases. */
export function normaliseStatus(word: string | undefined, custom?: Record<string, string>): Status | undefined {
  if (!word) return undefined;
  const w = word.trim().toLowerCase().replace(/[\s_]+/g, "-");
  if ((STATUSES as readonly string[]).includes(w)) return w as Status;
  const mapped = custom?.[w] ?? custom?.[word.trim()];
  if (mapped && (STATUSES as readonly string[]).includes(mapped)) return mapped as Status;
  return STATUS_ALIASES[w];
}
