import { z } from 'zod';
import type { Sql } from '../db.js';
import { lastSets, previousSets } from '../previous.js';
import { DATE_RE, EQUIPMENT, GRIP_SETS, GRIPS, isUniqueViolation, MUSCLE_GROUPS, parseBody, privateRouter, userId } from './util.js';

type ExerciseRow = {
  id: string;
  name: string;
  muscle_group: string;
  equipment: string;
  is_custom: boolean;
  archived: boolean;
  rest_seconds: number;
  rest_custom: boolean;
  favorite: boolean;
  image: string | null;
  grip_set: string | null;
  is_cardio: boolean;
  last_grip: string | null;
};

const COLS = `id, name, muscle_group, equipment, is_custom, archived, rest_seconds, rest_custom, favorite, image,
  grip_set, is_cardio,
  CASE WHEN exercise.grip_set IS NOT NULL THEN (
    SELECT we.grip FROM workout_exercise we JOIN workout w ON w.id = we.workout_id
    WHERE we.exercise_id = exercise.id AND we.grip IS NOT NULL ORDER BY w.started_at DESC, we.position DESC LIMIT 1
  ) END AS last_grip`;

// Flags go out as 0 / 1, the shape the app has always used for them.
export const exerciseJson = (r: ExerciseRow) => ({
  id: Number(r.id),
  name: r.name,
  muscleGroup: r.muscle_group,
  equipment: r.equipment,
  isCustom: +r.is_custom,
  archived: +r.archived,
  restSeconds: r.rest_seconds,
  restCustom: +r.rest_custom,
  favorite: +r.favorite,
  image: r.image,
  gripSet: r.grip_set,
  isCardio: +r.is_cardio,
  lastGrip: r.last_grip,
});

const createBody = z.object({
  name: z.string().trim().min(1).max(80),
  muscleGroup: z.enum(MUSCLE_GROUPS),
  equipment: z.enum(EQUIPMENT),
  image: z.string().startsWith('data:image/').nullable(),
  gripSet: z.enum(GRIP_SETS).nullable(),
});

const patchBody = z.object({
  favorite: z.boolean().optional(),
  gripSet: z.enum(GRIP_SETS).nullable().optional(),
  archived: z.boolean().optional(),
  image: z.string().startsWith('data:image/').nullable().optional(),
  // A number pins the rest for this exercise; null makes it follow the default again.
  restSeconds: z.number().int().min(0).max(3600).nullable().optional(),
});

const previousQuery = z.object({
  grip: z.enum(GRIPS).optional(),
  date: z.string().regex(DATE_RE),
  startedAt: z.iso.datetime(),
  excludeWorkoutId: z.uuid().optional(),
});

