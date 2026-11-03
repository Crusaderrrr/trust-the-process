import { describe, expect, it } from 'vitest';
import { datesBetween, dayStatus, monthGrid } from './calendar';

describe('calendar', () => {
  it('derives day status', () => {
    expect(dayStatus({ done: true, skipped: false })).toBe('done');
    expect(dayStatus({ done: true, skipped: true })).toBe('done');
    expect(dayStatus({ done: false, skipped: true })).toBe('skipped');
    expect(dayStatus({ done: false, skipped: false })).toBe('rest');
  });

  it('builds Monday-first month grids', () => {
    const oct = monthGrid(2026, 9); // Oct 1 2026 is a Thursday
    expect(oct.slice(0, 4)).toEqual([null, null, null, '2026-10-01']);
    expect(oct.filter(Boolean)).toHaveLength(31);
    expect(monthGrid(2026, 1).filter(Boolean)).toHaveLength(28);
    expect(datesBetween('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });
});
