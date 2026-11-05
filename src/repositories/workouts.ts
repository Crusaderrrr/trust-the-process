import { api, isNetworkError } from '../api/client';
import { parseLocalDate, today } from '../domain/dates';
import type { Rating } from '../domain/checkIn';
import { defaultGrip, type Grip } from '../domain/exercises';
import type { CompletedValues, SetType, SetValues } from '../domain/sets';
import * as doc from '../domain/workoutDoc';
import type { Workout, WorkoutDetail } from '../domain/workoutDoc';
import { listExercises } from './exercises';
import { previousFromDevice, rememberFinished } from './lastSets';
import { create, loadActive, loadWorkout, mutate, remove, settled } from './workoutStore';

export { AUTO_REPS, AUTO_WEIGHT } from '../domain/workoutDoc';
export type { SetField, Workout, WorkoutDetail, WorkoutExercise, WorkoutSet } from '../domain/workoutDoc';

// Every edit below is a pure function from domain/workoutDoc applied to the cached document and
// saved whole in the background (see workoutStore). The promise resolves once the edit is applied locally.

const newId = () => crypto.randomUUID();

export const getActiveWorkout = (): Promise<Workout | null> => loadActive();

export const getWorkout = (id: string): Promise<WorkoutDetail | null> => loadWorkout(id);

/** Starts today's workout; the server lifts a skip marked for today (SPEC §5.1). */
export async function startWorkout(template?: { id: string; name: string }): Promise<string> {
  const w = doc.newWorkout(newId(), new Date(), today());
  await create(template ? { ...w, title: template.name, templateId: template.id } : w);
  return w.id;
}

/** Creates a finished (empty) workout on a past date, to be filled in via Edit. */
export async function logPastWorkout(date: string): Promise<string> {
  const w = doc.newPastWorkout(newId(), date, parseLocalDate(date));
  await create(w);
  return w.id;
}

export const deleteWorkout = (id: string) => remove(id);

export const updateWorkout = (
  id: string,
  fields: Partial<Pick<Workout, 'title' | 'notes' | 'date' | 'startedAt' | 'finishedAt' | 'restEndsAt' | 'rating' | 'feelings'>>,
) => mutate(id, (w) => doc.updateFields(w, fields));

// ---- exercises in a workout ----

/** The "Previous" column for an exercise in this workout: the latest earlier finished one. */
async function previousFor(w: WorkoutDetail, exerciseId: number, grip: Grip | null): Promise<SetValues[]> {
  if (exerciseId < 0) return []; // created offline: no history yet
  const q = new URLSearchParams({ date: w.date, startedAt: w.startedAt, excludeWorkoutId: w.id });
  if (grip) q.set('grip', grip);
  await settled(); // a workout finished a moment ago must have reached the server
  try {
    return await api<SetValues[]>('GET', `/exercises/${exerciseId}/previous?${q}`);
  } catch (e) {
    if (isNetworkError(e)) return previousFromDevice(w, exerciseId, grip); // offline: the copy kept on the device
    throw e;
  }
}

/**
 * Adds exercises to the end. Grip exercises start with the last grip used. An exercise logged
 * before starts with the same sets (count, weight/reps, type) as its last workout.
 */
export async function addExercises(workoutId: string, exerciseIds: number[], weIds: string[] = []) {
  const w = await loadWorkout(workoutId);
  if (!w) return;
  const all = await listExercises();
  const items = await Promise.all(
    exerciseIds.map(async (id, i) => {
      const exercise = all.find((e) => e.id === id);
      if (!exercise) throw new Error('Exercise not found');
      const grip = exercise.gripSet ? (exercise.lastGrip ?? defaultGrip(exercise.gripSet)) : null;
      const previous = await previousFor(w, id, grip);
      const setIds = previous.length ? previous.map(() => newId()) : [newId()];
      return { weId: weIds[i] ?? newId(), setIds, exercise, grip, previous };
    }),
  );
  return mutate(workoutId, (d) => doc.addExercises(d, items));
}

