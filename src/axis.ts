/** A time axis for a span, in UTC so the same commits give the same axis anywhere. */
export interface TimeAxis {
  unit: "hours" | "days" | "weeks" | "months";
  /** Gridline instants (ms). */
  grid: number[];
  labels: { t: number; text: string }[];
}

const DAY = 864e5;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const startOfDay = (t: number) => Math.floor(t / DAY) * DAY;
const dayLabel = (t: number) => {
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

/**
 * Gridlines and labels for the span `t0`–`t1`, the unit picked from its length so there are
 * roughly 4–12 labels: under 3 days, 6-hourly gridlines with days labelled; under ~10 weeks, days
 * (labelled every few days, or at Mondays); under ~2 years, weeks (labelled at each month's first
 * Monday); longer, months (labelled by quarter).
 */
export function timeAxis(t0: number, t1: number): TimeAxis {
  const span = Math.max(t1 - t0, 1);
  const within = (t: number) => t > t0 && t < t1;
  if (span < 3 * DAY) {
    const grid: number[] = [];
    for (let t = startOfDay(t0); t < t1; t += DAY / 4) if (within(t)) grid.push(t);
    let labels = grid.filter((t) => t % DAY === 0).map((t) => ({ t, text: dayLabel(t) }));
    if (labels.length < 2)
      labels = grid.map((t) => ({ t, text: t % DAY === 0 ? dayLabel(t) : `${String(new Date(t).getUTCHours()).padStart(2, "0")}:00` }));
    return { unit: "hours", grid, labels };
  }
  if (span < 70 * DAY) {
    const grid: number[] = [];
    for (let t = startOfDay(t0) + DAY; t < t1; t += DAY) grid.push(t);
    const days = grid.length;
    const labelled =
      days <= 12 ? grid : days <= 24 ? grid.filter((t) => (t / DAY) % 2 === 0) : grid.filter((t) => new Date(t).getUTCDay() === 1);
    return { unit: "days", grid, labels: labelled.map((t) => ({ t, text: dayLabel(t) })) };
  }
  if (span < 730 * DAY) {
    const grid: number[] = [];
    let t = startOfDay(t0);
    while (new Date(t).getUTCDay() !== 1) t += DAY;
    for (; t < t1; t += 7 * DAY) if (within(t)) grid.push(t);
    let lastMonth = -1;
    const labels: { t: number; text: string }[] = [];
    for (const g of grid) {
      const d = new Date(g);
      if (d.getUTCMonth() === lastMonth) continue;
      lastMonth = d.getUTCMonth();
      if (d.getUTCDate() > 7) continue; // not the month's first Monday: the month started before the span
      const first = labels.length === 0 || d.getUTCMonth() === 0;
      labels.push({ t: g, text: first ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : MONTHS[d.getUTCMonth()]! });
    }
    return { unit: "weeks", grid, labels };
  }
  const grid: number[] = [];
  const s = new Date(t0);
  for (let y = s.getUTCFullYear(), m = s.getUTCMonth() + 1; ; m++) {
    const t = Date.UTC(y + Math.floor(m / 12), m % 12, 1);
    if (t >= t1) break;
    grid.push(t);
  }
  const labels = grid
    .filter((t) => new Date(t).getUTCMonth() % 3 === 0)
    .map((t) => ({ t, text: `Q${new Date(t).getUTCMonth() / 3 + 1} ${new Date(t).getUTCFullYear()}` }));
  return { unit: "months", grid, labels };
}

export const formatDay = dayLabel;

/** "7 Oct 2026, 14:19 UTC" style, or without the time. */
export function formatWhen(iso: string, withTime: boolean): string {
  const d = new Date(iso);
  const date = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return withTime ? `${date}, ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC` : date;
}
