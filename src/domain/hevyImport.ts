import { toLocalDate } from './dates';
import type { Feeling, Rating } from './checkIn';
import type { Equipment, Grip, GripSet, MuscleGroup } from './exercises';
import type { SetType } from './sets';

// Hevy's "Export workout data" CSV: one row per set, columns
// title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,
// weight_kg,reps,distance_km,duration_seconds,rpe. Pure: parsing and guessing only, no API.

// These types are shared with the JSON import (dataExport.ts); the optional fields are only set there.
export type ImportSet = {
  setType: SetType;
  weightKg: number;
  reps: number;
  speedKmh: number | null;
  inclinePct?: number | null;
};
export type ImportExercise = {
  name: string;
  note: string | null;
  sets: ImportSet[];
  grip?: Grip | null;
  /** How to create the exercise when the library lacks it; otherwise guessed from the name. */
  meta?: {
    muscleGroup: MuscleGroup;
    equipment: Equipment;
    gripSet: GripSet | null;
  };
};
export type ImportWorkout = {
  /** Same Hevy workout → same key, so importing twice replaces instead of duplicating. */
  key: string;
  /** Keep this workout id (JSON round trip); otherwise one is derived from `key`. */
  id?: string;
  rating?: Rating | null;
  feelings?: Feeling[];
  templateId?: string | null;
  title: string;
  date: string;
  startedAt: string;
  finishedAt: string;
  notes: string | null;
  exercises: ImportExercise[];
};

/** RFC 4180: quoted fields may hold commas, doubled quotes and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (text[i + 1] === '"') field += text[i++];
      else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows.filter((r) => r.some((c) => c !== ''));
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "17 Nov 2026, 17:34" (local time) → Date; null when it doesn't look like that. */
export function parseHevyDate(s: string): Date | null {
  const m = /^(\d{1,2}) (\w{3}) (\d{4}), (\d{1,2}):(\d{2})$/.exec(s.trim());
  const month = m ? MONTHS.indexOf(m[2]!.toLowerCase()) : -1;
  return m && month >= 0 ? new Date(+m[3]!, month, +m[1]!, +m[4]!, +m[5]!) : null;
}

const SET_TYPE: Record<string, SetType> = {
  normal: 'normal',
  warmup: 'warmup',
  dropset: 'drop',
  failure: 'failure',
};
const num = (s: string | undefined): number | null => (s !== undefined && s.trim() !== '' && !isNaN(+s) ? +s : null);

/** Throws with a readable message when this isn't a Hevy export. */
export function parseHevy(text: string): ImportWorkout[] {
  const [head, ...rows] = parseCsv(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text); // strip a BOM
  const col = (name: string) => head?.indexOf(name) ?? -1;
  const need = ['title', 'start_time', 'end_time', 'exercise_title', 'set_index', 'set_type', 'weight_kg', 'reps'];
  if (!head || need.some((n) => col(n) < 0)) throw new Error('This is not a Hevy workout export (CSV).');
  const at = (r: string[], name: string) => r[col(name)] ?? '';

  const byWorkout = new Map<string, { w: ImportWorkout; sets: Map<string, { index: number; set: ImportSet }[]> }>();
  for (const r of rows) {
    const start = parseHevyDate(at(r, 'start_time'));
    if (!start) throw new Error(`Unreadable date "${at(r, 'start_time')}".`);
    const end = parseHevyDate(at(r, 'end_time'));
    const key = `${at(r, 'title')}|${at(r, 'start_time')}`;
    let entry = byWorkout.get(key);
    if (!entry) {
      const finished = end && end > start ? end : new Date(start.getTime() + 60 * 60 * 1000);
      entry = {
        w: {
          key,
          title: at(r, 'title').trim().slice(0, 200) || 'Workout',
          date: toLocalDate(start),
          startedAt: start.toISOString(),
          finishedAt: finished.toISOString(),
          notes: at(r, 'description').trim().slice(0, 5000) || null,
          exercises: [],
        },
        sets: new Map(),
      };
      byWorkout.set(key, entry);
    }
    const name = at(r, 'exercise_title').trim();
    if (!entry.sets.has(name)) {
      entry.sets.set(name, []);
      entry.w.exercises.push({
        name,
        note: at(r, 'exercise_notes').trim().slice(0, 500) || null,
        sets: [],
      });
    }
    // Cardio rows carry duration (and maybe distance) instead of weight/reps: duration goes in `reps`.
    const seconds = num(at(r, 'duration_seconds'));
    const km = num(at(r, 'distance_km'));
    const reps = num(at(r, 'reps')) ?? seconds;
    if (!reps || reps < 1) continue; // a set with nothing logged
    entry.sets.get(name)!.push({
      index: num(at(r, 'set_index')) ?? 0,
      set: {
        setType: SET_TYPE[at(r, 'set_type')] ?? 'normal',
        weightKg: num(at(r, 'weight_kg')) ?? 0,
        reps: Math.round(reps),
        speedKmh: seconds && km ? Math.round((km / (seconds / 3600)) * 10) / 10 : null,
      },
    });
  }
  return [...byWorkout.values()]
    .map(({ w, sets }) => ({
      ...w,
      exercises: w.exercises
        .map((e) => ({
          ...e,
          sets: sets
            .get(e.name)!
            .sort((a, b) => a.index - b.index)
            .map((s) => s.set),
        }))
        .filter((e) => e.sets.length > 0),
    }))
    .filter((w) => w.exercises.length > 0);
}

/** Best guess for an exercise the library doesn't have, from Hevy's name ("Bicep Curl (Machine)"). */
export function guessExercise(name: string): {
  muscleGroup: MuscleGroup;
  equipment: Equipment;
} {
  const n = name.toLowerCase();
  const has = (...words: string[]) => words.some((w) => n.includes(w));
  const equipment: Equipment = has('barbell')
    ? 'barbell'
    : has('dumbbell')
      ? 'dumbbell'
      : has('machine', 'pec deck')
        ? 'machine'
        : has('cable', 'pushdown', 'pressdown', 'pulldown')
          ? 'cable'
          : has('kettlebell')
            ? 'kettlebell'
            : 'other';
  const muscleGroup: MuscleGroup = has('treadmill', 'run', 'bike', 'cycling', 'elliptical')
    ? 'cardio'
    : has('tricep')
      ? 'triceps'
      : has('bicep', 'curl') && !has('leg curl')
        ? 'biceps'
        : has('lateral raise', 'front raise', 'shoulder', 'rear delt', 'overhead press')
          ? 'shoulders'
          : has('glute', 'hip ', 'hip thrust')
            ? 'glutes'
            : has('leg', 'squat', 'calf', 'lunge')
              ? 'legs'
              : has('row', 'pulldown', 'pull up', 'pull-up', 'deadlift', 'lat ')
                ? 'back'
                : has('bench', 'chest', 'fly', 'pec', 'push up', 'push-up', 'dip')
                  ? 'chest'
                  : has('crunch', 'plank', 'abs', 'sit up')
                    ? 'core'
                    : 'full_body';
  return { muscleGroup, equipment };
}
