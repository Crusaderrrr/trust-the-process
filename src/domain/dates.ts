// Calendar dates are local-time `YYYY-MM-DD` strings. Never derive them from toISOString():
// that is the UTC date and is wrong around midnight.

const pad = (n: number) => String(n).padStart(2, '0');

export function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): string {
  return toLocalDate(new Date());
}

/** Local midnight of a `YYYY-MM-DD` string (`new Date('YYYY-MM-DD')` would be UTC midnight). */
export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

export function addDays(s: string, days: number): string {
  const d = parseLocalDate(s);
  d.setDate(d.getDate() + days);
  return toLocalDate(d);
}

/** ISO weekday: 1 = Monday … 7 = Sunday (JS getDay() is 0 = Sunday). */
export function isoWeekday(s: string): number {
  return parseLocalDate(s).getDay() || 7;
}
