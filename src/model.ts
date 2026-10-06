export const STATUSES = ["draft", "designed", "in-progress", "done", "abandoned", "superseded"] as const;
export type Status = (typeof STATUSES)[number];

export const CLOSED_STATUSES: readonly string[] = ["done", "abandoned", "superseded"];

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
  /** Path relative to the initiatives root. */
  rel: string;
  fm: Record<string, unknown>;
  fmText: string | null;
  body: string;
  title: string | null;
  status: string | undefined;
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
}

export interface Collection {
  /** Path relative to the initiatives root, using "/" separators. */
  path: string;
  dir: string;
  readme: string;
  hasReadme: boolean;
  meta: CollectionMeta;
  initiatives: Initiative[];
}

export interface RootMeta {
  format: number;
  agent?: string;
  docs?: string[];
  types?: string[];
  tags?: Record<string, string>;
}

export interface Root {
  repoRoot: string;
  dir: string;
  /** Root directory relative to the repo root. */
  rel: string;
  readme: string;
  meta: RootMeta;
  collections: Collection[];
  /** Initiative-looking files directly in the root (invalid). */
  strays: string[];
}
