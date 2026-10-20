import type { Initiative, Milestone, Root } from "./model.js";
import { findCollection, milestoneFor } from "./repo.js";
import type { History } from "./history.js";

/** One initiative as a milestone sees it: keyed `<collection path>#<number>`. */
export interface MemberState {
  key: string;
  status?: string;
  tags: string[];
}

/** How one initiative counts towards a milestone. */
export type Count = "done" | "open" | "ignored";

/** Done counts; deferred, abandoned and superseded are left out; anything else is still to do. */
export function countOf(status: string | undefined): Count {
  if (status === "done") return "done";
  if (status === "deferred" || status === "abandoned" || status === "superseded") return "ignored";
  return "open";
}

export type MilestoneState = "reached" | "unreached" | "unspecified";

/** How an initiative belongs to a milestone: listed, through a theme, or through a nested milestone. */
export type Via = { kind: "listed" } | { kind: "theme"; tag: string } | { kind: "milestone"; slug: string };

export interface Progress {
  state: MilestoneState;
  /** Done initiatives. */
  done: number;
  /** Initiatives that count: done plus still to do. */
  counted: number;
  /** Still to do, as keys, in key order; includes listed initiatives that don't exist. */
  outstanding: string[];
  /** Listed initiatives with no file (they block, as a missing dependency does). */
  missing: string[];
  /** Deferred, abandoned or superseded members, left out of the count. */
  ignored: number;
  /** Included milestones (directly) that are not reached. */
  milestonesOutstanding: string[];
  /** http members: not counted, to confirm by hand. */
  external: string[];
  /** Every initiative member with how it belongs, in key order. */
  members: { key: string; count: Count; via: Via[] }[];
}

/** The current files as member states. */
export function currentStates(root: Root): Map<string, MemberState> {
  const out = new Map<string, MemberState>();
  for (const c of root.collections) for (const i of c.initiatives) out.set(`${c.path}#${i.number}`, { key: `${c.path}#${i.number}`, status: i.status, tags: i.tags });
  return out;
}

export function keyOf(root: Root, i: Initiative): string {
  return `${findCollection(root, i.collection)?.path ?? i.collection}#${i.number}`;
}

/** A path-based key shown as a reference: "<collection name>#<number>". */
export function displayKey(root: Root, key: string): string {
  const at = key.lastIndexOf("#");
  const c = findCollection(root, key.slice(0, at));
  return c ? `${c.name}#${key.slice(at + 1)}` : key;
}

const byKey = (a: string, b: string) => {
  const [pa, na] = [a.slice(0, a.lastIndexOf("#")), Number(a.slice(a.lastIndexOf("#") + 1))];
  const [pb, nb] = [b.slice(0, b.lastIndexOf("#")), Number(b.slice(b.lastIndexOf("#") + 1))];
  return pa.localeCompare(pb) || na - nb;
};

/**
 * A milestone's initiatives — listed, through its themes, and through the milestones it includes,
 * all the way down — with how each belongs. Cycles are cut where they close.
 */
function membersOf(root: Root, m: Milestone, states: Map<string, MemberState>, seen: Set<string> = new Set()): Map<string, Via[]> {
  const out = new Map<string, Via[]>();
  const add = (key: string, via: Via) => {
    const list = out.get(key) ?? [];
    if (!list.some((v) => JSON.stringify(v) === JSON.stringify(via))) list.push(via);
    out.set(key, list);
  };
  seen.add(m.slug);
  for (const member of m.members) {
    if (member.kind === "initiative") add(member.key, { kind: "listed" });
    else if (member.kind === "theme") {
      for (const s of states.values()) if (s.tags.includes(member.tag)) add(s.key, { kind: "theme", tag: member.tag });
    } else if (member.kind === "milestone") {
      const inner = milestoneFor(root, member.slug);
      if (!inner || seen.has(inner.slug)) continue;
      for (const key of membersOf(root, inner, states, new Set(seen)).keys()) add(key, { kind: "milestone", slug: inner.slug });
    }
  }
  return out;
}

/**
 * Where a milestone stands against `states` (the current files, or a commit's): reached when at
 * least one member is done, every counted member is done and every included milestone is reached;
 * unspecified when no member counts; otherwise unreached.
 */
export function progress(root: Root, m: Milestone, states: Map<string, MemberState> = currentStates(root), seen: Set<string> = new Set()): Progress {
  const members = [...membersOf(root, m, states, new Set(seen)).entries()]
    .sort(([a], [b]) => byKey(a, b))
    .map(([key, via]) => ({ key, via, count: states.has(key) ? countOf(states.get(key)!.status) : ("open" as Count) }));
  const missing = members.filter((x) => !states.has(x.key)).map((x) => x.key);
  const done = members.filter((x) => x.count === "done").length;
  const outstanding = members.filter((x) => x.count === "open").map((x) => x.key);
  const inner = new Set([...seen, m.slug]);
  const milestonesOutstanding = [...new Set(m.members.flatMap((x) => (x.kind === "milestone" ? [x.slug] : [])))].filter((slug) => {
    const n = milestoneFor(root, slug);
    if (!n || inner.has(slug)) return true;
    return progress(root, n, states, inner).state !== "reached";
  });
  const counted = done + outstanding.length;
  const state: MilestoneState = counted === 0 ? "unspecified" : outstanding.length === 0 && done > 0 && milestonesOutstanding.length === 0 ? "reached" : "unreached";
  return {
    state,
    done,
    counted,
    outstanding,
    missing,
    ignored: members.filter((x) => x.count === "ignored").length,
    milestonesOutstanding,
    external: m.members.filter((x) => x.kind === "external").map((x) => x.raw),
    members,
  };
}

