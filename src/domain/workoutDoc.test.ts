import { describe, expect, it } from 'vitest';
import {
  AUTO_REPS,
  AUTO_WEIGHT,
  addExercises,
  addSet,
  completeSet,
  deleteSet,
  finalizeWorkout,
  newPastWorkout,
  newWorkout,
  patchExerciseInfo,
  removeExercise,
  remapExerciseIds,
  reorderExercises,
  replaceExercise,
  setExerciseNote,
  setGrip,
  uncompleteSet,
  usesTempExercise,
  updateSetValue,
  type ExerciseInfo,
  type WorkoutDetail,
} from './workoutDoc';

const bench: ExerciseInfo = { id: 1, name: 'Bench', muscleGroup: 'chest', image: null, restSeconds: 120, restCustom: 0, gripSet: null, isCardio: 0 };
const row: ExerciseInfo = { id: 2, name: 'Row', muscleGroup: 'back', image: null, restSeconds: 90, restCustom: 1, gripSet: 'back', isCardio: 0 };
const pushdown: ExerciseInfo = { ...row, id: 4, name: 'Pushdown', muscleGroup: 'triceps', gripSet: 'triceps' };

const base = () => newWorkout('w1', new Date('2026-10-25T08:00:00'), '2026-10-25');
const item = (n: number, exercise: ExerciseInfo, grip: 'normal' | null = null) => ({
  weId: `we${n}`,
  setIds: [`s${n}-0`],
  exercise,
  grip,
  previous: [],
});
it('sets prefilled from the last workout are independent of each other', () => {
  const previous = [60, 70, 80].map((weightKg) => ({ weightKg, reps: 8 }));
  let w = addExercises(base(), [{ ...item(1, bench), setIds: ['a', 'b', 'c'], previous }]);
  w = updateSetValue(w, 'a', 'weight_kg', 65);
  w = updateSetValue(w, 'a', 'reps', 10);
  expect(w.exercises[0]!.sets.map((s) => [s.weightKg, s.reps])).toEqual([[65, 10], [70, 8], [80, 8]]);
});

/** Bench with three sets: ids s1-0, s1-1, s1-2. */
function threeSets(): WorkoutDetail {
  let w = addExercises(base(), [item(1, bench)]);
  w = addSet(w, 'we1', 's1-1');
  return addSet(w, 'we1', 's1-2');
}
const sets = (w: WorkoutDetail, we = 0) => w.exercises[we]!.sets;

describe('creating', () => {
  it('starts an empty unfinished workout titled by the time of day', () => {
    expect(base()).toMatchObject({ id: 'w1', title: 'Morning Workout', date: '2026-10-25', finishedAt: null, exercises: [] });
  });

  it('logs a past workout as a finished evening hour on that date', () => {
    const w = newPastWorkout('p', '2026-10-01', new Date(2026, 9, 1));
    expect(w.date).toBe('2026-10-01');
    expect(w.title).toBe('Evening Workout');
    expect(Date.parse(w.finishedAt!) - Date.parse(w.startedAt)).toBe(3_600_000);
    expect(new Date(w.startedAt).getHours()).toBe(18);
  });
});

