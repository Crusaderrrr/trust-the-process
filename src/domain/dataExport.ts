import { z } from 'zod';
import { FEELINGS, RATINGS } from './checkIn';
import { EQUIPMENT, GRIP_SETS, GRIPS, MUSCLE_GROUPS, type Exercise, type GripSet } from './exercises';
import type { ImportWorkout } from './hevyImport';
import { SET_TYPES } from './sets';
import type { WorkoutDetail } from './workoutDoc';

// The app's own backup file: finished workouts with exercises by name (ids differ per account), so a
// file restores into the same or another account. Bump `version` on an incompatible change.

const FORMAT = 'ttp-export';

const setSchema = z.object({
  setType: z.enum(SET_TYPES),
  weightKg: z.number().min(0),
  reps: z.number().int().min(1),
  speedKmh: z.number().min(0).nullable(),
  inclinePct: z.number().min(0).nullable(),
});

const workoutSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1),
  date: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
  notes: z.string().nullable(),
  rating: z.enum(RATINGS).nullable(),
  feelings: z.array(z.enum(FEELINGS)),
  templateId: z.string().nullable(),
  exercises: z.array(
    z.object({
      name: z.string().min(1),
      muscleGroup: z.enum(MUSCLE_GROUPS),
      equipment: z.enum(EQUIPMENT),
      gripSet: z.enum(Object.keys(GRIP_SETS) as [GripSet, ...GripSet[]]).nullable(),
      grip: z.enum(GRIPS).nullable(),
      note: z.string().nullable(),
      sets: z.array(setSchema),
    }),
  ),
});

const fileSchema = z.object({
  format: z.literal(FORMAT),
  version: z.literal(1),
  workouts: z.array(workoutSchema),
});

/** Finished workouts only; sets that were never completed are not exported. */
export function buildExport(
  workouts: WorkoutDetail[],
  exercises: Pick<Exercise, 'id' | 'equipment'>[],
  now: Date,
): string {
  const equipment = new Map(exercises.map((e) => [e.id, e.equipment]));
  const data: z.input<typeof fileSchema> & { exportedAt: string } = {
    format: FORMAT,
    version: 1,
    exportedAt: now.toISOString(),
    workouts: workouts
      .filter((w) => w.finishedAt)
      .map((w) => ({
        id: w.id,
        title: w.title,
        date: w.date,
        startedAt: w.startedAt,
        finishedAt: w.finishedAt!,
        notes: w.notes,
        rating: w.rating,
        feelings: w.feelings,
        templateId: w.templateId,
        exercises: w.exercises.map((e) => ({
          name: e.name,
          muscleGroup: e.muscleGroup,
          equipment: equipment.get(e.exerciseId) ?? 'other',
          gripSet: e.gripSet,
          grip: e.grip,
          note: e.note,
          sets: e.sets
            .filter((s) => s.completed && s.reps !== null)
            .map((s) => ({
              setType: s.setType,
              weightKg: s.weightKg ?? 0,
              reps: s.reps!,
              speedKmh: s.speedKmh,
              inclinePct: s.inclinePct,
            })),
        })),
      })),
  };
  return JSON.stringify(data, null, 2);
}

/** Throws a readable error when the text isn't a TTP export. */
export function parseExport(text: string): ImportWorkout[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('This is not a valid JSON file.');
  }
  const parsed = fileSchema.safeParse(json);
  if (!parsed.success) throw new Error('This is not a TTP export file.');
  return parsed.data.workouts.map((w) => ({
    ...w,
    key: w.id,
    exercises: w.exercises
      .map(({ muscleGroup, equipment, gripSet, ...e }) => ({
        ...e,
        meta: { muscleGroup, equipment, gripSet },
      }))
      .filter((e) => e.sets.length > 0),
  }));
}
