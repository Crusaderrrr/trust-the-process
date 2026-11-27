// `npm run seed:dev`: fills the `dev` account with test data for every feature, through the app's API,
// so it stays validated and never touches another account. Credentials come from .env. Re-running wipes
// that account's workouts first, with dates relative to today. Not part of the server build.
// First run only: pass an invite (`docker exec ttp-app-1 node dist-server/cli.js invite`) as DEV_INVITE.
import { randomUUID } from 'node:crypto';
import { addDays, isoWeekday, parseLocalDate, today } from '../src/domain/dates.js';
import { GRIP_SETS } from '../src/domain/exercises.js';

const BASE_URL = process.env.DEV_BASE_URL ?? 'http://localhost:3000';
// Fixed on purpose: the wipe below must never run as a real account, whatever .env says.
const USERNAME = 'dev';
const PASSWORD = process.env.DEV_ACCOUNT_PASSWORD;
if (!PASSWORD) throw new Error('DEV_ACCOUNT_PASSWORD is required (see .env)');
const DEFAULT_REST = 150;

type Lift = { name: string; kg: number; step: number; grips?: string[]; cardio?: [number, number, number] };
const lift = (name: string, kg: number, step: number, grips?: string[]): Lift => ({ name, kg, step, grips });
/** Cardio: `reps` holds the seconds and weight stays 0 (domain/sets.ts). */
const cardio = (name: string, seconds: number, speedKmh: number, inclinePct: number): Lift =>
  ({ name, kg: 0, step: 0, cardio: [seconds, speedKmh, inclinePct] });

type Session = { title: string; templateId: string | null; lifts: Lift[]; minutes: number };

// Exercise order follows the template slots (domain/templates.ts).
const UPPER: Session = {
  title: 'Upper body',
  templateId: 'upper',
  minutes: 70,
  lifts: [
    lift('Barbell Bench Press', 60, 0.5),
    lift('Lat Pulldown', 45, 0.5, ['wide', 'normal', 'narrow']),
    lift('Incline Dumbbell Press', 18, 0.25),
    lift('Seated Cable Row', 45, 0.5, ['parallel_normal', 'parallel_wide']),
    lift('Triceps Pushdown', 20, 0.25, ['rope', 'v_bar', 'straight_bar', 'single_hand']),
    lift('Barbell Curl', 25, 0.25),
  ],
};
const LOWER: Session = {
  title: 'Lower body',
  templateId: 'lower',
  minutes: 65,
  lifts: [
    lift('Back Squat', 80, 1.25),
    lift('Overhead Press', 40, 0.25),
    lift('Romanian Deadlift', 70, 1),
    lift('Lateral Raise', 8, 0.1),
    lift('Leg Press', 120, 2.5),
    lift('Face Pull', 20, 0.25),
  ],
};
// Older workouts predate templates (template_id stays null).
const PUSH: Session = {
  title: 'Push',
  templateId: null,
  minutes: 55,
  lifts: [
    lift('Barbell Bench Press', 60, 0.5),
    lift('Overhead Press', 40, 0.25),
    lift('Garage Landmine Press', 20, 0.25),
    lift('Skull Crusher', 25, 0.25),
    lift('Dip', 0, 0),
  ],
};
const PULL: Session = {
  title: 'Pull',
  templateId: null,
  minutes: 60,
  lifts: [
    lift('Deadlift', 90, 1),
    lift('Barbell Row', 50, 0.5),
    lift('Pull-Up', 0, 0, ['wide', 'normal']),
    lift('Chin-Up', 0, 0),
    lift('Chest-Supported Row', 35, 0.5, ['parallel_normal', 'narrow']),
    lift('Hammer Curl', 12, 0.1),
  ],
};
const CARDIO_CORE: Session = {
  title: 'Cardio & core',
  templateId: null,
  minutes: 45,
  lifts: [
    cardio('Treadmill', 20 * 60, 9.5, 1),
    cardio('Water Rower', 10 * 60, 12, 0),
    lift('Hanging Leg Raise', 0, 0),
    lift('Cable Crunch', 40, 0.5),
  ],
};
const EVENING_RUN: Session = { title: 'Evening run', templateId: null, minutes: 30, lifts: [cardio('Treadmill', 25 * 60, 10, 1.5)] };

