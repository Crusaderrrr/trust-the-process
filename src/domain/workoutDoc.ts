import type { Feeling, Rating } from './checkIn';
import { toLocalDate } from './dates';
import { defaultGrip, type Exercise, type Grip, type GripSet, type MuscleGroup } from './exercises';
import { nextSetValues, type CompletedValues, type SetType, type SetValues } from './sets';
import { defaultTitle } from './workout';

// A workout is edited as one document and saved whole. Every edit is a pure
// function (doc → doc); the repository applies it to the cached document and syncs it.

export type Workout = {
  id: string;
  title: string;
  date: string;
  startedAt: string;
  finishedAt: string | null;
  notes: string | null;
  restEndsAt: string | null;
  /** Optional check-in after the workout. */
  rating: Rating | null;
  feelings: Feeling[];
  /** Built-in template the workout was started from, if any. */
  templateId: string | null;
};

export type WorkoutSet = {
  id: string;
  position: number;
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  speedKmh: number | null;
  inclinePct: number | null;
  completed: number;
  /** Bit 1 = weight, bit 2 = reps: value was copied from an earlier set, not typed here. */
  autoFill: number;
};

export type WorkoutExercise = {
  id: string;
  exerciseId: number;
  name: string;
  muscleGroup: MuscleGroup;
  image: string | null;
  restSeconds: number;
  /** 1 = rest set in a workout; 0 = follows the default from Settings. */
  restCustom: number;
  gripSet: GripSet | null;
  /** Treadmill-style: sets log time / speed / incline instead of kg / reps. */
  isCardio: number;
  grip: Grip | null;
  /** Note for this exercise in this workout only. */
  note: string | null;
  position: number;
  sets: WorkoutSet[];
  /** Completed sets from the most recent earlier finished workout with this exercise (read-only). */
  previous: SetValues[];
};

export type WorkoutDetail = Workout & { exercises: WorkoutExercise[] };

/** Bits of `WorkoutSet.autoFill`. */
export const AUTO_WEIGHT = 1;
export const AUTO_REPS = 2;

export type SetField = 'weight_kg' | 'reps' | 'speed_kmh' | 'incline_pct';
const FIELD_KEY = { weight_kg: 'weightKg', reps: 'reps', speed_kmh: 'speedKmh', incline_pct: 'inclinePct' } as const;

export type ExerciseInfo = Pick<
  Exercise,
  'id' | 'name' | 'muscleGroup' | 'image' | 'restSeconds' | 'restCustom' | 'gripSet' | 'isCardio'
>;

// ---- creating ----

export function newWorkout(id: string, now: Date, today: string): WorkoutDetail {
  return {
    id,
    title: defaultTitle(now),
    date: today,
    startedAt: now.toISOString(),
    finishedAt: null,
    notes: null,
    restEndsAt: null,
    rating: null,
    feelings: [],
    templateId: null,
    exercises: [],
  };
}

/** A finished, empty workout on a past date (18:00, one hour), to be filled in via Edit. */
export function newPastWorkout(id: string, date: string, start: Date): WorkoutDetail {
  start.setHours(18, 0, 0, 0);
  return {
    ...newWorkout(id, start, toLocalDate(start)),
    date,
    finishedAt: new Date(start.getTime() + 60 * 60 * 1000).toISOString(),
  };
}

// ---- workout fields ----

export const updateFields = (
  w: WorkoutDetail,
  fields: Partial<Pick<Workout, 'title' | 'notes' | 'date' | 'startedAt' | 'finishedAt' | 'restEndsAt' | 'rating' | 'feelings'>>,
): WorkoutDetail => ({ ...w, ...fields });

// ---- exercises ----

const mapExercise = (w: WorkoutDetail, weId: string, fn: (e: WorkoutExercise) => WorkoutExercise): WorkoutDetail => ({
  ...w,
  exercises: w.exercises.map((e) => (e.id === weId ? fn(e) : e)),
});

/**
 * Adds exercises to the end. An exercise never logged before starts with one empty set (like
 * Hevy); one logged before starts with the same number of sets as last time, prefilled with
 * that set's weight/reps/type. Those values are not auto-filled, so editing one set never changes
 * the others.
 */
