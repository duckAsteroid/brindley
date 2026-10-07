import { STATUSES, normaliseStatus } from "./model.js";

/** Where the do-first work goes in a graph. */
export type Direction = "left-to-right" | "right-to-left" | "top-to-bottom" | "bottom-to-top";

/** What a collection README's `graph:` asks for, with defaults filled in. */
export interface GraphSettings {
  /** Draw the dependency graph in the README at all. */
  enabled: boolean;
  /** Reading order of the work: which side the do-first work is on. */
  direction: Direction;
  /** `from`: edges point away from the initiative whose file holds the link (at what it needs). `to`: at it. */
  arrows: "from" | "to";
  /** Draw `## Related` links (dotted). */
  related: boolean;
  /** Core statuses to include as nodes beyond active work. */
  show: string[];
  /** Include external dependencies and other collections' initiatives. */
  external: boolean;
  /** Group each node in a subgraph for its first theme. */
  box: boolean;
  /** Mark each node with its themes: icons before the title, or names after it. */
  mark: "icon" | "label" | null;
  /** Make each node a link to its initiative (and external dependencies to their URL). */
  links: boolean;
}

export const DEFAULT_GRAPH: Readonly<GraphSettings> = {
  enabled: true,
  direction: "left-to-right",
  arrows: "from",
  related: false,
  show: [],
  external: true,
  box: false,
  mark: null,
  links: true,
};

const DIRECTIONS: Record<string, Direction> = {
  "left-to-right": "left-to-right",
  "right-to-left": "right-to-left",
  "top-to-bottom": "top-to-bottom",
  "bottom-to-top": "bottom-to-top",
  lr: "left-to-right",
  rl: "right-to-left",
  tb: "top-to-bottom",
  td: "top-to-bottom",
  bt: "bottom-to-top",
};

const KEYS = ["enabled", "direction", "arrows", "related", "show", "external", "themes", "links"];

/**
 * Read a `graph:` object leniently: anything unusable falls back to the default and is reported as a
 * problem, for `validate`. `statuses` is the collection's own status words, for `show`.
 */
export function parseGraph(raw: unknown, statuses?: Record<string, string>): { settings: GraphSettings; problems: string[] } {
  const settings: GraphSettings = { ...DEFAULT_GRAPH, show: [] };
  const problems: string[] = [];
  if (raw === undefined || raw === null) return { settings, problems };
  if (typeof raw !== "object" || Array.isArray(raw)) return { settings, problems: ["`graph` must be a set of settings, e.g. `graph: { related: true }`."] };
  const g = raw as Record<string, unknown>;
  for (const k of Object.keys(g)) if (!KEYS.includes(k)) problems.push(`Unknown \`graph\` setting "${k}" (known: ${KEYS.join(", ")}).`);
  const bool = (k: "enabled" | "related" | "external" | "links") => {
    if (g[k] === undefined) return;
    if (typeof g[k] === "boolean") settings[k] = g[k] as boolean;
    else problems.push(`\`graph.${k}\` must be true or false.`);
  };
  bool("enabled");
  bool("related");
  bool("external");
  bool("links");
  if (g["direction"] !== undefined) {
    const d = DIRECTIONS[String(g["direction"]).toLowerCase()];
    if (d) settings.direction = d;
    else problems.push(`\`graph.direction: ${String(g["direction"])}\` is not one of left-to-right, right-to-left, top-to-bottom, bottom-to-top.`);
  }
  if (g["arrows"] !== undefined) {
    if (g["arrows"] === "from" || g["arrows"] === "to") settings.arrows = g["arrows"];
    else problems.push(`\`graph.arrows: ${String(g["arrows"])}\` must be from or to.`);
  }
  if (g["show"] !== undefined) {
    const words = Array.isArray(g["show"]) ? g["show"] : [g["show"]];
    for (const w of words) {
      const s = normaliseStatus(String(w), statuses);
      if (s) {
        if (!settings.show.includes(s)) settings.show.push(s);
      } else problems.push(`\`graph.show\` lists "${String(w)}", which is not a status (${STATUSES.join(", ")}) or alias.`);
    }
  }
  if (g["themes"] !== undefined && g["themes"] !== false) {
    const values = g["themes"] === true ? ["label"] : Array.isArray(g["themes"]) ? g["themes"] : [g["themes"]];
    const marks: ("icon" | "label")[] = [];
    for (const v of values) {
      if (v === true || v === "label") marks.push("label");
      else if (v === "icon") marks.push("icon");
      else if (v === "box") settings.box = true;
      else problems.push(`\`graph.themes\` value "${String(v)}" is not box, icon, label or true.`);
    }
    if (marks.includes("icon") && marks.includes("label")) {
      problems.push("`graph.themes` has both icon and label, which say the same thing; label is used.");
      settings.mark = "label";
    } else settings.mark = marks[0] ?? null;
  }
  return { settings, problems };
}

/** Settings with overrides (e.g. a tool call's) applied on top of a collection's `graph:`. */
export function graphSettings(raw: unknown, overrides: Record<string, unknown> = {}, statuses?: Record<string, string>): GraphSettings {
  const defined = Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined));
  const base = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return parseGraph({ ...base, ...defined }, statuses).settings;
}

/**
 * Mermaid's `flowchart` direction. Mermaid places an edge's start before its end; with `arrows: from`
 * edges start at the later work, so the layout is reversed to keep the do-first work on the chosen side.
 */
export function mermaidDirection(s: Pick<GraphSettings, "direction" | "arrows">): "LR" | "RL" | "TB" | "BT" {
  const same = { "left-to-right": "LR", "right-to-left": "RL", "top-to-bottom": "TB", "bottom-to-top": "BT" } as const;
  const reversed = { "left-to-right": "RL", "right-to-left": "LR", "top-to-bottom": "BT", "bottom-to-top": "TB" } as const;
  return (s.arrows === "to" ? same : reversed)[s.direction];
}
