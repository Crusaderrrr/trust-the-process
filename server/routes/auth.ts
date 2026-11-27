import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod';
import {
  clearSessionCookie,
  clientIp,
  COOKIE,
  createLimiter,
  createSession,
  deleteSession,
  hashPassword,
  normalizeInvite,
  requireUser,
  sessionMiddleware,
  setSessionCookie,
  verifyPassword,
  type AuthEnv,
} from '../auth.js';
import type { Sql } from '../db.js';
import { syncUser } from '../catalog.js';
import { seedExercises } from '../seed.js';

const signupBody = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters.')
    .max(32, 'Username must be at most 32 characters.')
    .regex(/^[A-Za-z0-9_.-]+$/, 'Username may only contain letters, digits, "_", "." and "-".'),
  password: z.string().min(10, 'Password must be at least 10 characters.').max(128, 'Password must be at most 128 characters.'),
  invite: z.string().max(64),
});
const loginBody = z.object({ username: z.string().max(64), password: z.string().max(128) });

const WINDOW = 15 * 60_000;

export function authRoutes(sql: Sql): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  // 10 attempts / 15 min per client + username; sign-up (which guesses invite codes) per client.
  const loginLimit = createLimiter(10, WINDOW);
  const signupLimit = createLimiter(10, WINDOW);

  app.use(sessionMiddleware(sql));

  app.post('/signup', async (c) => {
    const parsed = signupBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'Invalid input.' }, 400);
    }
    if (!signupLimit.attempt(clientIp(c))) {
      return c.json({ error: 'rate_limited', message: 'Too many attempts. Try again in 15 minutes.' }, 429);
    }
    const { username, password } = parsed.data;
    const code = normalizeInvite(parsed.data.invite);
    const passwordHash = await hashPassword(password);

    const result = await sql.begin(async (tx) => {
      // Invite first: without a valid one a stranger can't even probe which usernames exist.
      const invites = await tx`SELECT code FROM invite WHERE code = ${code} AND used_by IS NULL FOR UPDATE`;
      if (!invites.length) return 'invalid_invite' as const;
      // The first account ever created is the owner.
      const users = await tx<{ id: string; is_admin: boolean }[]>`
        INSERT INTO app_user (username, password_hash, is_admin)
        VALUES (${username}, ${passwordHash}, NOT EXISTS (SELECT 1 FROM app_user))
        ON CONFLICT (lower(username)) DO NOTHING RETURNING id, is_admin`;
      const created = users[0];
      if (!created) return 'username_taken' as const;
      await tx`UPDATE invite SET used_by = ${created.id}, used_at = now() WHERE code = ${code}`;
      await tx`INSERT INTO user_settings (user_id) VALUES (${created.id})`;
      await seedExercises(tx, created.id);
      await syncUser(tx, created.id);
      return { id: Number(created.id), isAdmin: created.is_admin };
    });
    if (result === 'invalid_invite') {
      return c.json({ error: result, message: 'That invite code is invalid or already used.' }, 400);
    }
    if (result === 'username_taken') return c.json({ error: result, message: 'That username is taken.' }, 409);

    setSessionCookie(c, await createSession(sql, result.id));
    return c.json({ user: { id: result.id, username, isAdmin: result.isAdmin } }, 201);
  });

  app.post('/login', async (c) => {
    const parsed = loginBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_input', message: 'Invalid input.' }, 400);
    const { username, password } = parsed.data;
    const key = `${clientIp(c)}|${username.trim().toLowerCase()}`;
    if (!loginLimit.attempt(key)) {
      return c.json({ error: 'rate_limited', message: 'Too many attempts. Try again in 15 minutes.' }, 429);
    }
    const rows = await sql<{ id: string; username: string; password_hash: string; is_admin: boolean }[]>`
      SELECT id, username, password_hash, is_admin FROM app_user WHERE lower(username) = lower(${username.trim()})`;
    const row = rows[0];
    if (!(await verifyPassword(row?.password_hash, password)) || !row) {
      return c.json({ error: 'invalid_credentials', message: 'Wrong username or password.' }, 401);
    }
    loginLimit.reset(key);
    setSessionCookie(c, await createSession(sql, Number(row.id)));
    return c.json({ user: { id: Number(row.id), username: row.username, isAdmin: row.is_admin } });
  });

  app.post('/logout', async (c) => {
    const token = getCookie(c, COOKIE);
    if (token) await deleteSession(sql, token);
    clearSessionCookie(c);
    return c.json({ ok: true });
  });

  app.get('/me', requireUser, (c) => c.json({ user: c.get('user') }));

  return app;
}
