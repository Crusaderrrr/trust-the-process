import { z } from 'zod';
import type { Sql } from '../db.js';
import type { Push } from '../push.js';
import { previousSets, type SetValuesJson } from '../previous.js';
import { DATE_RE, FEELINGS, GRIPS, isUniqueViolation, iso, parseBody, privateRouter, RATINGS, SET_TYPES, userId } from './util.js';

// A workout travels as one document: the workout, its exercises, their sets. The client edits the
// document locally and saves it whole with PUT (MIGRATION.md §7); ids are client-generated UUIDs.

const setSchema = z
  .object({
    id: z.uuid(),
    position: z.number().int().min(0).max(1000),
    setType: z.enum(SET_TYPES),
    weightKg: z.number().min(0).max(100_000).nullable(),
    // Cardio stores its duration in seconds here.
    reps: z.number().int().min(1).max(1_000_000).nullable(),
    speedKmh: z.number().min(0).max(1000).nullable(),
    inclinePct: z.number().min(0).max(1000).nullable(),
    completed: z.number().int().min(0).max(1),
    autoFill: z.number().int().min(0).max(3),
  })
  .refine((s) => !s.completed || (s.weightKg !== null && s.reps !== null), {
    message: 'A completed set needs weight and reps',
  });

const exerciseSchema = z.object({
  id: z.uuid(),
  exerciseId: z.number().int().positive(),
  position: z.number().int().min(0).max(1000),
  grip: z.enum(GRIPS).nullable(),
  note: z.string().max(500).nullable(),
  sets: z.array(setSchema).max(200),
});

const workoutSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(200),
  date: z.string().regex(DATE_RE),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  notes: z.string().max(5000).nullable(),
  restEndsAt: z.iso.datetime().nullable(),
  // Defaults let a copy saved locally before the check-in existed still sync.
  rating: z.enum(RATINGS).nullable().default(null),
  feelings: z.array(z.enum(FEELINGS)).max(FEELINGS.length).default([]),
  templateId: z.string().max(50).nullable().default(null),
  exercises: z.array(exerciseSchema).max(100),
});
type WorkoutBody = z.infer<typeof workoutSchema>;

type WorkoutRow = {
  id: string;
  title: string;
  date: string;
  started_at: Date;
  finished_at: Date | null;
  notes: string | null;
  rest_ends_at: Date | null;
  rating: string | null;
  feelings: string[];
  template_id: string | null;
};

