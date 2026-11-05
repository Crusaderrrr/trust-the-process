import type { MuscleGroup } from './exercises';

// A template is an ordered list of sections. Each section is one exercise slot restricted to a
// muscle group, filled during the workout. Built-in for now; user-made templates come later.

export type TemplateSlot = { key: string; name: string; muscle: MuscleGroup };
export type Template = { id: string; name: string; slots: TemplateSlot[] };

const slots = (...defs: [MuscleGroup, string, number?][]): TemplateSlot[] =>
  defs.map(([muscle, name, n]) => ({ key: n ? `${muscle}${n}` : muscle, name: n ? `${name} ${n}` : name, muscle }));

export const TEMPLATES: Template[] = [
  {
    id: 'upper',
    name: 'Upper body',
    slots: slots(
      ['chest', 'Chest', 1],
      ['back', 'Back', 1],
      ['chest', 'Chest', 2],
      ['back', 'Back', 2],
      ['triceps', 'Triceps'],
      ['biceps', 'Biceps'],
    ),
  },
  {
    id: 'lower',
    name: 'Lower body',
    slots: slots(
      ['legs', 'Legs', 1],
      ['shoulders', 'Shoulders', 1],
      ['legs', 'Legs', 2],
      ['shoulders', 'Shoulders', 2],
      ['legs', 'Legs', 3],
      ['shoulders', 'Shoulders', 3],
    ),
  },
];

/** Slot key → id of the workout exercise that fills it. */
export type SlotFills = Record<string, string>;

/**
 * Template slots in order, each with its exercise (null = still empty), then the exercises that
 * belong to no slot. A slot whose exercise was removed is empty again.
 */
export function layoutSlots<E extends { id: string }>(
  template: Template,
  fills: SlotFills,
  exercises: E[],
): { rows: { slot: TemplateSlot; we: E | null }[]; extras: E[] } {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const rows = template.slots.map((slot) => ({ slot, we: byId.get(fills[slot.key] ?? '') ?? null }));
  const used = new Set(rows.flatMap((r) => (r.we ? [r.we.id] : [])));
  return { rows, extras: exercises.filter((e) => !used.has(e.id)) };
}