describe('exercises', () => {
  it('appends exercises with one empty set, after the existing ones', () => {
    const w = addExercises(addExercises(base(), [item(1, bench)]), [item(2, row, 'normal')]);
    expect(w.exercises.map((e) => [e.id, e.position, e.grip])).toEqual([
      ['we1', 0, null],
      ['we2', 1, 'normal'],
    ]);
    expect(sets(w, 1)).toEqual([expect.objectContaining({ id: 's2-0', position: 0, completed: 0, weightKg: null, setType: 'normal' })]);
  });

  it('replaces the exercise but keeps sets; grip survives only within the same grip set', () => {
    let w = addExercises(base(), [item(1, row, 'normal')]);
    w = setGrip(w, 'we1', 'narrow', [{ weightKg: 40, reps: 10 }]);
    expect(w.exercises[0]).toMatchObject({ grip: 'narrow', previous: [{ weightKg: 40, reps: 10 }] });
    const sameKind = replaceExercise(w, 'we1', { ...row, id: 3, name: 'Pulldown' }, []);
    expect(sameKind.exercises[0]).toMatchObject({ exerciseId: 3, name: 'Pulldown', grip: 'narrow', previous: [] });
    expect(sets(sameKind)).toHaveLength(1);
    expect(replaceExercise(w, 'we1', bench, []).exercises[0]!.grip).toBeNull();
    // a grip exercise that had no grip yet starts at "normal"
    const noGrip = replaceExercise(addExercises(base(), [item(1, bench)]), 'we1', row, []);
    expect(noGrip.exercises[0]!.grip).toBe('normal');
    // another grip set starts at that set's first grip
    expect(replaceExercise(w, 'we1', pushdown, []).exercises[0]).toMatchObject({ gripSet: 'triceps', grip: 'rope' });
  });

  it('removes, reorders and notes', () => {
    let w = addExercises(base(), [item(1, bench), item(2, row), item(3, { ...bench, id: 3 })]);
    w = reorderExercises(w, ['we3', 'we1', 'we2']);
    expect(w.exercises.map((e) => [e.id, e.position])).toEqual([['we3', 0], ['we1', 1], ['we2', 2]]);
    expect(removeExercise(w, 'we1').exercises.map((e) => e.id)).toEqual(['we3', 'we2']);
    expect(setExerciseNote(w, 'we1', '  tight shoulder ').exercises[1]!.note).toBe('tight shoulder');
    expect(setExerciseNote(setExerciseNote(w, 'we1', 'x'), 'we1', '   ').exercises[1]!.note).toBeNull();
  });

  it('patches display fields of every occurrence of an exercise', () => {
    const w = patchExerciseInfo(addExercises(base(), [item(1, bench), item(2, row)]), 1, { restSeconds: 45, restCustom: 1 });
    expect(w.exercises.map((e) => [e.restSeconds, e.restCustom])).toEqual([[45, 1], [90, 1]]);
  });
});

describe('sets', () => {
  it('Add set copies the set above and marks the copies as auto-filled', () => {
    let w = addExercises(base(), [item(1, bench)]);
    expect(sets(addSet(w, 'we1', 's1-1'))[1]).toMatchObject({ weightKg: null, reps: null, autoFill: 0, position: 1 });
    w = updateSetValue(updateSetValue(w, 's1-0', 'weight_kg', 60), 's1-0', 'reps', 8);
    const added = sets(addSet(w, 'we1', 's1-1'))[1]!;
    expect(added).toMatchObject({ weightKg: 60, reps: 8, position: 1, autoFill: AUTO_WEIGHT | AUTO_REPS });
  });

  it('a typed weight flows to later open sets that are empty or auto-filled, never to edited ones', () => {
    let w = threeSets();
    w = updateSetValue(w, 's1-0', 'weight_kg', 60);
    expect(sets(w).map((s) => s.weightKg)).toEqual([60, 60, 60]);
    expect(sets(w).map((s) => s.autoFill & AUTO_WEIGHT)).toEqual([0, AUTO_WEIGHT, AUTO_WEIGHT]);

    w = updateSetValue(w, 's1-1', 'weight_kg', 65); // manual edit: stops being auto, still flows on
    expect(sets(w).map((s) => s.weightKg)).toEqual([60, 65, 65]);
    w = updateSetValue(w, 's1-0', 'weight_kg', 70); // set 2 was edited by hand and keeps 65; set 3 is still auto-filled and follows
    expect(sets(w).map((s) => s.weightKg)).toEqual([70, 65, 70]);
  });

  it('does not touch completed sets or earlier sets, and reps flow separately from weight', () => {
    let w = threeSets();
    w = completeSet(w, 's1-1', { weightKg: 50, reps: 5, speedKmh: null, inclinePct: null });
    w = updateSetValue(w, 's1-0', 'reps', 10);
    expect(sets(w).map((s) => s.reps)).toEqual([10, 5, 10]);
    expect(sets(w).map((s) => s.weightKg)).toEqual([null, 50, null]);
    w = updateSetValue(w, 's1-2', 'reps', 12);
    expect(sets(w).map((s) => s.reps)).toEqual([10, 5, 12]);
  });

  it('speed and incline are not copied, and clearing them keeps a set completed', () => {
    let w = threeSets();
    w = completeSet(w, 's1-0', { weightKg: 0, reps: 600, speedKmh: 8, inclinePct: null });
    w = updateSetValue(w, 's1-0', 'speed_kmh', null);
    expect(sets(w)[0]).toMatchObject({ completed: 1, speedKmh: null });
    w = updateSetValue(w, 's1-0', 'incline_pct', 3);
    expect(sets(w).map((s) => s.inclinePct)).toEqual([3, null, null]);
  });

  it('clearing weight or reps of a completed set un-completes it', () => {
    let w = completeSet(threeSets(), 's1-0', { weightKg: 60, reps: 8, speedKmh: null, inclinePct: null });
    expect(updateSetValue(w, 's1-0', 'reps', null).exercises[0]!.sets[0]!.completed).toBe(0);
    expect(updateSetValue(w, 's1-0', 'weight_kg', null).exercises[0]!.sets[0]!.completed).toBe(0);
    w = uncompleteSet(w, 's1-0');
    expect(sets(w)[0]).toMatchObject({ completed: 0, weightKg: 60, reps: 8 });
  });

  it('completing stores the final values, clears auto-fill and can start the rest timer', () => {
    const w = completeSet(threeSets(), 's1-0', { weightKg: 60, reps: 8, speedKmh: null, inclinePct: null }, { seconds: 90, now: Date.parse('2026-10-25T08:10:00.000Z') });
    expect(sets(w)[0]).toMatchObject({ completed: 1, weightKg: 60, reps: 8, autoFill: 0 });
    expect(w.restEndsAt).toBe('2026-10-25T08:11:30.000Z');
    const noRest = completeSet(threeSets(), 's1-0', { weightKg: 1, reps: 1, speedKmh: null, inclinePct: null }, { seconds: 0, now: 0 });
    expect(noRest.restEndsAt).toBeNull();
  });

  it('deletes a set', () => {
    expect(sets(deleteSet(threeSets(), 's1-1')).map((s) => s.id)).toEqual(['s1-0', 's1-2']);
  });
});

