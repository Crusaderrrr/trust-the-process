import type { CatalogData } from '../catalog.js';
import type { Sql } from '../db.js';
import { SKIPPED_CATALOG_IDS } from '../seed.js';
import { privateRouter } from './util.js';

const RELATED = 8;

export function catalogRoutes(sql: Sql) {
  const app = privateRouter(sql);

  app.get('/images/:name{[a-z0-9-]+\\.webp}', async (c) => {
    const [image] = await sql<{ bytes: Buffer }[]>`SELECT bytes FROM catalog_image WHERE name = ${c.req.param('name')}`;
    if (!image) return c.json({ error: 'not_found' }, 404);
    return c.body(new Uint8Array(image.bytes), 200, {
      'Content-Type': 'image/webp',
      'Cache-Control': 'private, max-age=31536000, immutable',
    });
  });

  app.get('/:id{[a-z0-9-]+}', async (c) => {
    const id = c.req.param('id');
    const [entry] = await sql<{ data: CatalogData }[]>`SELECT data FROM catalog_exercise WHERE id = ${id}`;
    if (!entry) return c.json({ error: 'not_found' }, 404);
    // Same variation family; entries without one fall back to same muscle and equipment.
    const { variationGroup, primaryMuscles, equipment } = entry.data;
    const related = await sql<{ id: string }[]>`
      SELECT id FROM catalog_exercise
      WHERE id <> ${id} AND NOT (id = ANY(${[...SKIPPED_CATALOG_IDS]})) AND ${
        variationGroup
          ? sql`data->>'variationGroup' = ${variationGroup}`
          : sql`data->'primaryMuscles'->>0 = ${primaryMuscles[0] ?? ''}
                AND data->>'equipment' IS NOT DISTINCT FROM ${equipment}`
      }
      ORDER BY id LIMIT ${RELATED}`;
    return c.json({ ...entry.data, related: related.map((r) => r.id) });
  });

  return app;
}
