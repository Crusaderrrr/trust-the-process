import type { Context } from 'hono';
import { Hono } from 'hono';
import type { z } from 'zod';
import { requireUser, sessionMiddleware, type AuthEnv } from '../auth.js';
import type { Sql } from '../db.js';

/** A router whose every route needs a logged-in user. */
export function privateRouter(sql: Sql): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  app.use(sessionMiddleware(sql), requireUser);
  return app;
}

export const userId = (c: Context<AuthEnv>): number => c.get('user').id;

export const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

type Parsed<T> = { data: T; error?: undefined } | { data?: undefined; error: Response };

/** Parses a JSON body; on failure `error` is a ready-to-return 400. */
export async function parseBody<S extends z.ZodType>(c: Context<AuthEnv>, schema: S): Promise<Parsed<z.infer<S>>> {
  const result = schema.safeParse(await c.req.json().catch(() => null));
  if (result.success) return { data: result.data };
  const issue = result.error.issues[0];
  const where = issue?.path.length ? ` (${issue.path.join('.')})` : '';
  return { error: c.json({ error: 'invalid_input', message: `${issue?.message ?? 'Invalid input'}${where}` }, 400) };
}

/** Postgres unique-violation (SQLSTATE 23505), optionally for one named index. */
export function isUniqueViolation(e: unknown, constraint?: string): boolean {
  const err = e as { code?: string; constraint_name?: string };
  return err.code === '23505' && (!constraint || err.constraint_name === constraint);
}

export const MUSCLE_GROUPS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'glutes', 'core', 'full_body', 'cardio'] as const;
export const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'other'] as const;
export const GRIP_SETS = ['back', 'triceps'] as const;
export const GRIPS = ['wide', 'normal', 'narrow', 'parallel_wide', 'parallel_normal', 'rope', 'v_bar', 'straight_bar', 'single_hand'] as const;
export const RATINGS = ['good', 'okay', 'bad'] as const;
export const FEELINGS = [
  'poor_sleep',
  'slept_well',
  'ate_badly',
  'ate_well',
  'bad_mood',
  'good_mood',
  'stressed',
  'low_energy',
  'felt_strong',
] as const;
export const SET_TYPES = ['normal', 'warmup', 'drop', 'failure'] as const;
export const SKIP_REASONS = ['sick', 'injury', 'tired', 'no_time', 'travel', 'chose_not_to', 'other'] as const;

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