/** The milestones an initiative counts towards, and how. */
export function milestonesOf(root: Root, i: Initiative, states: Map<string, MemberState> = currentStates(root)): { milestone: Milestone; via: Via[] }[] {
  const key = keyOf(root, i);
  return root.milestones.flatMap((m) => {
    const hit = progress(root, m, states).members.find((x) => x.key === key);
    return hit ? [{ milestone: m, via: hit.via }] : [];
  });
}

/** Milestones that include each other: each cycle as a list of slugs, first slug repeated at the end. */
export function milestoneCycles(root: Root): string[][] {
  const found: string[][] = [];
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const visit = (slug: string) => {
    const s = state.get(slug);
    if (s === "done") return;
    if (s === "visiting") {
      found.push([...stack.slice(stack.indexOf(slug)), slug]);
      return;
    }
    state.set(slug, "visiting");
    stack.push(slug);
    for (const x of milestoneFor(root, slug)?.members ?? []) if (x.kind === "milestone" && milestoneFor(root, x.slug)) visit(x.slug);
    stack.pop();
    state.set(slug, "done");
  };
  for (const m of [...root.milestones].sort((a, b) => a.slug.localeCompare(b.slug))) visit(m.slug);
  return found;
}

/** How a state reads in a sentence: "reached", "not reached", "unspecified". */
export function stateWords(state: MilestoneState): string {
  return state === "unreached" ? "not reached" : state;
}

/** A one-line summary of progress: "reached — 5 of 5 done", "3 of 5 done", "unspecified — nothing counted yet". */
export function progressLine(p: Progress): string {
  const ext = p.external.length ? ` (${p.external.length} external member${p.external.length > 1 ? "s" : ""} not confirmed)` : "";
  if (p.state === "unspecified") return `unspecified — no member counts yet${ext}`;
  const counts = `${p.done} of ${p.counted} done`;
  return p.state === "reached" ? `reached — ${counts}${ext}` : `${counts}${ext}`;
}

/** A milestone whose reached state a change flipped, with what to tell whoever made the change. */
export interface MilestoneFlip {
  milestone: string;
  title: string;
  doc: string;
  reached: boolean;
  message: string;
}

/**
 * The milestones whose reached state differs between `before` and `after` (the same repo either side
 * of a write). `cause` completes "By … you have reached milestone X", e.g. "completing initiatives#15".
 */
export function milestoneFlips(before: Root, after: Root, cause?: string): MilestoneFlip[] {
  const was = new Map(before.milestones.map((m) => [m.slug, progress(before, m).state === "reached"]));
  const out: MilestoneFlip[] = [];
  for (const m of after.milestones) {
    const p = progress(after, m);
    const now = p.state === "reached";
    if ((was.get(m.slug) ?? false) === now) continue;
    // A new milestone doc, or one that was never reached, isn't news until it is reached.
    if (!now && !was.has(m.slug)) continue;
    const name = `"${m.title}" (${m.rel})`;
    const why = [
      ...p.outstanding.map((k) => `${displayKey(after, k)} is ${p.missing.includes(k) ? "missing" : "open"}`),
      ...p.milestonesOutstanding.map((s) => `milestone ${s} is not reached`),
    ];
    out.push({
      milestone: m.slug,
      title: m.title,
      doc: m.rel,
      reached: now,
      message: now
        ? `${cause ? `By ${cause} you have reached` : "This change reached"} milestone ${name}.`
        : `This change means milestone ${name} is no longer reached${why.length ? ` (${why.slice(0, 5).join(", ")}${why.length > 5 ? ", …" : ""})` : p.state === "unspecified" ? " (no member counts any more)" : ""}.`,
    });
  }
  return out;
}

/**
 * When each milestone last became reached, from the first-parent history, judged by today's
 * milestone docs: the commit after which it has stayed reached. Undefined while not reached.
 * `until` (ms) stops the replay there.
 */
export function reachedDates(root: Root, history: History, until = Infinity): Map<string, string | undefined> {
  return replay(root, history, until).dates;
}

/** The initiatives as of `until` from history, and when each milestone last became reached by then. */
export function replay(root: Root, history: History, until = Infinity): { states: Map<string, MemberState>; dates: Map<string, string | undefined> } {
  const commits = Object.entries(history.changes)
    .flatMap(([path, list]) => list.map((ch, j) => ({ path, j, ch, t: Date.parse(ch.date) })))
    .filter((x) => x.t <= until)
    .sort((a, b) => a.t - b.t || a.j - b.j);
  const states = new Map<string, MemberState>();
  const out = new Map<string, string | undefined>(root.milestones.map((m) => [m.slug, undefined]));
  const reachedNow = () => new Map(root.milestones.map((m) => [m.slug, progress(root, m, states).state === "reached"]));
  // One commit can change several collections: apply all of it before judging.
  const bySha = new Map<string, typeof commits>();
  for (const c of commits) bySha.set(c.ch.sha, [...(bySha.get(c.ch.sha) ?? []), c]);
  let last = reachedNow();
  for (const group of bySha.values()) {
    for (const { path, ch } of group) {
      for (const n of ch.removed) states.delete(`${path}#${n}`);
      for (const s of ch.set) states.set(`${path}#${s.number}`, { key: `${path}#${s.number}`, status: s.status, tags: s.tags });
    }
    const ch = group[0]!.ch;
    const now = reachedNow();
    for (const m of root.milestones) {
      if (now.get(m.slug) && !last.get(m.slug)) out.set(m.slug, ch.date);
      else if (!now.get(m.slug)) out.set(m.slug, undefined);
    }
    last = now;
  }
  return { states, dates: out };
}