export const removeWorkoutExercise = (workoutId: string, weId: string) =>
  mutate(workoutId, (w) => doc.removeExercise(w, weId));

export async function replaceExercise(workoutId: string, weId: string, exerciseId: number) {
  const w = await loadWorkout(workoutId);
  const current = w?.exercises.find((e) => e.id === weId);
  if (!w || !current) return;
  const exercise = (await listExercises()).find((e) => e.id === exerciseId);
  if (!exercise) throw new Error('Exercise not found');
  const previous = await previousFor(w, exerciseId, doc.replacedGrip(current, exercise.gripSet));
  return mutate(workoutId, (d) => doc.replaceExercise(d, weId, exercise, previous));
}

export async function setGrip(workoutId: string, weId: string, grip: Grip) {
  const w = await loadWorkout(workoutId);
  const current = w?.exercises.find((e) => e.id === weId);
  if (!w || !current) return;
  const previous = await previousFor(w, current.exerciseId, grip);
  return mutate(workoutId, (d) => doc.setGrip(d, weId, grip, previous));
}

/** Persists a new exercise order (workout_exercise ids, top to bottom). */
export const reorderExercises = (workoutId: string, ids: string[]) =>
  mutate(workoutId, (w) => doc.reorderExercises(w, ids));

export const setExerciseNote = (workoutId: string, weId: string, note: string) =>
  mutate(workoutId, (w) => doc.setExerciseNote(w, weId, note));

// ---- sets ----

export const addSet = (workoutId: string, weId: string) => mutate(workoutId, (w) => doc.addSet(w, weId, newId()));

export const updateSetValue = (workoutId: string, setId: string, field: doc.SetField, value: number | null) =>
  mutate(workoutId, (w) => doc.updateSetValue(w, setId, field, value));

export const setSetType = (workoutId: string, setId: string, type: SetType) =>
  mutate(workoutId, (w) => doc.setSetType(w, setId, type));

export const deleteSet = (workoutId: string, setId: string) => mutate(workoutId, (w) => doc.deleteSet(w, setId));

/** Marks a set done with final values and (optionally) starts the rest timer. */
export const completeSet = (workoutId: string, setId: string, values: CompletedValues, rest?: { seconds: number }) =>
  mutate(workoutId, (w) => doc.completeSet(w, setId, values, rest && { seconds: rest.seconds, now: Date.now() }));

export const uncompleteSet = (workoutId: string, setId: string) =>
  mutate(workoutId, (w) => doc.uncompleteSet(w, setId));

/**
 * Finalizes a workout: completes the given sets, drops every other incomplete set and any
 * exercise left without sets, then applies the workout fields (e.g. finishedAt, title).
 */
export async function finalizeWorkout(
  workoutId: string,
  complete: (CompletedValues & { id: string })[],
  fields: Parameters<typeof doc.finalizeWorkout>[2],
) {
  await mutate(workoutId, (w) => doc.finalizeWorkout(w, complete, fields));
  const w = await loadWorkout(workoutId);
  if (w) rememberFinished(w); // so the next workout offline already shows these sets as "Previous"
}

// ---- lists (always from the server) ----

export type HistoryItem = Workout & {
  exercises: { name: string; sets: number; grip: Grip | null }[];
  volume: number;
};

export async function listHistory(): Promise<HistoryItem[]> {
  await settled();
  return api<HistoryItem[]>('GET', '/history');
}

/** Finished workouts in a date range (for the calendar), with their per-exercise notes. */
export async function workoutsBetween(from: string, to: string) {
  await settled();
  return api<{ id: string; title: string; date: string; rating: Rating | null; notes: { workoutId: string; name: string; note: string }[] }[]>(
    'GET',
    `/workouts?from=${from}&to=${to}`,
  );
}
