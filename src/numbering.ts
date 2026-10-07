import type { Collection, Initiative } from "./model.js";

/** Width used by a collection with no initiatives yet: `01-`. */
export const DEFAULT_WIDTH = 2;

/** The number prefix of an initiative's filename, as written ("01", "12"). */
export function numberPrefix(i: Pick<Initiative, "rel">): string {
  return /^(\d+)-/.exec(i.rel.split("/").pop()!)?.[1] ?? "";
}

/**
 * Does a prefix fit a width? A zero-padded prefix fits only its own length; an unpadded one fits
 * any width it already fills (`12` fits 1 and 2, but `1` doesn't fit 2 — it should be `01`).
 */
export function fitsWidth(prefix: string, width: number): boolean {
  return prefix.startsWith("0") && prefix.length > 1 ? prefix.length === width : prefix.length >= width;
}

/**
 * The padding width most of a collection's initiatives use: the width the most files fit, the
 * wider on a tie (all `12-`, `13-` fit both 1 and 2: they read as width 2). Empty → DEFAULT_WIDTH.
 */
export function collectionWidth(c: Pick<Collection, "initiatives">): number {
  const prefixes = c.initiatives.map(numberPrefix).filter(Boolean);
  if (prefixes.length === 0) return DEFAULT_WIDTH;
  const candidates = [...new Set([1, DEFAULT_WIDTH, ...prefixes.map((p) => p.length)])].sort((a, b) => a - b);
  let best = candidates[0]!;
  let bestCount = -1;
  for (const w of candidates) {
    const n = prefixes.filter((p) => fitsWidth(p, w)).length;
    if (n >= bestCount) {
      best = w;
      bestCount = n;
    }
  }
  return best;
}

/** A number written at a width: 5 at width 2 → "05"; numbers wider than the width are unchanged. */
export function padNumber(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

/** The number at which a width is 80% full and should grow: 8, 80, 800, … */
export function nearFull(width: number): number {
  return 8 * 10 ** (width - 1);
}

/** The largest number a width can hold: 9, 99, 999, … */
export function capacity(width: number): number {
  return 10 ** width - 1;
}
