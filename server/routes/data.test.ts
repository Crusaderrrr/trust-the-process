import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { COOKIE, newInviteCode } from '../auth.js';
import { migrate, type Sql } from '../db.js';
import { tempSchema } from '../test-db.js';

let sql: Sql;
let drop: () => Promise<void>;
let app: ReturnType<typeof createApp>;
let ann: string; // cookies of two separate accounts
let bob: string;

beforeAll(async () => {
  ({ sql, drop } = await tempSchema());
  await migrate(sql);
  app = createApp(sql, '.');
  ann = await signup('ann');
  bob = await signup('bob');
});
afterAll(() => drop());

async function signup(username: string): Promise<string> {
  const code = newInviteCode();
  await sql`INSERT INTO invite (code) VALUES (${code})`;
  const res = await app.request('/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.1.1.${username.length}${username}` },
    body: JSON.stringify({ username, password: 'a-long-enough-password', invite: code }),
  });
  expect(res.status).toBe(201);
  return `${COOKIE}=${res.headers.get('set-cookie')?.match(new RegExp(`${COOKIE}=([^;]*)`))?.[1]}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper, JSON of any shape
type Json = any;
async function call(method: string, path: string, cookie: string, body?: unknown): Promise<{ status: number; json: Json }> {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const exerciseId = async (cookie: string, name: string): Promise<number> => {
  const { json } = await call('GET', '/api/exercises', cookie);
  return json.find((e: { name: string }) => e.name === name).id;
};

type SetIn = { weightKg?: number | null; reps?: number | null; completed?: boolean; setType?: string };
const doc = (
  exercises: { exerciseId: number; grip?: string | null; sets: SetIn[]; note?: string | null }[],
  over: Record<string, unknown> = {},
) => ({
  id: randomUUID(),
  title: 'Evening Workout',
  date: '2026-10-20',
  startedAt: '2026-10-20T17:00:00.000Z',
  finishedAt: '2026-10-20T18:00:00.000Z',
  notes: null,
  restEndsAt: null,
  exercises: exercises.map((e, i) => ({
    id: randomUUID(),
    exerciseId: e.exerciseId,
    position: i,
    grip: e.grip ?? null,
    note: e.note ?? null,
    sets: e.sets.map((s, j) => ({
      id: randomUUID(),
      position: j,
      setType: s.setType ?? 'normal',
      weightKg: s.weightKg ?? null,
      reps: s.reps ?? null,
      speedKmh: null,
      inclinePct: null,
      completed: s.completed === false ? 0 : 1,
      autoFill: 0,
    })),
  })),
  ...over,
});

describe('authentication', () => {
  it.each([
    ['GET', '/api/exercises'],
    ['GET', '/api/workouts/active'],
    ['GET', '/api/history'],
    ['GET', '/api/settings'],
    ['GET', '/api/progress/sessions'],
  ])('%s %s requires login', async (method, path) => {
    expect((await call(method, path, '')).status).toBe(401);
  });
});

describe('exercise library', () => {
  it('seeds a full library per account, in order, with grip and cardio flags', async () => {
    const { json } = await call('GET', '/api/exercises', ann);
    expect(json).toHaveLength(53);
    expect(json.map((e: { name: string }) => e.name.toLowerCase())).toEqual(
      json.map((e: { name: string }) => e.name.toLowerCase()).sort(),
    );
    const byName = (n: string) => json.find((e: { name: string }) => e.name === n);
    expect(byName('Lat Pulldown')).toMatchObject({ gripSet: 'back', isCardio: 0, isCustom: 0, restSeconds: 120, image: '/exercises/lat-pulldown.jpg' });
    expect(byName('Treadmill')).toMatchObject({ isCardio: 1, restSeconds: 0, muscleGroup: 'cardio' });
    expect(byName('Dip').gripSet).toBeNull();
    expect(byName('Triceps Pushdown').gripSet).toBe('triceps');
  });

  it('keeps accounts apart', async () => {
    const id = await exerciseId(ann, 'Dip');
    expect((await call('PATCH', `/api/exercises/${id}`, bob, { favorite: true })).status).toBe(404);
    expect((await call('GET', `/api/exercises/${id}`, bob)).status).toBe(404);
    expect((await call('DELETE', `/api/exercises/${id}`, bob)).status).toBe(404);
    await call('PATCH', `/api/exercises/${id}`, ann, { favorite: true });
    const bobsDip = (await call('GET', '/api/exercises', bob)).json.find((e: { name: string }) => e.name === 'Dip');
    expect(bobsDip.favorite).toBe(0);
  });

  it('creates custom exercises (default rest, no duplicates), and deletes or archives them', async () => {
    const made = await call('POST', '/api/exercises', ann, {
      name: '  Sled Push ',
      muscleGroup: 'legs',
      equipment: 'other',
      image: null,
      gripSet: null,
    });
    expect(made.status).toBe(201);
    expect(made.json).toMatchObject({ name: 'Sled Push', isCustom: 1, restSeconds: 120 });

    const dup = await call('POST', '/api/exercises', ann, { name: 'sled PUSH', muscleGroup: 'legs', equipment: 'other', image: null, gripSet: null });
    expect(dup.status).toBe(409);
    expect(dup.json.message).toMatch(/already exists/);
    // another account may use the same name
    expect((await call('POST', '/api/exercises', bob, { name: 'Sled Push', muscleGroup: 'legs', equipment: 'other', image: null, gripSet: null })).status).toBe(201);

    // the Cardio category makes an exercise time-based, without a rest timer or grips
    const bike = await call('POST', '/api/exercises', ann, { name: 'Bike', muscleGroup: 'cardio', equipment: 'machine', image: null, gripSet: 'back' });
    expect(bike.json).toMatchObject({ isCardio: 1, restSeconds: 0, restCustom: 1, gripSet: null, muscleGroup: 'cardio' });

    expect((await call('DELETE', `/api/exercises/${made.json.id}`, ann)).json).toEqual({ result: 'deleted' });
    // seeded exercises are archived, never deleted
    const dip = await exerciseId(ann, 'Dip');
    expect((await call('DELETE', `/api/exercises/${dip}`, ann)).json).toEqual({ result: 'archived' });
    const archived = await call('GET', '/api/exercises?archived=1', ann);
    expect(archived.json.map((e: { name: string }) => e.name)).toEqual(['Dip']);
    await call('PATCH', `/api/exercises/${dip}`, ann, { archived: false });
    expect((await call('GET', '/api/exercises?archived=1', ann)).json).toEqual([]);
  });

  it('pins rest per exercise and follows the default after a reset', async () => {
    const id = await exerciseId(ann, 'Plank');
    const pinned = await call('PATCH', `/api/exercises/${id}`, ann, { restSeconds: 45 });
    expect(pinned.json.restSeconds).toBe(45);
    await call('PUT', '/api/settings', ann, { defaultRestSeconds: 90 });
    expect((await call('GET', `/api/exercises/${id}`, ann)).json.restSeconds).toBe(45); // pinned: unchanged
    expect((await call('GET', `/api/exercises/${await exerciseId(ann, 'Shrug')}`, ann)).json.restSeconds).toBe(90);
    expect((await call('GET', `/api/exercises/${await exerciseId(ann, 'Treadmill')}`, ann)).json.restSeconds).toBe(0);
    expect((await call('PATCH', `/api/exercises/${id}`, ann, { restSeconds: null })).json.restSeconds).toBe(90);
    expect((await call('GET', '/api/settings', ann)).json).toEqual({ defaultRestSeconds: 90 });
    expect((await call('GET', '/api/settings', bob)).json).toEqual({ defaultRestSeconds: 120 });
  });

  it('rejects bad input', async () => {
    expect((await call('POST', '/api/exercises', ann, { name: '', muscleGroup: 'legs', equipment: 'other', image: null, gripSet: null })).status).toBe(400);
    expect((await call('POST', '/api/exercises', ann, { name: 'X', muscleGroup: 'tail', equipment: 'other', image: null, gripSet: null })).status).toBe(400);
    expect((await call('PUT', '/api/settings', ann, { defaultRestSeconds: -5 })).status).toBe(400);
  });
});

describe('skips', () => {
  it('saves, lists, updates and removes skips per account', async () => {
    await call('PUT', '/api/skips/2026-10-03', ann, { reason: 'sick', note: null });
    await call('PUT', '/api/skips/2026-10-03', ann, { reason: 'travel', note: 'Rome' });
    await call('PUT', '/api/skips/2026-10-09', ann, { reason: 'tired', note: null });
    expect((await call('GET', '/api/skips?from=2026-10-01&to=2026-10-05', ann)).json).toEqual([
      { date: '2026-10-03', reason: 'travel', note: 'Rome', rating: null },
    ]);
    expect((await call('GET', '/api/skips?from=2026-10-01&to=2026-10-31', bob)).json).toEqual([]);
    // the mood of a skipped day is optional and replaced on every save
    await call('PUT', '/api/skips/2026-10-09', ann, { reason: 'tired', note: null, rating: 'okay' });
    expect((await call('GET', '/api/skips?from=2026-10-09&to=2026-10-09', ann)).json[0]).toMatchObject({ rating: 'okay' });
    expect((await call('PUT', '/api/skips/2026-10-09', ann, { reason: 'tired', note: null, rating: 'meh' })).status).toBe(400);
    await call('DELETE', '/api/skips/2026-10-09', ann);
    expect((await call('GET', '/api/skips?from=2026-10-01&to=2026-10-31', ann)).json).toHaveLength(1);
    expect((await call('PUT', '/api/skips/2026-10-03', ann, { reason: 'nope', note: null })).status).toBe(400);
    expect((await call('PUT', '/api/skips/not-a-date', ann, { reason: 'sick', note: null })).status).toBe(400);
  });
});

describe('workouts', () => {
  it('keeps the template a workout was started from, and each account has its own template colours', async () => {
    const bench = await exerciseId(ann, 'Barbell Bench Press');
    const w = doc([{ exerciseId: bench, sets: [{ weightKg: 60, reps: 8, completed: false }] }], { templateId: 'upper', date: '2026-09-01' });
    expect((await call('PUT', `/api/workouts/${w.id}`, ann, w)).status).toBe(200);
    expect((await call('GET', `/api/workouts/${w.id}`, ann)).json.workout).toMatchObject({ templateId: 'upper', date: '2026-09-01' });
    expect((await call('GET', '/api/history', ann)).json.find((h: { id: string }) => h.id === w.id)).toMatchObject({ templateId: 'upper', date: '2026-09-01' });

    expect((await call('GET', '/api/settings/template-colors', ann)).json).toEqual({});
    expect((await call('PUT', '/api/settings/template-colors/upper', ann, { color: '#a78bfa' })).status).toBe(200);
    expect((await call('PUT', '/api/settings/template-colors/lower', ann, { color: '#f59e0b' })).status).toBe(200);
    expect((await call('PUT', '/api/settings/template-colors/upper', ann, { color: 'red' })).status).toBe(400);
    expect((await call('GET', '/api/settings/template-colors', ann)).json).toEqual({ upper: '#a78bfa', lower: '#f59e0b' });
    expect((await call('GET', '/api/settings/template-colors', bob)).json).toEqual({});
  });

  it('stores the optional check-in and returns the rating for the calendar', async () => {
    const bench = await exerciseId(ann, 'Barbell Bench Press');
    const w = doc([{ exerciseId: bench, sets: [{ weightKg: 60, reps: 8 }] }], { rating: 'bad', feelings: ['poor_sleep', 'stressed'] });
    expect((await call('PUT', `/api/workouts/${w.id}`, ann, w)).status).toBe(200);
    expect((await call('GET', `/api/workouts/${w.id}`, ann)).json.workout).toMatchObject({ rating: 'bad', feelings: ['poor_sleep', 'stressed'] });
    expect((await call('GET', '/api/workouts?from=2026-10-20&to=2026-10-20', ann)).json[0]).toMatchObject({ rating: 'bad' });
    // a document without a check-in (saved before it existed) is a workout with no mark
    const old = doc([{ exerciseId: bench, sets: [{ weightKg: 50, reps: 5 }] }], { date: '2026-10-21' });
    await call('PUT', `/api/workouts/${old.id}`, ann, old);
    expect((await call('GET', `/api/workouts/${old.id}`, ann)).json.workout).toMatchObject({ rating: null, feelings: [] });
    const bad = { ...w, rating: 'awful' };
    expect((await call('PUT', `/api/workouts/${w.id}`, ann, bad)).status).toBe(400);
  });

  it('stores a workout document and reads it back whole', async () => {
    const bench = await exerciseId(ann, 'Barbell Bench Press');
    const w = doc([{ exerciseId: bench, sets: [{ weightKg: 60, reps: 8 }, { weightKg: 62.5, reps: 6, setType: 'warmup' }], note: 'felt good' }], {
      notes: 'ok',
    });
    expect((await call('PUT', `/api/workouts/${w.id}`, ann, w)).status).toBe(200);
    const got = (await call('GET', `/api/workouts/${w.id}`, ann)).json.workout;
    expect(got).toMatchObject({ id: w.id, title: 'Evening Workout', date: '2026-10-20', notes: 'ok', finishedAt: '2026-10-20T18:00:00.000Z' });
    expect(got.exercises).toHaveLength(1);
    expect(got.exercises[0]).toMatchObject({
      exerciseId: bench,
      name: 'Barbell Bench Press',
      muscleGroup: 'chest',
      isCardio: 0,
      gripSet: null,
      restCustom: 0,
      note: 'felt good',
      previous: [],
    });
    expect(got.exercises[0].sets.map((s: Json) => [s.weightKg, s.reps, s.setType, s.completed])).toEqual([
      [60, 8, 'normal', 1],
      [62.5, 6, 'warmup', 1],
    ]);
  });

  it('replaces exercises and sets on every save, keeping ids', async () => {
    const dip = await exerciseId(ann, 'Dip');
    const squat = await exerciseId(ann, 'Back Squat');
    const w = doc([{ exerciseId: dip, sets: [{ weightKg: 0, reps: 10 }] }, { exerciseId: squat, sets: [{ weightKg: 100, reps: 5 }] }], {
      date: '2026-10-21',
      startedAt: '2026-10-21T17:00:00.000Z',
      finishedAt: '2026-10-21T18:00:00.000Z',
    });
    await call('PUT', `/api/workouts/${w.id}`, ann, w);
    const edited = { ...w, title: 'Renamed', exercises: [w.exercises[1]!] };
    await call('PUT', `/api/workouts/${w.id}`, ann, edited);
    const got = (await call('GET', `/api/workouts/${w.id}`, ann)).json.workout;
    expect(got.title).toBe('Renamed');
    expect(got.exercises.map((e: Json) => e.id)).toEqual([w.exercises[1]!.id]);
  });

  it('keeps one unfinished workout per account and serves it as the active one', async () => {
    expect((await call('GET', '/api/workouts/active', bob)).json).toEqual({ workout: null });
    const open = doc([], { finishedAt: null, date: '2026-10-25', startedAt: '2026-10-25T08:00:00.000Z' });
    expect((await call('PUT', `/api/workouts/${open.id}`, bob, open)).status).toBe(200);
    expect((await call('GET', '/api/workouts/active', bob)).json.workout.id).toBe(open.id);
    const second = doc([], { finishedAt: null, date: '2026-10-25', startedAt: '2026-10-25T09:00:00.000Z' });
    const res = await call('PUT', `/api/workouts/${second.id}`, bob, second);
    expect(res.status).toBe(409);
    expect(res.json.error).toBe('active_exists');
    // another account is not blocked
    const anns = doc([], { finishedAt: null, date: '2026-10-25', startedAt: '2026-10-25T09:00:00.000Z' });
    expect((await call('PUT', `/api/workouts/${anns.id}`, ann, anns)).status).toBe(200);
    // finishing frees the slot
    await call('PUT', `/api/workouts/${open.id}`, bob, { ...open, finishedAt: '2026-10-25T09:00:00.000Z' });
    expect((await call('GET', '/api/workouts/active', bob)).json).toEqual({ workout: null });
    await call('DELETE', `/api/workouts/${anns.id}`, ann);
  });

  it('starting a workout on a skipped day lifts the skip, editing an existing one does not', async () => {
    await call('PUT', '/api/skips/2026-10-12', ann, { reason: 'sick', note: null });
    const w = doc([], { date: '2026-10-12', startedAt: '2026-10-12T17:00:00.000Z', finishedAt: '2026-10-12T18:00:00.000Z' });
    await call('PUT', `/api/workouts/${w.id}`, ann, w);
    expect((await call('GET', '/api/skips?from=2026-10-12&to=2026-10-12', ann)).json).toEqual([]);
    await call('PUT', '/api/skips/2026-10-12', ann, { reason: 'tired', note: null });
    await call('PUT', `/api/workouts/${w.id}`, ann, { ...w, title: 'Changed' });
    expect((await call('GET', '/api/skips?from=2026-10-12&to=2026-10-12', ann)).json).toHaveLength(1);
  });

  it('gives the Previous column from the latest earlier finished workout, preferring the same grip', async () => {
    const row = await exerciseId(bob, 'Seated Cable Row');
    const older = doc([{ exerciseId: row, grip: 'wide', sets: [{ weightKg: 50, reps: 10 }] }], {
      date: '2026-09-01',
      startedAt: '2026-09-01T17:00:00.000Z',
      finishedAt: '2026-09-01T18:00:00.000Z',
    });
    const newer = doc([{ exerciseId: row, grip: 'narrow', sets: [{ weightKg: 55, reps: 8 }, { weightKg: 57.5, reps: 6 }] }], {
      date: '2026-09-08',
      startedAt: '2026-09-08T17:00:00.000Z',
      finishedAt: '2026-09-08T18:00:00.000Z',
    });
    const incomplete = doc([{ exerciseId: row, grip: 'wide', sets: [{ weightKg: 99, reps: 1, completed: false }] }], {
      date: '2026-09-09',
      startedAt: '2026-09-09T17:00:00.000Z',
      finishedAt: '2026-09-09T18:00:00.000Z',
    });
    const today = doc(
      [
        { exerciseId: row, grip: 'wide', sets: [{}] },
        { exerciseId: row, grip: 'narrow', sets: [{}] },
      ],
      { date: '2026-09-10', startedAt: '2026-09-10T17:00:00.000Z', finishedAt: null },
    );
    // sets without values can't be completed; send them as open sets
    for (const e of today.exercises) for (const s of e.sets) s.completed = 0;
    for (const e of incomplete.exercises) for (const s of e.sets) s.completed = 0;
    for (const d of [older, newer, incomplete, today]) expect((await call('PUT', `/api/workouts/${d.id}`, bob, d)).status).toBe(200);
    const got = (await call('GET', `/api/workouts/${today.id}`, bob)).json.workout;
    // wide: same grip (older, 50x10) beats the newer narrow session
    expect(got.exercises[0].previous).toEqual([{ weightKg: 50, reps: 10, speedKmh: null, inclinePct: null, setType: 'normal' }]);
    expect(got.exercises[1].previous.map((s: Json) => [s.weightKg, s.reps])).toEqual([[55, 8], [57.5, 6]]);
    // the same lookup is available for a new exercise being added to a workout
    const q = `grip=wide&date=2026-09-10&startedAt=${encodeURIComponent('2026-09-10T17:00:00.000Z')}`;
    expect((await call('GET', `/api/exercises/${row}/previous?${q}`, bob)).json).toHaveLength(1);
    expect((await call('GET', `/api/exercises/${row}/previous?${q}`, ann)).json).toEqual([]); // not ann's history
    // the offline copy: one entry per exercise and grip, newest finished workout, completed sets only
    const last = (await call('GET', '/api/exercises/last-sets', bob)).json.filter((e: Json) => e.exerciseId === row);
    expect(last.map((e: Json) => [e.grip, e.date, e.sets.map((s: Json) => s.reps)])).toEqual(
      expect.arrayContaining([['wide', '2026-09-01', [10]], ['narrow', '2026-09-08', [8, 6]]]),
    );
    expect((await call('GET', '/api/exercises/last-sets', ann)).json.filter((e: Json) => e.exerciseId === row)).toEqual([]);
    // the grip used last time is offered when the exercise is added again
    expect((await call('GET', `/api/exercises/${row}`, bob)).json.lastGrip).toBe('narrow');
    await call('DELETE', `/api/workouts/${today.id}`, bob);
  });

  it('keeps accounts apart', async () => {
    const dip = await exerciseId(ann, 'Dip');
    const w = doc([{ exerciseId: dip, sets: [{ weightKg: 0, reps: 12 }] }], { date: '2026-10-02', startedAt: '2026-10-02T17:00:00.000Z', finishedAt: '2026-10-02T18:00:00.000Z' });
    await call('PUT', `/api/workouts/${w.id}`, ann, w);
    expect((await call('GET', `/api/workouts/${w.id}`, bob)).status).toBe(404);
    expect((await call('PUT', `/api/workouts/${w.id}`, bob, { ...w, title: 'hijack' })).status).toBe(404);
    await call('DELETE', `/api/workouts/${w.id}`, bob);
    expect((await call('GET', `/api/workouts/${w.id}`, ann)).json.workout.title).toBe('Evening Workout');
    // bob cannot log sets against ann's exercise either
    const stolen = doc([{ exerciseId: dip, sets: [{ weightKg: 1, reps: 1 }] }]);
    const res = await call('PUT', `/api/workouts/${stolen.id}`, bob, stolen);
    expect(res.status).toBe(400);
    expect(res.json.message).toMatch(/Unknown exercise/);
  });

  it('rejects malformed documents', async () => {
    const dip = await exerciseId(ann, 'Dip');
    const base = doc([{ exerciseId: dip, sets: [{ weightKg: 0, reps: 5 }] }]);
    const put = (body: unknown, id = base.id) => call('PUT', `/api/workouts/${id}`, ann, body);
    expect((await put({ ...base, id: randomUUID() })).status).toBe(400); // id mismatch
    expect((await put({ ...base, date: '20/10/2026' })).status).toBe(400);
    expect((await put({ ...base, startedAt: 'yesterday' })).status).toBe(400);
    const noValues = doc([{ exerciseId: dip, sets: [{ weightKg: null, reps: null }] }]); // completed without values
    expect((await call('PUT', `/api/workouts/${noValues.id}`, ann, noValues)).status).toBe(400);
    expect((await call('PUT', '/api/workouts/not-a-uuid', ann, { ...base, id: 'not-a-uuid' })).status).toBe(400);
    expect((await call('GET', '/api/workouts/not-a-uuid', ann)).status).toBe(404);
  });

  it('deletes workouts together with their exercises and sets', async () => {
    const dip = await exerciseId(ann, 'Dip');
    const w = doc([{ exerciseId: dip, sets: [{ weightKg: 0, reps: 5 }] }], { date: '2026-10-03', startedAt: '2026-10-03T17:00:00.000Z', finishedAt: '2026-10-03T18:00:00.000Z' });
    await call('PUT', `/api/workouts/${w.id}`, ann, w);
    expect((await call('DELETE', `/api/workouts/${w.id}`, ann)).status).toBe(200);
    expect((await call('GET', `/api/workouts/${w.id}`, ann)).status).toBe(404);
    const left = await sql`SELECT (SELECT count(*) FROM workout_set WHERE id = ${w.exercises[0]!.sets[0]!.id}) AS n`;
    expect(left[0]?.n).toBe('0');
  });
});

describe('history, calendar and progress', () => {
  it('lists finished workouts newest first with per-exercise set counts and volume (warm-ups excluded)', async () => {
    const press = await exerciseId(ann, 'Overhead Press');
    const w = doc(
      [{ exerciseId: press, sets: [{ weightKg: 20, reps: 10, setType: 'warmup' }, { weightKg: 40, reps: 5 }, { weightKg: 40, reps: 5, completed: false, }] }],
      { title: 'Press day', date: '2026-10-28', startedAt: '2026-10-28T17:00:00.000Z', finishedAt: '2026-10-28T18:00:00.000Z' },
    );
    w.exercises[0]!.sets[2]!.weightKg = 40;
    w.exercises[0]!.sets[2]!.reps = 5;
    await call('PUT', `/api/workouts/${w.id}`, ann, w);
    const { json } = await call('GET', '/api/history', ann);
    expect(json[0]).toMatchObject({ id: w.id, title: 'Press day', volume: 200 });
    expect(json[0].exercises).toEqual([{ name: 'Overhead Press', sets: 2, grip: null }]);
    const dates = json.map((h: Json) => h.date);
    expect(dates).toEqual([...dates].sort().reverse());
    expect((await call('GET', '/api/history', bob)).json.every((h: Json) => h.id !== w.id)).toBe(true);
  });

  it('returns calendar workouts for a range with exercise notes', async () => {
    const press = await exerciseId(ann, 'Overhead Press');
    const w = doc([{ exerciseId: press, sets: [{ weightKg: 30, reps: 5 }], note: 'shoulder twinge' }], {
      date: '2026-11-05',
      startedAt: '2026-11-05T17:00:00.000Z',
      finishedAt: '2026-11-05T18:00:00.000Z',
    });
    await call('PUT', `/api/workouts/${w.id}`, ann, w);
    const { json } = await call('GET', '/api/workouts?from=2026-11-01&to=2026-11-30', ann);
    expect(json).toEqual([
      { id: w.id, title: 'Evening Workout', date: '2026-11-05', rating: null, notes: [{ workoutId: w.id, name: 'Overhead Press', note: 'shoulder twinge' }] },
    ]);
    expect((await call('GET', '/api/workouts?from=2026-11-01&to=2026-11-30', bob)).json).toEqual([]);
  });

  it('groups completed sets into sessions per exercise, by workout and grip', async () => {
    const lat = await exerciseId(bob, 'Lat Pulldown');
    const a = doc([{ exerciseId: lat, grip: 'wide', sets: [{ weightKg: 50, reps: 10 }, { weightKg: 55, reps: 8 }] }], {
      date: '2026-08-01',
      startedAt: '2026-08-01T17:00:00.000Z',
      finishedAt: '2026-08-01T18:00:00.000Z',
    });
    const b = doc([{ exerciseId: lat, grip: 'narrow', sets: [{ weightKg: 45, reps: 12 }] }], {
      date: '2026-08-08',
      startedAt: '2026-08-08T17:00:00.000Z',
      finishedAt: '2026-08-08T18:00:00.000Z',
    });
    await call('PUT', `/api/workouts/${a.id}`, bob, a);
    await call('PUT', `/api/workouts/${b.id}`, bob, b);
    const { json } = await call('GET', `/api/progress/sessions?exerciseId=${lat}`, bob);
    expect(Object.keys(json)).toEqual([String(lat)]);
    expect(json[lat].map((s: Json) => [s.workoutId, s.date, s.grip, s.sets.length])).toEqual([
      [a.id, '2026-08-01', 'wide', 2],
      [b.id, '2026-08-08', 'narrow', 1],
    ]);
    expect(json[lat][0].sets[1]).toEqual({ weightKg: 55, reps: 8, speedKmh: null, inclinePct: null, setType: 'normal' });
    expect((await call('GET', '/api/progress/sessions', ann)).json[lat]).toBeUndefined();

    // an unfinished workout only counts when asked for
    const live = doc([{ exerciseId: lat, grip: 'wide', sets: [{ weightKg: 60, reps: 6 }] }], { date: '2026-08-15', startedAt: '2026-08-15T17:00:00.000Z', finishedAt: null });
    await call('PUT', `/api/workouts/${live.id}`, bob, live);
    expect((await call('GET', `/api/progress/sessions?exerciseId=${lat}`, bob)).json[lat]).toHaveLength(2);
    expect((await call('GET', `/api/progress/sessions?exerciseId=${lat}&includeWorkoutId=${live.id}`, bob)).json[lat]).toHaveLength(3);
    await call('DELETE', `/api/workouts/${live.id}`, bob);
  });
});

describe('push subscriptions', () => {
  const keys = { p256dh: 'BKey', auth: 'secret' };

  it('hands out the public key and stores a device for the signed-in account', async () => {
    const key = (await call('GET', '/api/push/key', ann)).json.publicKey;
    expect(key).toMatch(/^[\w-]{40,}$/);
    expect((await call('POST', '/api/push/subscribe', ann, { endpoint: 'https://web.push.apple.com/a1', keys })).status).toBe(200);
    // the same device signing in as someone else moves to that account
    expect((await call('POST', '/api/push/subscribe', bob, { endpoint: 'https://web.push.apple.com/a1', keys })).status).toBe(200);
    const rows = await sql`SELECT user_id FROM push_subscription`;
    expect(rows).toHaveLength(1);
  });

  it('refuses endpoints that are not browser push services (the server would call them)', async () => {
    for (const endpoint of ['http://169.254.169.254/latest', 'https://example.com/x', 'https://web.push.apple.com.evil.example/x']) {
      expect((await call('POST', '/api/push/subscribe', ann, { endpoint, keys })).status).toBe(400);
    }
    expect((await call('GET', '/api/push/key', '')).status).toBe(401);
  });
});
