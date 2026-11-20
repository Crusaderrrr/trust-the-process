import { describe, expect, it } from 'vitest';
import { guessExercise, HEVY_ALIASES, HEVY_RENAMED, importGrip, parseCsv, parseHevy, parseHevyDate } from './hevyImport';

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
    expect(w!.exercises.map((e) => e.name)).toEqual(['Back Squat', 'Treadmill']); // empty Plank dropped
    expect(w!.exercises[0]!.sets.map((s) => [s.setType, s.weightKg, s.reps])).toEqual([
      ['warmup', 20, 12], // sorted by set_index
      ['drop', 50, 8],
    ]);
    expect(w!.exercises[1]!.sets[0]).toEqual({ setType: 'normal', weightKg: 0, reps: 1800, speedKmh: 6 });
  });

  it('accepts a BOM-prefixed file', () => {
    expect(parseHevy(`${String.fromCharCode(0xfeff)}${HEAD}${L}"Squat",,"",0,"normal",50,8,,,\n`)).toHaveLength(1);
  });

  it('files Hevy variants under our exercises, with the matching grip', () => {
    const [w] = parseHevy(
      HEAD +
        `${L}"Triceps Rope Pushdown",,"",0,"normal",20,10,,,
` +
        `${L}"Triceps Pressdown",,"",0,"normal",25,10,,,
` +
        `${L}"Butterfly (Pec Deck)",,"",0,"normal",40,10,,,
` +
        `${L}"Chest Fly (Machine)",,"",0,"normal",40,10,,,
`,
    );
    expect(w!.exercises.map((e) => [e.name, e.grip])).toEqual([
      ['Triceps Pushdown', 'rope'],
      ['Triceps Pushdown', 'straight_bar'],
      ['Butterfly', undefined],
      ['Butterfly', undefined],
    ]);
  });

  it('picks a grip the exercise offers, else its default', () => {
    expect(importGrip('back', 'wide')).toBe('wide');
    expect(importGrip('back', undefined)).toBe('normal');
    expect(importGrip('triceps', 'wide')).toBe('rope'); // not a triceps grip
    expect(importGrip(null, 'wide')).toBeNull();
  });

  it('only lists renames, and aliases are keyed in lower case', () => {
    expect(HEVY_RENAMED).toContain('butterfly (pec deck)');
    expect(HEVY_RENAMED).not.toContain('triceps pushdown'); // keeps its own name, only gains a grip
    expect(Object.keys(HEVY_ALIASES).every((k) => k === k.toLowerCase())).toBe(true);
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