export function exerciseRoutes(sql: Sql) {
  const app = privateRouter(sql);

  app.get('/', async (c) => {
    const rows = await sql<ExerciseRow[]>`
      SELECT ${sql.unsafe(COLS)} FROM exercise
      WHERE user_id = ${userId(c)} AND archived = ${c.req.query('archived') === '1'}
      ORDER BY lower(name)`;
    return c.json(rows.map(exerciseJson));
  });

  /** Latest sets per exercise and grip, so the phone can show "Previous" offline. */
  app.get('/last-sets', async (c) => c.json(await lastSets(sql, userId(c))));

  app.post('/', async (c) => {
    const { data, error } = await parseBody(c, createBody);
    if (error) return error;
    // The Cardio category makes an exercise time-based (time / speed / incline sets, no rest timer).
    const cardio = data.muscleGroup === 'cardio';
    try {
      const rows = await sql<ExerciseRow[]>`
        INSERT INTO exercise (user_id, name, muscle_group, equipment, is_custom, image, grip_set, is_cardio,
                              rest_seconds, rest_custom)
        VALUES (${userId(c)}, ${data.name}, ${data.muscleGroup}, ${data.equipment}, true, ${data.image},
                ${cardio ? null : data.gripSet}, ${cardio},
                ${cardio ? 0 : sql`COALESCE((SELECT default_rest_seconds FROM user_settings WHERE user_id = ${userId(c)}), 120)`},
                ${cardio})
        RETURNING ${sql.unsafe(COLS)}`;
      return c.json(exerciseJson(rows[0]!), 201);
    } catch (e) {
      if (isUniqueViolation(e)) {
        return c.json({ error: 'duplicate', message: `"${data.name}" already exists (it may be archived).` }, 409);
      }
      throw e;
    }
  });

  app.get('/:id{[0-9]+}', async (c) => {
    const rows = await sql<ExerciseRow[]>`
      SELECT ${sql.unsafe(COLS)} FROM exercise WHERE id = ${c.req.param('id')} AND user_id = ${userId(c)}`;
    return rows[0] ? c.json(exerciseJson(rows[0])) : c.json({ error: 'not_found' }, 404);
  });

  app.patch('/:id{[0-9]+}', async (c) => {
    const { data, error } = await parseBody(c, patchBody);
    if (error) return error;
    const id = c.req.param('id');
    const uid = userId(c);
    const found = await sql.begin(async (tx) => {
      const own = await tx`SELECT 1 FROM exercise WHERE id = ${id} AND user_id = ${uid} FOR UPDATE`;
      if (!own.length) return false;
      const plain = {
        ...(data.favorite !== undefined && { favorite: data.favorite }),
        ...(data.gripSet !== undefined && { grip_set: data.gripSet }),
        ...(data.archived !== undefined && { archived: data.archived }),
        ...(data.image !== undefined && { image: data.image }),
      };
      if (Object.keys(plain).length) await tx`UPDATE exercise SET ${tx(plain)} WHERE id = ${id}`;
      if (typeof data.restSeconds === 'number') {
        await tx`UPDATE exercise SET rest_seconds = ${data.restSeconds}, rest_custom = true WHERE id = ${id}`;
      } else if (data.restSeconds === null) {
        await tx`UPDATE exercise SET rest_custom = false,
                   rest_seconds = COALESCE((SELECT default_rest_seconds FROM user_settings WHERE user_id = ${uid}), 120)
                 WHERE id = ${id}`;
      }
      return true;
    });
    if (!found) return c.json({ error: 'not_found' }, 404);
    const rows = await sql<ExerciseRow[]>`SELECT ${sql.unsafe(COLS)} FROM exercise WHERE id = ${id}`;
    return c.json(exerciseJson(rows[0]!));
  });

  /** Custom exercises without history are deleted; anything with history is archived. */
  app.delete('/:id{[0-9]+}', async (c) => {
    const id = c.req.param('id');
    const uid = userId(c);
    const result = await sql.begin(async (tx) => {
      const rows = await tx<{ is_custom: boolean }[]>`
        SELECT is_custom FROM exercise WHERE id = ${id} AND user_id = ${uid} FOR UPDATE`;
      if (!rows[0]) return null;
      const used = await tx`SELECT 1 FROM workout_exercise WHERE exercise_id = ${id} LIMIT 1`;
      if (rows[0].is_custom && !used.length) {
        await tx`DELETE FROM exercise WHERE id = ${id}`;
        return 'deleted' as const;
      }
      await tx`UPDATE exercise SET archived = true WHERE id = ${id}`;
      return 'archived' as const;
    });
    return result ? c.json({ result }) : c.json({ error: 'not_found' }, 404);
  });

  /** Completed sets of the latest earlier finished workout with this exercise (and grip). */
  app.get('/:id{[0-9]+}/previous', async (c) => {
    const parsed = previousQuery.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'invalid_input', message: 'Invalid query.' }, 400);
    const q = parsed.data;
    const sets = await previousSets(sql, userId(c), Number(c.req.param('id')), q.grip ?? null, {
      date: q.date,
      startedAt: q.startedAt,
      excludeWorkoutId: q.excludeWorkoutId ?? null,
    });
    return c.json(sets);
  });

  return app;
}
