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
  ready: "designed",
  "design-complete": "designed",
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
  replaced: "superseded",
};

export const COLLECTION_STATUSES = ["active", "done", "abandoned"] as const;

export const INITIATIVE_FILE = /^(\d+)-(.+)\.md$/;
export const ASSET_DIR = /^\d+-/;

/** A reference to another initiative, or to something outside Brindley. */
export type Ref =
  | { kind: "initiative"; raw: string; collection: string; number: number }
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
  dependsOn: Ref[];
  related: Ref[];
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
}

/** Everything Brindley knows about one repository: its collections. There is no repo-level file. */
export interface Root {
  repoRoot: string;
  collections: Collection[];
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