type Planned = { date: string; hour: number; session: Session };
/** Roughly 2.5 years of history: templates in the last 10 weeks, Push/Pull before, sparse after 14 months. */
function schedule(now: string): Planned[] {
  const workouts: Planned[] = [];
  for (let back = 1; back <= 900; back++) {
    const date = addDays(now, -back);
    const weekday = isoWeekday(date);
    if (back <= 70) {
      if (weekday === 6 && back % 14 < 7) workouts.push({ date, hour: 10, session: CARDIO_CORE });
      const session = { 1: UPPER, 2: LOWER, 4: UPPER, 5: LOWER }[weekday];
      if (session) workouts.push({ date, hour: 18, session });
    } else if (back <= 420) {
      if (weekday === 1) workouts.push({ date, hour: 18, session: PUSH });
      if (weekday === 4) workouts.push({ date, hour: 18, session: PULL });
    } else if (weekday === 1 && back % 14 < 7) {
      workouts.push({ date, hour: 18, session: PUSH });
    }
  }
  // A second workout on the latest day that has one, for the calendar's "several workouts" sheet.
  const latest = workouts.find((w) => w.hour === 18);
  if (latest) workouts.push({ date: latest.date, hour: 21, session: EVENING_RUN });
  workouts.sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour);
  return workouts;
}

const round = (kg: number) => Math.round(kg / 2.5) * 2.5;

type SetRow = { type: string; kg: number; reps: number; speed?: number; incline?: number };

/** Slow progress with a deload every 8th session, so charts move and PRs appear. */
function setsFor(l: Lift, n: number, isFirst: boolean, isLast: boolean): SetRow[] {
  if (l.cardio) {
    const [seconds, speed, incline] = l.cardio;
    return [{ type: 'normal', kg: 0, reps: seconds + (n % 5) * 60, speed: speed + (n % 4) * 0.5, incline }];
  }
  const kg = round((l.kg + l.step * n) * (n % 8 === 7 ? 0.9 : 1));
  const reps = (s: number) => 8 + ((n + s) % 3);
  const sets: SetRow[] = [0, 1, 2].map((s) => ({ type: 'normal', kg, reps: reps(s) }));
  if (isFirst && kg > 0) sets.unshift({ type: 'warmup', kg: round(kg / 2), reps: 10 });
  if (isLast && n % 3 === 0) sets[sets.length - 1]!.type = 'failure';
  if (l.name === 'Lateral Raise' && n % 4 === 0) sets.push({ type: 'drop', kg: round(kg * 0.7) || kg, reps: 12 });
  return sets;
}

const CHECK_INS: [string, string[]][] = [
  ['good', ['slept_well', 'felt_strong']],
  ['good', ['ate_well', 'good_mood']],
  ['okay', []],
  ['bad', ['poor_sleep', 'low_energy']],
  ['okay', ['stressed']],
  ['good', []],
  ['bad', ['ate_badly', 'bad_mood']],
];

let cookie = '';

async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}/api${url}`, {
    method,
    headers: { cookie, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** Logs in, or signs up when the account doesn't exist yet. */
async function enter(): Promise<void> {
  const send = (url: string, body: object) =>
    fetch(`${BASE_URL}/api/auth/${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let res = await send('login', { username: USERNAME, password: PASSWORD });
  if (res.status === 401) {
    if (!process.env.DEV_INVITE) throw new Error('No such account (or wrong password). To create it, pass DEV_INVITE.');
    res = await send('signup', { username: USERNAME, password: PASSWORD, invite: process.env.DEV_INVITE });
  }
  if (!res.ok) throw new Error(`Sign-in failed: ${res.status} ${await res.text()}`);
  const { user } = (await res.json()) as { user: { username: string } };
  if (user.username !== USERNAME) throw new Error(`Refusing to seed "${user.username}"`);
  cookie = res.headers.getSetCookie()[0]!.split(';')[0]!;
}

async function wipe(): Promise<void> {
  const finished = await api<{ id: string }[]>('GET', '/history');
  const { workout: active } = await api<{ workout: { id: string } | null }>('GET', '/workouts/active');
  for (const { id } of active ? [...finished, active] : finished) await api('DELETE', `/workouts/${id}`);
}

type Exercise = { id: number; name: string; isCustom: number };

/** Library tweaks: favourites, pinned rests, archived, and custom exercises of every kind. */
async function setUpExercises(): Promise<(name: string) => number> {
  await api('PUT', '/settings', { defaultRestSeconds: DEFAULT_REST });
  await api('PUT', '/settings/template-colors/upper', { color: '#a78bfa' });

  // An own photo is stored as a data URL; this one is a 1x1 placeholder.
  const photo =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const custom = [
    { name: 'Garage Landmine Press', muscleGroup: 'chest', equipment: 'other', image: photo, grips: null },
    { name: 'Chest-Supported Row', muscleGroup: 'back', equipment: 'machine', image: null, grips: [...GRIP_SETS.back] },
    { name: 'Water Rower', muscleGroup: 'cardio', equipment: 'machine', image: null, grips: null },
    { name: 'Sled Push', muscleGroup: 'full_body', equipment: 'other', image: null, grips: null }, // no history, so it can be hard-deleted
  ];
  const list = async () => [...(await api<Exercise[]>('GET', '/exercises')), ...(await api<Exercise[]>('GET', '/exercises?archived=1'))];
  const existing = new Set((await list()).map((e) => e.name));
  for (const c of custom) if (!existing.has(c.name)) await api('POST', '/exercises', c);

  const ids = new Map((await list()).map((e) => [e.name, e.id]));
  const idOf = (name: string) => {
    const id = ids.get(name);
    if (!id) throw new Error(`Unknown exercise: ${name}`);
    return id;
  };
  for (const name of ['Barbell Bench Press', 'Back Squat', 'Deadlift', 'Lat Pulldown']) {
    await api('PATCH', `/exercises/${idOf(name)}`, { favorite: true });
  }
  for (const [name, restSeconds] of [['Deadlift', 240], ['Back Squat', 180], ['Lateral Raise', 60]] as const) {
    await api('PATCH', `/exercises/${idOf(name)}`, { restSeconds });
  }
  // Chin-Up has history (archive only); Shrug has none.
  for (const name of ['Chin-Up', 'Shrug']) await api('PATCH', `/exercises/${idOf(name)}`, { archived: true });
  return idOf;
}

