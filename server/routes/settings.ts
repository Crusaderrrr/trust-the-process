import { z } from 'zod';
import type { Sql } from '../db.js';
import { parseBody, privateRouter, userId } from './util.js';

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