async function loadWorkout(sql: Sql, uid: number, id: string) {
  const [w] = await sql<WorkoutRow[]>`
    SELECT id, title, date, started_at, finished_at, notes, rest_ends_at, rating, feelings, template_id
    FROM workout WHERE id = ${id} AND user_id = ${uid}`;
  if (!w) return null;

  const exercises = await sql<
    {
      id: string;
      exercise_id: string;
      name: string;
      muscle_group: string;
      image: string | null;
      rest_seconds: number;
      rest_custom: boolean;
      grip_set: string | null;
      is_cardio: boolean;
      grip: string | null;
      note: string | null;
      position: number;
    }[]
  >`
    SELECT we.id, we.exercise_id, e.name, e.muscle_group, e.image, e.rest_seconds, e.rest_custom,
           e.grip_set, e.is_cardio, we.grip, we.note, we.position
    FROM workout_exercise we JOIN exercise e ON e.id = we.exercise_id
    WHERE we.workout_id = ${id} ORDER BY we.position, we.id`;
  const sets = await sql<
    {
      id: string;
      workout_exercise_id: string;
      position: number;
      set_type: string;
      weight_kg: number | null;
      reps: number | null;
      speed_kmh: number | null;
      incline_pct: number | null;
      completed: boolean;
      auto_fill: number;
    }[]
  >`
    SELECT s.id, s.workout_exercise_id, s.position, s.set_type, s.weight_kg, s.reps, s.speed_kmh,
           s.incline_pct, s.completed, s.auto_fill
    FROM workout_set s JOIN workout_exercise we ON we.id = s.workout_exercise_id
    WHERE we.workout_id = ${id} ORDER BY s.position, s.id`;

  const before = { date: w.date, startedAt: w.started_at.toISOString(), excludeWorkoutId: id };
  // One lookup per distinct (exercise, grip), shared by duplicates of the same exercise.
  const previous = new Map<string, Promise<SetValuesJson[]>>();
  const previousFor = (exerciseId: string, grip: string | null) => {
    const key = `${exerciseId}|${grip}`;
    if (!previous.has(key)) previous.set(key, previousSets(sql, uid, Number(exerciseId), grip, before));
    return previous.get(key)!;
  };

  return {
    id: w.id,
    title: w.title,
    date: w.date,
    startedAt: w.started_at.toISOString(),
    finishedAt: iso(w.finished_at),
    notes: w.notes,
    restEndsAt: iso(w.rest_ends_at),
    rating: w.rating,
    feelings: w.feelings,
    templateId: w.template_id,
    exercises: await Promise.all(
      exercises.map(async (e) => ({
        id: e.id,
        exerciseId: Number(e.exercise_id),
        name: e.name,
        muscleGroup: e.muscle_group,
        image: e.image,
        restSeconds: e.rest_seconds,
        restCustom: +e.rest_custom,
        gripSet: e.grip_set,
        isCardio: +e.is_cardio,
        grip: e.grip,
        note: e.note,
        position: e.position,
        sets: sets
          .filter((s) => s.workout_exercise_id === e.id)
          .map((s) => ({
            id: s.id,
            position: s.position,
            setType: s.set_type,
            weightKg: s.weight_kg,
            reps: s.reps,
            speedKmh: s.speed_kmh,
            inclinePct: s.incline_pct,
            completed: +s.completed,
            autoFill: s.auto_fill,
          })),
        previous: await previousFor(e.exercise_id, e.grip),
      })),
    ),
  };
}

/** Replaces the stored workout with the document. Returns false if the id belongs to someone else. */
async function saveWorkout(sql: Sql, uid: number, w: WorkoutBody): Promise<'ok' | 'foreign' | 'unknown_exercise'> {
  return sql.begin(async (tx) => {
    const existing = await tx<{ user_id: string }[]>`SELECT user_id FROM workout WHERE id = ${w.id}`;
    if (existing[0] && Number(existing[0].user_id) !== uid) return 'foreign';

    const wanted = [...new Set(w.exercises.map((e) => e.exerciseId))];
    if (wanted.length) {
      const owned = await tx`SELECT id FROM exercise WHERE user_id = ${uid} AND id IN ${tx(wanted)}`;
      if (owned.length !== wanted.length) return 'unknown_exercise';
    }

    await tx`
      INSERT INTO workout (id, user_id, title, date, started_at, finished_at, notes, rest_ends_at, rating, feelings, template_id)
      VALUES (${w.id}, ${uid}, ${w.title}, ${w.date}, ${w.startedAt}, ${w.finishedAt}, ${w.notes}, ${w.restEndsAt},
              ${w.rating}, ${tx.array(w.feelings, 1009 /* text[] */)}, ${w.templateId})
      ON CONFLICT (id) DO UPDATE SET title = excluded.title, date = excluded.date, started_at = excluded.started_at,
        finished_at = excluded.finished_at, notes = excluded.notes, rest_ends_at = excluded.rest_ends_at,
        rating = excluded.rating, feelings = excluded.feelings, template_id = excluded.template_id`;
    // Starting or logging a workout on a day marked as skipped lifts the skip.
    if (!existing[0]) await tx`DELETE FROM skip WHERE user_id = ${uid} AND date = ${w.date}`;

    await tx`DELETE FROM workout_exercise WHERE workout_id = ${w.id}`; // cascades to sets
    if (w.exercises.length) {
      await tx`INSERT INTO workout_exercise ${tx(
        w.exercises.map((e) => ({
          id: e.id,
          workout_id: w.id,
          exercise_id: e.exerciseId,
          position: e.position,
          grip: e.grip,
          note: e.note,
        })),
      )}`;
    }
    const sets = w.exercises.flatMap((e) =>
      e.sets.map((s) => ({
        id: s.id,
        workout_exercise_id: e.id,
        position: s.position,
        set_type: s.setType,
        weight_kg: s.weightKg,
        reps: s.reps,
        speed_kmh: s.speedKmh,
        incline_pct: s.inclinePct,
        completed: s.completed === 1,
        auto_fill: s.autoFill,
      })),
    );
    if (sets.length) await tx`INSERT INTO workout_set ${tx(sets)}`;
    return 'ok';
  });
}

