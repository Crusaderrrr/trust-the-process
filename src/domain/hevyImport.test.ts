import { describe, expect, it } from 'vitest';
import { guessExercise, parseCsv, parseHevy, parseHevyDate } from './hevyImport';

const HEAD =
  '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"\n';
const L = '"Leg day 💪","17 Nov 2026, 17:34","17 Nov 2026, 18:19","go",';

describe('hevy import', () => {
  it('parses quoted CSV with commas, quotes and newlines', () => {
    expect(parseCsv('a,"b,""c""\nd",\n"x",y')).toEqual([
      ['a', 'b,"c"\nd', ''],
      ['x', 'y'],
    ]);
  });

  it('parses Hevy dates as local time', () => {
    expect(parseHevyDate('17 Nov 2026, 17:34')).toEqual(new Date(2026, 10, 17, 17, 34));
    expect(parseHevyDate('nope')).toBeNull();
  });

  it('groups rows into workouts → exercises → sets and maps set types and cardio', () => {
    const [w, ...rest] = parseHevy(
      HEAD +
        `${L}"Squat (Barbell)",,"note",1,"dropset",50,8,,,\n` +
        `${L}"Squat (Barbell)",,"note",0,"warmup",20,12,,,\n` +
        `${L}"Treadmill",,"",0,"normal",,,3,1800,\n` +
        `${L}"Plank",,"",0,"normal",,,,,\n`,
    );
    expect(rest).toEqual([]);
    expect(w).toMatchObject({ title: 'Leg day 💪', date: '2026-11-17', notes: 'go' });
    expect(w!.exercises.map((e) => e.name)).toEqual(['Squat (Barbell)', 'Treadmill']); // empty Plank dropped
    expect(w!.exercises[0]!.sets.map((s) => [s.setType, s.weightKg, s.reps])).toEqual([
      ['warmup', 20, 12], // sorted by set_index
      ['drop', 50, 8],
    ]);
    expect(w!.exercises[1]!.sets[0]).toEqual({ setType: 'normal', weightKg: 0, reps: 1800, speedKmh: 6 });
  });

  it('accepts a BOM-prefixed file', () => {
    expect(parseHevy(`${String.fromCharCode(0xfeff)}${HEAD}${L}"Squat",,"",0,"normal",50,8,,,\n`)).toHaveLength(1);
  });

  it('rejects other CSVs', () => {
    expect(() => parseHevy('a,b\n1,2')).toThrow(/not a Hevy/);
  });

  it('guesses muscle group and equipment', () => {
    expect(guessExercise('Bicep Curl (Machine)')).toEqual({ muscleGroup: 'biceps', equipment: 'machine' });
    expect(guessExercise('Lying Leg Curl (Machine)').muscleGroup).toBe('legs');
    expect(guessExercise('Triceps Rope Pushdown')).toEqual({ muscleGroup: 'triceps', equipment: 'cable' });
  });
});
