import { z } from 'zod';
import type { Sql } from '../db.js';
import { DATE_RE, parseBody, privateRouter, RATINGS, SKIP_REASONS, userId } from './util.js';

const dateParam = z.string().regex(DATE_RE);

/** Days marked as skipped, with a reason. */
export function skipRoutes(sql: Sql) {
  const app = privateRouter(sql);

  app.get('/', async (c) => {
    const q = z.object({ from: dateParam, to: dateParam }).safeParse(c.req.query());
    if (!q.success) return c.json({ error: 'invalid_input', message: 'from and to are required.' }, 400);
    const rows = await sql<{ date: string; reason: string; note: string | null; rating: string | null }[]>`
      SELECT date, reason, note, rating FROM skip WHERE user_id = ${userId(c)} AND date BETWEEN ${q.data.from} AND ${q.data.to}`;
    return c.json(rows);
  });

  app.put('/:date', async (c) => {
    const date = dateParam.safeParse(c.req.param('date'));
    const { data, error } = await parseBody(
      c,
      z.object({
        reason: z.enum(SKIP_REASONS),
        note: z.string().max(500).nullable(),
        rating: z.enum(RATINGS).nullable().default(null),
      }),
    );
    if (!date.success) return c.json({ error: 'invalid_input', message: 'Bad date.' }, 400);
    if (error) return error;
    await sql`
      INSERT INTO skip (user_id, date, reason, note, rating)
      VALUES (${userId(c)}, ${date.data}, ${data.reason}, ${data.note}, ${data.rating})
      ON CONFLICT (user_id, date) DO UPDATE SET reason = excluded.reason, note = excluded.note, rating = excluded.rating`;
    return c.json({ ok: true });
  });

  app.delete('/:date', async (c) => {
    await sql`DELETE FROM skip WHERE user_id = ${userId(c)} AND date = ${c.req.param('date')}`;
    return c.json({ ok: true });
  });

  return app;
}

export function settingsRoutes(sql: Sql) {
  const app = privateRouter(sql);

  app.get('/', async (c) => {
    const rows = await sql<{ default_rest_seconds: number }[]>`
      SELECT default_rest_seconds FROM user_settings WHERE user_id = ${userId(c)}`;
    return c.json({ defaultRestSeconds: rows[0]?.default_rest_seconds ?? 120 });
  });

  /** Saves the default and applies it to every exercise whose rest wasn't set in a workout. */
  app.put('/', async (c) => {
    const { data, error } = await parseBody(c, z.object({ defaultRestSeconds: z.number().int().min(0).max(3600) }));
    if (error) return error;
    const uid = userId(c);
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO user_settings (user_id, default_rest_seconds) VALUES (${uid}, ${data.defaultRestSeconds})
        ON CONFLICT (user_id) DO UPDATE SET default_rest_seconds = excluded.default_rest_seconds`;
      await tx`UPDATE exercise SET rest_seconds = ${data.defaultRestSeconds} WHERE user_id = ${uid} AND NOT rest_custom`;
    });
    return c.json({ ok: true });
  });

  /** Colour per template id (only the ones the user changed; the client has defaults). */
  app.get('/template-colors', async (c) => {
    const rows = await sql<{ template_colors: Record<string, string> }[]>`
      SELECT template_colors FROM user_settings WHERE user_id = ${userId(c)}`;
    return c.json(rows[0]?.template_colors ?? {});
  });

  app.put('/template-colors/:id', async (c) => {
    const id = z.string().min(1).max(50).safeParse(c.req.param('id'));
    const { data, error } = await parseBody(c, z.object({ color: z.string().regex(/^#[0-9a-f]{6}$/) }));
    if (error) return error;
    if (!id.success) return c.json({ error: 'invalid_input', message: 'Invalid template.' }, 400);
    await sql`
      INSERT INTO user_settings (user_id, template_colors) VALUES (${userId(c)}, ${sql.json({ [id.data]: data.color })})
      ON CONFLICT (user_id) DO UPDATE SET template_colors = user_settings.template_colors || excluded.template_colors`;
    return c.json({ ok: true });
  });

  return app;
}