export function addExercises(
  w: WorkoutDetail,
  items: { weId: string; setIds: string[]; exercise: ExerciseInfo; grip: Grip | null; previous: SetValues[] }[],
): WorkoutDetail {
  let position = Math.max(-1, ...w.exercises.map((e) => e.position)) + 1;
  const added = items.map(
    ({ weId, setIds, exercise: x, grip, previous }): WorkoutExercise => ({
      id: weId,
      exerciseId: x.id,
      name: x.name,
      muscleGroup: x.muscleGroup,
      image: x.image,
      restSeconds: x.restSeconds,
      restCustom: x.restCustom,
      gripSet: x.gripSet,
      isCardio: x.isCardio,
      grip,
      note: null,
      position: position++,
      sets: previous.length
        ? previous.map((p, i) => ({
            ...emptySet(setIds[i]!, i),
            setType: p.setType ?? 'normal',
            weightKg: p.weightKg,
            reps: p.reps,
            speedKmh: p.speedKmh ?? null,
            inclinePct: p.inclinePct ?? null,
          }))
        : [emptySet(setIds[0]!, 0)],
      previous,
    }),
  );
  return { ...w, exercises: [...w.exercises, ...added] };
}

const emptySet = (id: string, position: number): WorkoutSet => ({
  id,
  position,
  setType: 'normal',
  weightKg: null,
  reps: null,
  speedKmh: null,
  inclinePct: null,
  completed: 0,
  autoFill: 0,
});

export const removeExercise = (w: WorkoutDetail, weId: string): WorkoutDetail => ({
  ...w,
  exercises: w.exercises.filter((e) => e.id !== weId),
});

/** Swaps the exercise but keeps the logged sets; the grip is kept only between exercises of the same grip set. */
export const replaceExercise = (
  w: WorkoutDetail,
  weId: string,
  x: ExerciseInfo,
  previous: SetValues[],
): WorkoutDetail =>
  mapExercise(w, weId, (e) => ({
    ...e,
    exerciseId: x.id,
    name: x.name,
    muscleGroup: x.muscleGroup,
    image: x.image,
    restSeconds: x.restSeconds,
    restCustom: x.restCustom,
    gripSet: x.gripSet,
    isCardio: x.isCardio,
    grip: replacedGrip(e, x.gripSet),
    previous,
  }));

/** Grip after switching to an exercise with grip set `set`. */
export function replacedGrip(e: Pick<WorkoutExercise, 'grip' | 'gripSet'>, set: GripSet | null): Grip | null {
  if (!set) return null;
  return e.gripSet === set && e.grip ? e.grip : defaultGrip(set);
}

export const setGrip = (w: WorkoutDetail, weId: string, grip: Grip, previous: SetValues[]): WorkoutDetail =>
  mapExercise(w, weId, (e) => ({ ...e, grip, previous }));

/** New exercise order from workout_exercise ids, top to bottom. */
export function reorderExercises(w: WorkoutDetail, ids: string[]): WorkoutDetail {
  const byId = new Map(w.exercises.map((e) => [e.id, e]));
  const ordered = ids.flatMap((id, position) => {
    const e = byId.get(id);
    return e ? [{ ...e, position }] : [];
  });
  return { ...w, exercises: ordered };
}

export const setExerciseNote = (w: WorkoutDetail, weId: string, note: string): WorkoutDetail =>
  mapExercise(w, weId, (e) => ({ ...e, note: note.trim() || null }));

/** Keeps the exercise's display fields (rest, grips…) in step after it was edited elsewhere. */
export const patchExerciseInfo = (
  w: WorkoutDetail,
  exerciseId: number,
  patch: Partial<Pick<WorkoutExercise, 'restSeconds' | 'restCustom' | 'gripSet' | 'image'>>,
): WorkoutDetail => ({
  ...w,
  exercises: w.exercises.map((e) => (e.exerciseId === exerciseId ? { ...e, ...patch } : e)),
});

/** True while the workout uses an exercise created offline (negative temporary id) that the server doesn't know yet. */
export const usesTempExercise = (w: WorkoutDetail): boolean => w.exercises.some((e) => e.exerciseId < 0);

/** Swaps temporary exercise ids for the real ones the server assigned. Same object when nothing changes. */
export function remapExerciseIds(w: WorkoutDetail, ids: Map<number, number>): WorkoutDetail {
  if (!w.exercises.some((e) => ids.has(e.exerciseId))) return w;
  return { ...w, exercises: w.exercises.map((e) => ({ ...e, exerciseId: ids.get(e.exerciseId) ?? e.exerciseId })) };
}

// ---- sets ----

const mapSets = (w: WorkoutDetail, fn: (sets: WorkoutSet[], e: WorkoutExercise) => WorkoutSet[]): WorkoutDetail => ({
  ...w,
  exercises: w.exercises.map((e) => ({ ...e, sets: fn(e.sets, e) })),
});

