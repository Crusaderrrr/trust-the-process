import path from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import type { AuthEnv } from './auth.js';
import type { Sql } from './db.js';
import { authRoutes } from './routes/auth.js';
import { exerciseRoutes } from './routes/exercises.js';
import { inviteRoutes } from './routes/invites.js';
import { pushRoutes } from './routes/push.js';
import { createPush, type Push } from './push.js';
import { settingsRoutes, skipRoutes } from './routes/planning.js';
import { historyRoutes, progressRoutes, workoutRoutes } from './routes/workouts.js';

export function createApp(sql: Sql, staticDir: string, push: Push = createPush(sql)): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  app.use(
    secureHeaders({
      xFrameOptions: 'DENY',
      // 'wasm-unsafe-eval' is for sqlite-wasm (the v1 data layer, until the API replaces it);
      // 'unsafe-inline' styles because React sets style attributes. Nothing loads from other origins.
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        workerSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    }),
  );

  // Exercise photos are the largest legitimate body.
  app.use('/api/*', bodyLimit({ maxSize: 2 * 1024 * 1024, onError: (c) => c.json({ error: 'too_large' }, 413) }));
  // Cross-site forms can't send application/json, and a cross-site fetch that does needs a CORS
  // preflight we never grant: the CSRF defence on top of SameSite=Lax.
  app.use('/api/*', async (c, next) => {
    const safe = ['GET', 'HEAD', 'OPTIONS'].includes(c.req.method);
    if (!safe && !c.req.header('content-type')?.startsWith('application/json')) {
      return c.json({ error: 'unsupported_media_type' }, 415);
    }
    await next();
  });

  app.get('/api/health', async (c) => {
    try {
      await sql`SELECT 1`;
      return c.json({ ok: true });
    } catch {
      return c.json({ ok: false }, 503);
    }
  });
  app.route('/api/auth', authRoutes(sql));
  app.route('/api/invites', inviteRoutes(sql));
  app.route('/api/exercises', exerciseRoutes(sql));
  app.route('/api/settings', settingsRoutes(sql));
  app.route('/api/skips', skipRoutes(sql));
  app.route('/api/workouts', workoutRoutes(sql, push));
  app.route('/api/push', pushRoutes(sql, push));
  app.route('/api/history', historyRoutes(sql));
  app.route('/api/progress', progressRoutes(sql));
  app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));

  // Hashed build assets never change; everything else (index.html, sw.js, manifest) must revalidate
  // or the PWA update check would be served stale.
  app.use('*', async (c, next) => {
    await next();
    if (c.res.ok) {
      c.header('Cache-Control', c.req.path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
    }
  });
  // serveStatic wants a root relative to the working directory.
  app.use('*', serveStatic({ root: path.relative(process.cwd(), staticDir) || '.' }));
  // HashRouter: every client route is "/", so there is no SPA fallback to configure.
  return app;
}
