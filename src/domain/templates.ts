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

/** Colours a template can take; the first two are the defaults of Upper / Lower. */
export const PALETTE = ['#38bdf8', '#f59e0b', '#a78bfa', '#f472b6', '#f87171', '#2dd4bf', '#a3e635', '#e5e5e5'] as const;
/** Workouts that used no template. */
export const NO_TEMPLATE_COLOR = '#22c55e';

const DEFAULT_COLORS: Record<string, string> = { upper: PALETTE[0], lower: PALETTE[1] };

/** The user's pick for a template, else its default. */
export const templateColor = (id: string | null | undefined, picked: Record<string, string> = {}): string =>
  (id && (picked[id] ?? DEFAULT_COLORS[id])) || NO_TEMPLATE_COLOR;