const mapSet = (w: WorkoutDetail, setId: string, fn: (s: WorkoutSet) => WorkoutSet): WorkoutDetail =>
  mapSets(w, (sets) => sets.map((s) => (s.id === setId ? fn(s) : s)));

/** Copies the set above (or starts empty); copied values count as auto-filled. */
export function addSet(w: WorkoutDetail, weId: string, setId: string): WorkoutDetail {
  return mapExercise(w, weId, (e) => {
    const v = nextSetValues(e.sets);
    const set: WorkoutSet = {
      ...emptySet(setId, (e.sets.at(-1)?.position ?? -1) + 1),
      weightKg: v.weightKg,
      reps: v.reps,
      speedKmh: v.speedKmh ?? null,
      inclinePct: v.inclinePct ?? null,
      autoFill: (v.weightKg === null ? 0 : AUTO_WEIGHT) | (v.reps === null ? 0 : AUTO_REPS),
    };
    return { ...e, sets: [...e.sets, set] };
  });
}

/**
 * Clearing weight or reps of a completed set also un-completes it (completed sets need both);
 * speed and incline are optional. A typed weight/reps is copied to the following sets that are
 * not completed and whose value is empty or auto-filled (never to manually edited ones).
 */
export function updateSetValue(w: WorkoutDetail, setId: string, field: SetField, value: number | null): WorkoutDetail {
  const key = FIELD_KEY[field];
  const bit = field === 'weight_kg' ? AUTO_WEIGHT : field === 'reps' ? AUTO_REPS : 0;
  return mapSets(w, (sets) => {
    const target = sets.find((s) => s.id === setId);
    if (!target) return sets;
    return sets.map((s) => {
      if (s.id === setId) {
        return {
          ...s,
          [key]: value,
          completed: value === null && bit ? 0 : s.completed,
          autoFill: s.autoFill & ~bit,
        };
      }
      const follows = bit && !s.completed && s.position > target.position && (s[key] === null || s.autoFill & bit);
      return follows ? { ...s, [key]: value, autoFill: s.autoFill | bit } : s;
    });
  });
}

export const setSetType = (w: WorkoutDetail, setId: string, setType: SetType): WorkoutDetail =>
  mapSet(w, setId, (s) => ({ ...s, setType }));

export const deleteSet = (w: WorkoutDetail, setId: string): WorkoutDetail =>
  mapSets(w, (sets) => sets.filter((s) => s.id !== setId));

const complete = (s: WorkoutSet, v: CompletedValues): WorkoutSet => ({
  ...s,
  weightKg: v.weightKg,
  reps: v.reps,
  speedKmh: v.speedKmh,
  inclinePct: v.inclinePct,
  completed: 1,
  autoFill: 0,
});

/** Marks a set done with final values and (optionally) starts the rest timer. */
export function completeSet(
  w: WorkoutDetail,
  setId: string,
  values: CompletedValues,
  rest?: { seconds: number; now: number },
): WorkoutDetail {
  const done = mapSet(w, setId, (s) => complete(s, values));
  return rest && rest.seconds > 0 ? { ...done, restEndsAt: new Date(rest.now + rest.seconds * 1000).toISOString() } : done;
}

export const uncompleteSet = (w: WorkoutDetail, setId: string): WorkoutDetail =>
  mapSet(w, setId, (s) => ({ ...s, completed: 0 }));

/**
 * Finalizes a workout: completes the given sets, drops every other incomplete set and any
 * exercise left without sets, then applies the fields (a null/absent field keeps its value).
 */
export function finalizeWorkout(
  w: WorkoutDetail,
  toComplete: (CompletedValues & { id: string })[],
  fields: { title?: string; notes?: string | null; finishedAt?: string; rating?: Rating | null; feelings?: Feeling[] },
): WorkoutDetail {
  const values = new Map(toComplete.map((c) => [c.id, c]));
  const exercises = w.exercises
    .map((e) => ({
      ...e,
      sets: e.sets.map((s) => (values.has(s.id) ? complete(s, values.get(s.id)!) : s)).filter((s) => s.completed),
    }))
    .filter((e) => e.sets.length > 0);
  return {
    ...w,
    exercises,
    title: fields.title ?? w.title,
    notes: fields.notes ?? w.notes,
    finishedAt: fields.finishedAt ?? w.finishedAt,
    rating: fields.rating ?? w.rating ?? null,
    feelings: fields.feelings ?? w.feelings ?? [],
    restEndsAt: null,
  };
}
