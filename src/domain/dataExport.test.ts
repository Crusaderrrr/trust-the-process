import { describe, expect, it } from 'vitest';
import { buildExport, parseExport } from './dataExport';
import type { WorkoutDetail } from './workoutDoc';

const set = (over: object) => ({
  id: 's',
  position: 0,
  setType: 'normal' as const,
  weightKg: 50,
  reps: 8,
  speedKmh: null,
  inclinePct: null,
  completed: 1,
  autoFill: 0,
  ...over,
});

const bench = {
  id: 'e',
  exerciseId: 7,
  name: 'Bench',
  muscleGroup: 'chest' as const,
  image: null,
  restSeconds: 120,
  restCustom: 0,
  grips: null,
  isCardio: 0,
  grip: null,
  note: 'felt heavy',
  position: 0,
  sets: [set({}), set({ id: 't', completed: 0 })],
  previous: [],
};

const workout: WorkoutDetail = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Push',
  date: '2026-11-17',
  startedAt: '2026-11-17T16:00:00.000Z',
  finishedAt: '2026-11-17T17:00:00.000Z',
  notes: null,
  restEndsAt: null,
  rating: 'good',
  feelings: ['felt_strong'],
  templateId: null,
  exercises: [
    {
      id: 'e',
      exerciseId: 7,
      name: 'Bench',
      muscleGroup: 'chest',
      image: null,
      restSeconds: 120,
      restCustom: 0,
      grips: null,
      isCardio: 0,
      grip: null,
      note: 'felt heavy',
      position: 0,
      sets: [set({}), set({ id: 't', completed: 0 })],
      previous: [],
    },
    {
      ...bench,
      id: 'f',
      exerciseId: 8,
      name: 'Empty',
      muscleGroup: 'back',
      grips: null,
      grip: null,
      note: null,
      sets: [set({ completed: 0 })],
    },
  ],
};

describe('data export', () => {
  it('round-trips finished workouts, dropping uncompleted sets and empty exercises', () => {
    const text = buildExport(
      [workout, { ...workout, id: 'x', finishedAt: null }],
      [{ id: 7, equipment: 'barbell' }],
      new Date(0),
    );
    const [w, ...rest] = parseExport(text);
    expect(rest).toEqual([]);
    expect(w).toMatchObject({
      id: workout.id,
      rating: 'good',
      feelings: ['felt_strong'],
      date: '2026-11-17',
    });
    expect(w!.exercises).toHaveLength(1);
    expect(w!.exercises[0]).toMatchObject({
      name: 'Bench',
      note: 'felt heavy',
      meta: { muscleGroup: 'chest', equipment: 'barbell', grips: null },
    });
    expect(w!.exercises[0]!.sets).toHaveLength(1);
  });

  it('rejects files that are not a TTP export', () => {
    expect(() => parseExport('nope')).toThrow(/valid JSON/);
    expect(() => parseExport('{"workouts":[]}')).toThrow(/not a TTP export/);
  });
});

it('reads files from before grips were listed per exercise', () => {
  const file = {
    format: 'ttp-export',
    version: 1,
    workouts: [
      {
        id: '3f0f5a52-3f7a-4c1e-9d0a-0a1b2c3d4e5f', title: 'Pull', date: '2026-10-01', startedAt: '2026-10-01T10:00:00.000Z',
        finishedAt: '2026-10-01T11:00:00.000Z', notes: null, rating: null, feelings: [], templateId: null,
        exercises: [
          {
            name: 'Pushdown', muscleGroup: 'triceps', equipment: 'cable', gripSet: 'triceps', grip: 'rope', note: null,
            sets: [{ setType: 'normal', weightKg: 20, reps: 10, speedKmh: null, inclinePct: null }],
          },
        ],
      },
    ],
  };
  expect(parseExport(JSON.stringify(file))[0]!.exercises[0]!.meta!.grips).toEqual(['rope', 'v_bar', 'straight_bar', 'single_hand']);
});
