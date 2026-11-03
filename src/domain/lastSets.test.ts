import { describe, expect, it } from 'vitest';
import { pickPrevious, withFinished, type LastSets } from './lastSets';
import { addExercises, completeSet, finalizeWorkout, newWorkout, type ExerciseInfo } from './workoutDoc';

const set = (reps: number) => ({ weightKg: 50, reps, speedKmh: null, inclinePct: null, setType: 'normal' as const });
const entry = (grip: LastSets['grip'], date: string, reps: number): LastSets => ({
  exerciseId: 1, grip, date, startedAt: `${date}T17:00:00.000Z`, sets: [set(reps)],
});
const before = { date: '2026-09-10', startedAt: '2026-09-10T17:00:00.000Z' };

describe('pickPrevious', () => {
  const entries = [entry('wide', '2026-09-01', 10), entry('narrow', '2026-09-08', 8), entry(null, '2026-08-01', 5)];

  it('prefers the same grip over a newer one', () => {
    expect(pickPrevious(entries, 1, 'wide', before)[0]!.reps).toBe(10);
  });
  it('falls back to a workout logged without a grip, not to another grip', () => {
    expect(pickPrevious(entries, 1, 'normal', before)[0]!.reps).toBe(5);
  });
  it('without a grip, grip-less history wins, else the newest', () => {
    expect(pickPrevious(entries, 1, null, before)[0]!.reps).toBe(5);
    expect(pickPrevious([entry('wide', '2026-09-01', 10), entry('narrow', '2026-09-08', 8)], 1, null, before)[0]!.reps).toBe(8);
  });
  it('ignores workouts that are not earlier, and other exercises', () => {
    expect(pickPrevious(entries, 1, 'narrow', { date: '2026-09-08', startedAt: '2026-09-08T17:00:00.000Z' })[0]!.reps).toBe(5);
    expect(pickPrevious(entries, 2, null, before)).toEqual([]);
  });
});

describe('withFinished', () => {
  const bench: ExerciseInfo = { id: 1, name: 'Bench', muscleGroup: 'chest', image: null, restSeconds: 120, restCustom: 0, gripSet: null, isCardio: 0 };
  const finished = (date: string) => {
    let w = addExercises(newWorkout('w', new Date(`${date}T17:00:00.000Z`), date), [
      { weId: 'we', setIds: ['s1', 's2'], exercise: bench, grip: null, previous: [] },
    ]);
    w = completeSet(w, 's1', { weightKg: 60, reps: 5, speedKmh: null, inclinePct: null });
    return finalizeWorkout(w, [], { finishedAt: `${date}T18:00:00.000Z` }); // the second set stays empty and is dropped
  };

  it('remembers the completed sets of a newly finished workout', () => {
    const out = withFinished([entry(null, '2026-09-01', 10)], finished('2026-09-10'));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ date: '2026-09-10', sets: [{ weightKg: 60, reps: 5 }] });
  });
  it('keeps a newer entry when an older workout is edited', () => {
    const entries = [entry(null, '2026-09-20', 7)];
    expect(withFinished(entries, finished('2026-09-10'))).toEqual(entries);
  });
  it('ignores unfinished workouts', () => {
    const open = newWorkout('w', new Date(), '2026-09-10');
    expect(withFinished([], open)).toEqual([]);
  });
});
