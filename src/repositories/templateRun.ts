import type { SlotFills } from '../domain/templates';

// Which template an active workout was started from and which exercise fills each slot.
// Kept on this device only (like the offline copy of the workout); finishing drops the empty
// slots, so nothing about the template ends up in the saved workout.

export type TemplateRun = { templateId: string; fills: SlotFills };

const key = (workoutId: string) => `ttp.template.${workoutId}`;

export function getRun(workoutId: string): TemplateRun | null {
  try {
    const raw = localStorage.getItem(key(workoutId));
    return raw ? (JSON.parse(raw) as TemplateRun) : null;
  } catch {
    return null;
  }
}

export const startRun = (workoutId: string, templateId: string) =>
  localStorage.setItem(key(workoutId), JSON.stringify({ templateId, fills: {} } satisfies TemplateRun));

export function fillSlot(workoutId: string, slotKey: string, weId: string) {
  const run = getRun(workoutId);
  if (run) localStorage.setItem(key(workoutId), JSON.stringify({ ...run, fills: { ...run.fills, [slotKey]: weId } }));
}
