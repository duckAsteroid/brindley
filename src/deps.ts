import { CLOSED_STATUSES, type Initiative, type Ref, type Root } from "./model.js";
import { allInitiatives, initiativeKey, lookup, refKey } from "./repo.js";

export type DepClass = "satisfied" | "blocking" | "external" | "missing";

export interface DepEntry {
  ref: string;
  classification: DepClass;
  title?: string | null;
  status?: string;
  path?: string;
}

export function target(root: Root, ref: Ref): Initiative | undefined {
  return ref.kind === "initiative" ? lookup(root, ref.collection, ref.number) : undefined;
}

/** How a reference is displayed relative to the initiative that makes it. */
export function displayRef(ref: Ref, from: string): string {
  if (ref.kind === "external") return ref.raw;
  return ref.collection === from ? String(ref.number) : refKey(ref.collection, ref.number);
}

export function dependencyReport(root: Root, i: Initiative): DepEntry[] {
  return i.dependsOn.map((ref) => {
    if (ref.kind === "external") return { ref: ref.raw, classification: "external" as const };
    const t = target(root, ref);
    const shown = displayRef(ref, i.collection);
    if (!t) return { ref: shown, classification: "missing" as const };
    return {
      ref: shown,
      classification: t.status === "done" ? ("satisfied" as const) : ("blocking" as const),
      title: t.title,
      status: t.status,
      path: t.rel,
    };
  });
}

export function blockers(root: Root, i: Initiative): DepEntry[] {
  return dependencyReport(root, i).filter((d) => d.classification === "blocking" || d.classification === "missing");
}

export function isReady(root: Root, i: Initiative): boolean {
  return i.status === "designed" && blockers(root, i).length === 0;
}

export function isActive(i: Initiative): boolean {
  return !CLOSED_STATUSES.includes(i.status ?? "");
}

export function dependants(root: Root, i: Initiative): Initiative[] {
  return allInitiatives(root).filter((o) =>
    o.dependsOn.some((r) => r.kind === "initiative" && r.collection === i.collection && r.number === i.number),
  );
}

/** Returns each dependency cycle found, as a list of initiative keys. */
export function cycles(root: Root): string[][] {
  const all = allInitiatives(root);
  const byKey = new Map(all.map((i) => [initiativeKey(i), i]));
  const state = new Map<string, "visiting" | "done">();
  const found: string[][] = [];
  const stack: string[] = [];
  const visit = (key: string) => {
    const s = state.get(key);
    if (s === "done") return;
    if (s === "visiting") {
      const from = stack.indexOf(key);
      found.push([...stack.slice(from), key]);
      return;
    }
    state.set(key, "visiting");
    stack.push(key);
    const i = byKey.get(key);
    for (const r of i?.dependsOn ?? []) {
      if (r.kind !== "initiative") continue;
      const k = refKey(r.collection, r.number);
      if (byKey.has(k)) visit(k);
    }
    stack.pop();
    state.set(key, "done");
  };
  for (const k of [...byKey.keys()].sort()) visit(k);
  return found;
}

/** Would adding `dep` as a dependency of `i` create a cycle? */
export function wouldCycle(root: Root, i: Initiative, dep: Initiative): boolean {
  const seen = new Set<string>();
  const goal = initiativeKey(i);
  const walk = (n: Initiative): boolean => {
    const k = initiativeKey(n);
    if (k === goal) return true;
    if (seen.has(k)) return false;
    seen.add(k);
    return n.dependsOn.some((r) => {
      if (r.kind !== "initiative") return false;
      const t = lookup(root, r.collection, r.number);
      return t ? walk(t) : false;
    });
  };
  return walk(dep);
}

/** Topological order (prerequisites first), ties broken by collection then number. */
export function topoSort(root: Root, items: Initiative[]): Initiative[] {
  const keys = new Set(items.map(initiativeKey));
  const out: Initiative[] = [];
  const seen = new Set<string>();
  const sorted = [...items].sort((a, b) => a.collection.localeCompare(b.collection) || a.number - b.number);
  const visit = (i: Initiative, guard: Set<string>) => {
    const k = initiativeKey(i);
    if (seen.has(k) || guard.has(k)) return;
    guard.add(k);
    for (const r of i.dependsOn) {
      if (r.kind !== "initiative") continue;
      const t = lookup(root, r.collection, r.number);
      if (t && keys.has(initiativeKey(t))) visit(t, guard);
    }
    seen.add(k);
    out.push(i);
  };
  for (const i of sorted) visit(i, new Set());
  return out;
}