const setDoc = (position: number, s: Partial<SetRow>, completed: boolean, autoFill = 0) => ({
  id: randomUUID(),
  position,
  setType: s.type ?? 'normal',
  weightKg: s.kg ?? null,
  reps: s.reps ?? null,
  speedKmh: s.speed ?? null,
  inclinePct: s.incline ?? null,
  completed: completed ? 1 : 0,
  autoFill,
});

await enter();
const now = today();
await wipe();
const idOf = await setUpExercises();
const workouts = schedule(now);

const sessionsDone = new Map<string, number>();
let index = 0;
for (const { date, hour, session } of workouts) {
  const startedAt = parseLocalDate(date);
  startedAt.setHours(hour, index % 45);
  const finishedAt = new Date(startedAt.getTime() + (session.minutes + index % 15) * 60_000);
  // Check-ins exist since recently: only the last two months have them, and not every workout.
  const checkIn = date >= addDays(now, -60) && index % 5 !== 4 ? CHECK_INS[index % CHECK_INS.length]! : null;
  // Every third Lower body ends with some treadmill.
  const lifts = session === LOWER && index % 3 === 0 ? [...session.lifts, cardio('Treadmill', 10 * 60, 8, 2)] : session.lifts;
  const id = randomUUID();
  await api('PUT', `/workouts/${id}`, {
    id,
    title: session.title,
    date,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    notes: index % 7 === 0 ? 'Gym was quiet, kept the rests honest.' : null,
    restEndsAt: null,
    rating: checkIn?.[0] ?? null,
    feelings: checkIn?.[1] ?? [],
    templateId: session.templateId,
    exercises: lifts.map((l, position) => {
      const n = sessionsDone.get(l.name) ?? 0;
      sessionsDone.set(l.name, n + 1);
      return {
        id: randomUUID(),
        exerciseId: idOf(l.name),
        position,
        grip: l.grips ? l.grips[n % l.grips.length]! : null,
        note: position === 0 && index % 6 === 0 ? 'Left shoulder a bit tight, kept the elbows tucked.' : null,
        sets: setsFor(l, n, position === 0, position === lifts.length - 1).map((s, p) => setDoc(p, s, true)),
      };
    }),
  });
  index++;
}

// A workout in progress: some sets done, the rest prefilled but open (autoFill 3 = dimmed until edited).
// Discard it in the app to get the "Start workout" state back; re-seeding restores it.
const activeId = randomUUID();
await api('PUT', `/workouts/${activeId}`, {
  id: activeId,
  title: 'Push day',
  date: now,
  startedAt: new Date(Date.now() - 35 * 60_000).toISOString(),
  finishedAt: null,
  notes: null,
  restEndsAt: null,
  rating: null,
  feelings: [],
  templateId: null,
  exercises: [
    {
      id: randomUUID(),
      exerciseId: idOf('Barbell Bench Press'),
      position: 0,
      grip: null,
      note: 'Pause on the chest',
      sets: [
        setDoc(0, { kg: 110, reps: 8 }, true),
        setDoc(1, { kg: 110, reps: 8 }, true),
        setDoc(2, { kg: 110, reps: 8 }, false, 3),
      ],
    },
    {
      id: randomUUID(),
      exerciseId: idOf('Lat Pulldown'),
      position: 1,
      grip: 'wide',
      note: null,
      sets: [setDoc(0, { kg: 52.5, reps: 10 }, false, 3), setDoc(1, {}, false)],
    },
    { id: randomUUID(), exerciseId: idOf('Treadmill'), position: 2, grip: null, note: null, sets: [setDoc(0, {}, false)] },
  ],
});

await api('POST', '/auth/logout', {});
console.log(`Seeded "${USERNAME}" at ${BASE_URL}: ${workouts.length} finished workouts + 1 active.`);