describe('finalizeWorkout', () => {
  const v = (weightKg: number, reps: number) => ({ weightKg, reps, speedKmh: null, inclinePct: null });

  it('completes the given sets, drops other open sets and exercises left empty, resets the rest timer', () => {
    let w = addExercises(base(), [item(1, bench), item(2, row)]);
    w = addSet(w, 'we1', 's1-1');
    w = completeSet(w, 's1-0', v(60, 8), { seconds: 60, now: 0 });
    const done = finalizeWorkout(w, [{ id: 's1-1', ...v(62.5, 6) }], { title: 'Push', finishedAt: '2026-10-25T09:00:00.000Z' });
    expect(done.exercises.map((e) => e.id)).toEqual(['we1']); // Row had no completed set
    expect(sets(done).map((s) => [s.id, s.weightKg, s.reps, s.completed])).toEqual([['s1-0', 60, 8, 1], ['s1-1', 62.5, 6, 1]]);
    expect(done).toMatchObject({ title: 'Push', finishedAt: '2026-10-25T09:00:00.000Z', restEndsAt: null });
  });

  it('keeps title, notes and finish time when the fields are absent, and applies notes when given', () => {
    const w = completeSet({ ...threeSets(), notes: 'old', title: 'Keep me' }, 's1-0', v(1, 1));
    const done = finalizeWorkout(w, [], {});
    expect(done).toMatchObject({ title: 'Keep me', notes: 'old', finishedAt: null });
    expect(sets(done)).toHaveLength(1);
    expect(finalizeWorkout(w, [], { notes: 'new' }).notes).toBe('new');
  });
});

describe('exercises created offline', () => {
  it('re-points temporary ids to the real ones', () => {
    const offline: ExerciseInfo = { ...bench, id: -1, name: 'Cable fly' };
    const w = addExercises(base(), [item(1, offline), item(2, row)]);
    expect(usesTempExercise(w)).toBe(true);
    const fixed = remapExerciseIds(w, new Map([[-1, 77]]));
    expect(fixed.exercises.map((e) => e.exerciseId)).toEqual([77, 2]);
    expect(usesTempExercise(fixed)).toBe(false);
    expect(remapExerciseIds(fixed, new Map([[-1, 77]]))).toBe(fixed); // nothing to change: same object
  });
});
