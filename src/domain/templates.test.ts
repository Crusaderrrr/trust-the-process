import { describe, expect, it } from 'vitest';
import { layoutSlots, TEMPLATES } from './templates';

const [upper] = TEMPLATES;
const ex = (id: string) => ({ id });

describe('templates', () => {
  it('upper body is chest, back, chest, back, triceps, biceps with unique keys', () => {
    expect(upper!.slots.map((s) => s.name)).toEqual(['Chest 1', 'Back 1', 'Chest 2', 'Back 2', 'Triceps', 'Biceps']);
    for (const t of TEMPLATES) expect(new Set(t.slots.map((s) => s.key)).size).toBe(t.slots.length);
  });

  it('layoutSlots places filled slots, leaves others empty, and keeps unslotted exercises as extras', () => {
    const { rows, extras } = layoutSlots(upper!, { chest2: 'b', back1: 'gone' }, [ex('a'), ex('b')]);
    expect(rows.map((r) => r.we?.id ?? null)).toEqual([null, null, 'b', null, null, null]);
    expect(extras.map((e) => e.id)).toEqual(['a']);
  });
});
