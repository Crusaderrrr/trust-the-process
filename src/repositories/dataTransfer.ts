import { api } from '../api/client';
import { buildExport, parseExport } from '../domain/dataExport';
import type { Exercise } from '../domain/exercises';
import { guessExercise, parseHevy, type ImportWorkout } from '../domain/hevyImport';
import type { WorkoutDetail } from '../domain/workoutDoc';
import { unarchiveExercise } from './exercises';
import type { HistoryItem } from './workouts';

// Export / import of the user's finished workouts. Both talk to the server directly (no offline queue).

/** Every finished workout with its sets, as the text of a JSON file. */
export async function exportData(): Promise<string> {
  const history = await api<HistoryItem[]>('GET', '/history');
  const workouts: WorkoutDetail[] = [];
  for (const h of history) workouts.push((await api<{ workout: WorkoutDetail }>('GET', `/workouts/${h.id}`)).workout);
  const exercises = await api<Exercise[]>('GET', '/exercises');
  return buildExport(workouts, exercises, new Date());
}

/** Stable UUID from the workout key, so importing the same file twice overwrites instead of duplicating. */
async function workoutId(key: string): Promise<string> {
  const h = [...new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`import|${key}`)))]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** A TTP JSON export or a Hevy CSV, told apart by the file name. */
export function importFile(file: { name: string; text: string }, onProgress: (done: number, total: number) => void) {
  const workouts = file.name.toLowerCase().endsWith('.json') ? parseExport(file.text) : parseHevy(file.text);
  return importWorkouts(workouts, onProgress);
}

/**
 * Saves the workouts as finished workouts. Exercises are matched by name (case-insensitive, archived
 * ones too); unknown ones are created as custom exercises.
 */
async function importWorkouts(
  workouts: ImportWorkout[],
  onProgress: (done: number, total: number) => void,
): Promise<{ workouts: number; newExercises: string[] }> {
  const byName = new Map<string, Exercise>();
  for (const archived of ['', '?archived=1']) {
    for (const e of await api<Exercise[]>('GET', `/exercises${archived}`)) byName.set(e.name.toLowerCase(), e);
  }

  const newExercises: string[] = [];
  const resolve = async (name: string, meta: ImportWorkout['exercises'][number]['meta']): Promise<number> => {
    const known = byName.get(name.toLowerCase());
    if (known) {
      if (known.archived) await unarchiveExercise(known.id);
      return known.id;
    }
    const created = await api<Exercise>('POST', '/exercises', {
      name: name.slice(0, 80),
      ...(meta ?? { ...guessExercise(name), gripSet: null }),
      image: null,
    });
    byName.set(name.toLowerCase(), created);
    newExercises.push(name);
    return created.id;
  };

  let done = 0;
  for (const w of workouts) {
    const exercises = [];
    for (const [position, e] of w.exercises.entries()) {
      exercises.push({
        id: crypto.randomUUID(),
        exerciseId: await resolve(e.name, e.meta),
        position,
        grip: e.grip ?? null,
        note: e.note,
        sets: e.sets.map((s, i) => ({
          id: crypto.randomUUID(),
          position: i,
          setType: s.setType,
          weightKg: s.weightKg,
          reps: s.reps,
          speedKmh: s.speedKmh,
          inclinePct: s.inclinePct ?? null,
          completed: 1,
          autoFill: 0,
        })),
      });
    }
    const id = w.id ?? (await workoutId(w.key));
    await api('PUT', `/workouts/${id}`, {
      id,
      title: w.title,
      date: w.date,
      startedAt: w.startedAt,
      finishedAt: w.finishedAt,
      notes: w.notes,
      restEndsAt: null,
      rating: w.rating ?? null,
      feelings: w.feelings ?? [],
      templateId: w.templateId ?? null,
      exercises,
    });
    onProgress(++done, workouts.length);
  }
  return { workouts: workouts.length, newExercises };
}
