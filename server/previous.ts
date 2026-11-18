import type { Sql } from './db.js';

export type SetValuesJson = {
  weightKg: number | null;
  reps: number | null;
  speedKmh: number | null;
  inclinePct: number | null;
  setType: string;
};

type Row = {
  weight_kg: number | null;
  reps: number | null;
  speed_kmh: number | null;
  incline_pct: number | null;
  set_type: string;
};

/**
 * The "Previous" column: completed sets of the matching exercise in the latest finished workout
 * that started before `before`. The same grip wins; history logged without a grip is the fallback.
 */
export async function previousSets(
  sql: Sql,
  userId: number,
  exerciseId: number,
  grip: string | null,
  before: { date: string; startedAt: string; excludeWorkoutId: string | null },
): Promise<SetValuesJson[]> {
  return (await previousSetsMany(sql, userId, [{ exerciseId, grip }], before)).get(previousKey(exerciseId, grip)) ?? [];
}

export const previousKey = (exerciseId: number, grip: string | null) => `${exerciseId}|${grip}`;

/** `previousSets` for several (exercise, grip) pairs in one round trip; keyed by `previousKey`. */
export async function previousSetsMany(
  sql: Sql,
  userId: number,
  pairs: { exerciseId: number; grip: string | null }[],
  before: { date: string; startedAt: string; excludeWorkoutId: string | null },
): Promise<Map<string, SetValuesJson[]>> {
  const out = new Map<string, SetValuesJson[]>();
  if (!pairs.length) return out;
  const rows = await sql<(Row & { exercise_id: string; pair_grip: string | null })[]>`
    SELECT p.exercise_id, p.grip AS pair_grip, s.weight_kg, s.reps, s.speed_kmh, s.incline_pct, s.set_type
    FROM unnest(${sql.array(pairs.map((p) => p.exerciseId), 20 /* int8[] */)}::bigint[],
                ${sql.array(pairs.map((p) => p.grip), 1009 /* text[] */)}::text[]) AS p(exercise_id, grip)
    CROSS JOIN LATERAL (
      SELECT we.id FROM workout_exercise we JOIN workout w ON w.id = we.workout_id
      WHERE w.user_id = ${userId} AND we.exercise_id = p.exercise_id
        AND (p.grip IS NULL OR we.grip IS NOT DISTINCT FROM p.grip OR we.grip IS NULL)
        AND w.finished_at IS NOT NULL
        AND EXISTS (SELECT 1 FROM workout_set s2 WHERE s2.workout_exercise_id = we.id AND s2.completed)
        AND (${before.excludeWorkoutId}::uuid IS NULL OR w.id <> ${before.excludeWorkoutId}::uuid)
        AND (w.date, w.started_at) < (${before.date}::text, ${before.startedAt}::timestamptz)
      ORDER BY (we.grip IS NOT DISTINCT FROM p.grip) DESC, w.date DESC, w.started_at DESC, we.position
      LIMIT 1) pick
    JOIN workout_set s ON s.workout_exercise_id = pick.id AND s.completed
    ORDER BY p.exercise_id, p.grip, s.position, s.id`;
  for (const r of rows) {
    const key = previousKey(Number(r.exercise_id), r.pair_grip);
    const list = out.get(key) ?? [];
    list.push({ weightKg: r.weight_kg, reps: r.reps, speedKmh: r.speed_kmh, inclinePct: r.incline_pct, setType: r.set_type });
    out.set(key, list);
  }
  return out;
}

export type LastSetsJson = {
  exerciseId: number;
  grip: string | null;
  date: string;
  startedAt: string;
  sets: SetValuesJson[];
};

/**
 * For the phone's offline copy of the "Previous" column: the completed sets of the latest finished
 * workout for every exercise and grip the account has logged.
 */
export async function lastSets(sql: Sql, userId: number): Promise<LastSetsJson[]> {
  const rows = await sql<(Row & { id: string; exercise_id: string; grip: string | null; date: string; started_at: Date })[]>`
    WITH latest AS (
      SELECT DISTINCT ON (we.exercise_id, we.grip) we.id, we.exercise_id, we.grip, w.date, w.started_at
      FROM workout_exercise we JOIN workout w ON w.id = we.workout_id
      WHERE w.user_id = ${userId} AND w.finished_at IS NOT NULL
        AND EXISTS (SELECT 1 FROM workout_set s WHERE s.workout_exercise_id = we.id AND s.completed)
      ORDER BY we.exercise_id, we.grip, w.date DESC, w.started_at DESC, we.position
    )
    SELECT l.id, l.exercise_id, l.grip, l.date, l.started_at, s.weight_kg, s.reps, s.speed_kmh, s.incline_pct, s.set_type
    FROM latest l JOIN workout_set s ON s.workout_exercise_id = l.id AND s.completed
    ORDER BY l.id, s.position, s.id`;
  const byEntry = new Map<string, LastSetsJson>();
  for (const r of rows) {
    let entry = byEntry.get(r.id);
    if (!entry) {
      entry = { exerciseId: Number(r.exercise_id), grip: r.grip, date: r.date, startedAt: r.started_at.toISOString(), sets: [] };
      byEntry.set(r.id, entry);
    }
    entry.sets.push({
      weightKg: r.weight_kg,
      reps: r.reps,
      speedKmh: r.speed_kmh,
      inclinePct: r.incline_pct,
      setType: r.set_type,
    });
  }
  return [...byEntry.values()];
}
