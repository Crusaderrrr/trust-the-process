import { addDays, isoWeekday, toLocalDate } from './dates';

export type DayStatus = 'done' | 'skipped' | 'rest';

export function dayStatus(d: { done: boolean; skipped: boolean }): DayStatus {
  if (d.done) return 'done';
  return d.skipped ? 'skipped' : 'rest';
}

/** Inclusive list of dates from → to. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Month grid, Monday-first; null cells pad the first week. */
export function monthGrid(year: number, month0: number): (string | null)[] {
  const first = toLocalDate(new Date(year, month0, 1));
  const last = toLocalDate(new Date(year, month0 + 1, 0));
  const pad: null[] = Array(isoWeekday(first) - 1).fill(null);
  return [...pad, ...datesBetween(first, last)];
}