const idParam = z.uuid();

export function workoutRoutes(sql: Sql, push: Push) {
  const app = privateRouter(sql);

  /** Finished workouts in a date range (for the calendar), with their per-exercise notes. */
  app.get('/', async (c) => {
    const q = z.object({ from: z.string().regex(DATE_RE), to: z.string().regex(DATE_RE) }).safeParse(c.req.query());
    if (!q.success) return c.json({ error: 'invalid_input', message: 'from and to are required.' }, 400);
    const uid = userId(c);
    const workouts = await sql<{ id: string; title: string; date: string; rating: string | null }[]>`
      SELECT id, title, date, rating FROM workout
      WHERE user_id = ${uid} AND finished_at IS NOT NULL AND date BETWEEN ${q.data.from} AND ${q.data.to}
      ORDER BY date, started_at`;
    const notes = await sql<{ workout_id: string; name: string; note: string }[]>`
      SELECT we.workout_id, e.name, we.note
      FROM workout_exercise we JOIN exercise e ON e.id = we.exercise_id JOIN workout w ON w.id = we.workout_id
      WHERE w.user_id = ${uid} AND we.note IS NOT NULL AND w.finished_at IS NOT NULL
        AND w.date BETWEEN ${q.data.from} AND ${q.data.to}
      ORDER BY we.position, we.id`;
    return c.json(
      workouts.map((w) => ({
        ...w,
        notes: notes.filter((n) => n.workout_id === w.id).map((n) => ({ workoutId: n.workout_id, name: n.name, note: n.note })),
      })),
    );
  });

  app.get('/active', async (c) => {
    const rows = await sql<{ id: string }[]>`
      SELECT id FROM workout WHERE user_id = ${userId(c)} AND finished_at IS NULL`;
    return c.json({ workout: rows[0] ? await loadWorkout(sql, userId(c), rows[0].id) : null });
  });

  app.get('/:id', async (c) => {
    const id = idParam.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'not_found' }, 404);
    const workout = await loadWorkout(sql, userId(c), id.data);
    return workout ? c.json({ workout }) : c.json({ error: 'not_found' }, 404);
  });

  app.put('/:id', async (c) => {
    const { data, error } = await parseBody(c, workoutSchema);
    if (error) return error;
    if (data.id !== c.req.param('id')) return c.json({ error: 'invalid_input', message: 'Id mismatch.' }, 400);
    try {
      const result = await saveWorkout(sql, userId(c), data);
      if (result === 'foreign') return c.json({ error: 'not_found' }, 404);
      if (result === 'unknown_exercise') return c.json({ error: 'invalid_input', message: 'Unknown exercise.' }, 400);
      // "Time's up" push at the end of the rest; a finished workout or a cleared rest cancels it.
      push.schedule(data.id, data.finishedAt || !data.restEndsAt ? null : new Date(data.restEndsAt));
      return c.json({ ok: true });
    } catch (e) {
      if (isUniqueViolation(e, 'workout_one_active_idx')) {
        return c.json({ error: 'active_exists', message: 'A workout is already in progress.' }, 409);
      }
      if (isUniqueViolation(e)) return c.json({ error: 'conflict', message: 'Duplicate id in workout.' }, 409);
      throw e;
    }
  });

  app.delete('/:id', async (c) => {
    const id = idParam.safeParse(c.req.param('id'));
    if (id.success) {
      await sql`DELETE FROM workout WHERE id = ${id.data} AND user_id = ${userId(c)}`;
      push.schedule(id.data, null);
    }
    return c.json({ ok: true });
  });

  return app;
}

export function historyRoutes(sql: Sql) {
  const app = privateRouter(sql);

  app.get('/', async (c) => {
    const uid = userId(c);
    const workouts = await sql<WorkoutRow[]>`
      SELECT id, title, date, started_at, finished_at, notes, rest_ends_at, rating, feelings, template_id FROM workout
      WHERE user_id = ${uid} AND finished_at IS NOT NULL ORDER BY date DESC, started_at DESC`;
    const rows = await sql<{ workout_id: string; name: string; grip: string | null; sets: string; volume: number }[]>`
      SELECT we.workout_id, e.name, we.grip, COUNT(s.id) AS sets,
             COALESCE(SUM(CASE WHEN s.set_type <> 'warmup' THEN s.weight_kg * s.reps END), 0) AS volume
      FROM workout_exercise we
      JOIN exercise e ON e.id = we.exercise_id
      JOIN workout w ON w.id = we.workout_id AND w.finished_at IS NOT NULL AND w.user_id = ${uid}
      LEFT JOIN workout_set s ON s.workout_exercise_id = we.id AND s.completed
      GROUP BY we.id, e.name ORDER BY we.position, we.id`;
    return c.json(
      workouts.map((w) => {
        const mine = rows.filter((r) => r.workout_id === w.id);
        return {
          id: w.id,
          title: w.title,
          date: w.date,
          startedAt: w.started_at.toISOString(),
          finishedAt: iso(w.finished_at),
          notes: w.notes,
          restEndsAt: iso(w.rest_ends_at),
          rating: w.rating,
          feelings: w.feelings,
          templateId: w.template_id,
          exercises: mine.map((r) => ({ name: r.name, sets: Number(r.sets), grip: r.grip })),
          volume: mine.reduce((a, r) => a + r.volume, 0),
        };
      }),
    );
  });

  return app;
}

export function progressRoutes(sql: Sql) {
  const app = privateRouter(sql);

  /**
   * Completed sets of finished workouts as sessions, chronological, keyed by exercise id. A session
   * is one exercise in one workout with one grip. `includeWorkoutId` also counts an unfinished
   * workout (for PRs in the finish summary).
   */
  app.get('/sessions', async (c) => {
    const q = z
      .object({ exerciseId: z.coerce.number().int().positive().optional(), includeWorkoutId: z.uuid().optional() })
      .safeParse(c.req.query());
    if (!q.success) return c.json({ error: 'invalid_input', message: 'Invalid query.' }, 400);
    const rows = await sql<
      {
        exercise_id: string;
        workout_id: string;
        date: string;
        grip: string | null;
        weight_kg: number;
        reps: number;
        speed_kmh: number | null;
        incline_pct: number | null;
        set_type: string;
      }[]
    >`
      SELECT we.exercise_id, w.id AS workout_id, w.date, we.grip, s.weight_kg, s.reps, s.speed_kmh,
             s.incline_pct, s.set_type
      FROM workout_set s
      JOIN workout_exercise we ON we.id = s.workout_exercise_id
      JOIN workout w ON w.id = we.workout_id
      WHERE w.user_id = ${userId(c)} AND s.completed
        AND (w.finished_at IS NOT NULL OR w.id = ${q.data.includeWorkoutId ?? null}::uuid)
        AND (${q.data.exerciseId ?? null}::bigint IS NULL OR we.exercise_id = ${q.data.exerciseId ?? null}::bigint)
      ORDER BY w.date, w.started_at, w.id, we.grip, s.position, s.id`;

    type Session = {
      workoutId: string;
      date: string;
      grip: string | null;
      sets: { weightKg: number; reps: number; speedKmh: number | null; inclinePct: number | null; setType: string }[];
    };
    const byExercise: Record<string, Session[]> = {};
    for (const r of rows) {
      const sessions = (byExercise[r.exercise_id] ??= []);
      let last = sessions.at(-1);
      if (last?.workoutId !== r.workout_id || last.grip !== r.grip) {
        last = { workoutId: r.workout_id, date: r.date, grip: r.grip, sets: [] };
        sessions.push(last);
      }
      last.sets.push({
        weightKg: r.weight_kg,
        reps: r.reps,
        speedKmh: r.speed_kmh,
        inclinePct: r.incline_pct,
        setType: r.set_type,
      });
    }
    return c.json(byExercise);
  });

  return app;
}
