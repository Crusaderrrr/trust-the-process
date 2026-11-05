// `npm run seed:dev`: (re)creates the `dev` account in the local dev database with data for every
// feature. Re-running replaces the account, with dates relative to today. The URL is fixed on purpose
// (DATABASE_URL is ignored) so this can never run against production; not part of the server build.
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { addDays, isoWeekday, parseLocalDate, today } from '../src/domain/dates.js';
import { hashPassword } from './auth.js';
import { connect, migrate, type Tx } from './db.js';
import { seedExercises } from './seed.js';

const DEV_DATABASE_URL = 'postgres://ttp:ttp@127.0.0.1:5433/ttp';
const USERNAME = 'dev';
const PASSWORD = 'ttp-dev-password';
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
    lift('Triceps Pushdown', 20, 0.25, ['rope', 'v_bar', 'straight_bar']),
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
    lift('Landmine Press', 20, 0.25),
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
    cardio('Rowing Machine', 10 * 60, 12, 0),
    lift('Hanging Leg Raise', 0, 0),
    lift('Cable Crunch', 40, 0.5),
  ],
};
const EVENING_RUN: Session = { title: 'Evening run', templateId: null, minutes: 30, lifts: [cardio('Treadmill', 25 * 60, 10, 1.5)] };

type Planned = { date: string; hour: number; session: Session };
type SkipRow = { date: string; reason: string; note: string | null; rating: string | null };

// One of each reason, some with a note and a mood. Index = nth planned day counting back from today.
const SKIPPED = new Map<number, Omit<SkipRow, 'date'>>([
  [2, { reason: 'tired', note: 'Slept four hours', rating: 'bad' }],
  [6, { reason: 'no_time', note: null, rating: 'okay' }],
  [9, { reason: 'sick', note: 'Head cold', rating: 'bad' }],
  [13, { reason: 'chose_not_to', note: null, rating: 'good' }],
  [17, { reason: 'travel', note: 'Weekend away', rating: null }],
  [21, { reason: 'injury', note: 'Tweaked lower back', rating: 'okay' }],
  [25, { reason: 'other', note: null, rating: null }],
]);

/** Roughly 2.5 years of history: templates in the last 10 weeks, Push/Pull before, sparse after 14 months. */
function schedule(now: string): { workouts: Planned[]; skips: SkipRow[] } {
  const workouts: Planned[] = [];
  const skips: SkipRow[] = [];
  let planned = 0;
  for (let back = 1; back <= 900; back++) {
    const date = addDays(now, -back);
    const weekday = isoWeekday(date);
    if (back <= 70) {
      if (weekday === 6 && back % 14 < 7) workouts.push({ date, hour: 10, session: CARDIO_CORE });
      const session = { 1: UPPER, 2: LOWER, 4: UPPER, 5: LOWER }[weekday];
      if (!session) continue;
      const skip = SKIPPED.get(planned++);
      if (skip) skips.push({ date, ...skip });
      else workouts.push({ date, hour: 18, session });
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
  return { workouts, skips };
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

async function insertWorkout(
  tx: Tx,
  uid: string,
  w: { date: string; startedAt: Date; finishedAt: Date | null; title: string; templateId: string | null; notes: string | null; rating: string | null; feelings: string[] },
) {
  const id = randomUUID();
  await tx`
    INSERT INTO workout (id, user_id, title, date, started_at, finished_at, notes, rating, feelings, template_id)
    VALUES (${id}, ${uid}, ${w.title}, ${w.date}, ${w.startedAt}, ${w.finishedAt}, ${w.notes}, ${w.rating},
            ${tx.array(w.feelings, 1009 /* text[] */)}, ${w.templateId})`;
  return id;
}

async function insertExercise(tx: Tx, workoutId: string, exerciseId: string, position: number, grip: string | null, note: string | null) {
  const id = randomUUID();
  await tx`INSERT INTO workout_exercise ${tx({ id, workout_id: workoutId, exercise_id: exerciseId, position, grip, note })}`;
  return id;
}

/** Library tweaks: favourites, pinned rests, archived, and custom exercises of every kind. */
async function setUpExercises(tx: Tx, uid: string) {
  await seedExercises(tx, uid);
  await tx`UPDATE exercise SET rest_seconds = ${DEFAULT_REST} WHERE user_id = ${uid} AND NOT rest_custom`;
  await tx`UPDATE exercise SET favorite = true WHERE user_id = ${uid}
           AND name IN ('Barbell Bench Press', 'Back Squat', 'Deadlift', 'Lat Pulldown')`;
  for (const [name, seconds] of [['Deadlift', 240], ['Back Squat', 180], ['Lateral Raise', 60]] as const) {
    await tx`UPDATE exercise SET rest_seconds = ${seconds}, rest_custom = true WHERE user_id = ${uid} AND name = ${name}`;
  }
  // Chin-Up has history (archive only); Shrug has none.
  await tx`UPDATE exercise SET archived = true WHERE user_id = ${uid} AND name IN ('Chin-Up', 'Shrug')`;

  // An own photo is stored as a JPEG data URL.
  const photo = await readFile(path.resolve(import.meta.dirname, '../public/exercises/dumbbell-row.jpg'));
  const custom = (name: string, muscle_group: string, equipment: string, extra: { image?: string; grip_set?: string; is_cardio?: boolean }) => ({
    user_id: uid,
    name,
    muscle_group,
    equipment,
    is_custom: true,
    image: extra.image ?? null,
    grip_set: extra.grip_set ?? null,
    is_cardio: extra.is_cardio ?? false,
    rest_seconds: extra.is_cardio ? 0 : DEFAULT_REST,
    rest_custom: extra.is_cardio ?? false,
  });
  await tx`INSERT INTO exercise ${tx([
    custom('Landmine Press', 'chest', 'other', { image: `data:image/jpeg;base64,${photo.toString('base64')}` }),
    custom('Chest-Supported Row', 'back', 'machine', { grip_set: 'back' }),
    custom('Rowing Machine', 'cardio', 'machine', { is_cardio: true }),
    custom('Sled Push', 'full_body', 'other', {}), // no history, so it can be hard-deleted
  ])}`;
}

const sql = connect(DEV_DATABASE_URL);
try {
  await migrate(sql);
  const passwordHash = await hashPassword(PASSWORD);
  const now = today();
  const { workouts, skips } = schedule(now);

  const counts = await sql.begin(async (tx) => {
    // Workouts first: workout_exercise blocks deleting its exercise, so don't rely on cascade order.
    await tx`DELETE FROM workout WHERE user_id IN (SELECT id FROM app_user WHERE lower(username) = ${USERNAME})`;
    await tx`DELETE FROM app_user WHERE lower(username) = ${USERNAME}`;
    // Admin, so Settings → Invite a friend shows up.
    const [user] = await tx<{ id: string }[]>`
      INSERT INTO app_user (username, password_hash, is_admin) VALUES (${USERNAME}, ${passwordHash}, true) RETURNING id`;
    const uid = user!.id;
    await tx`INSERT INTO user_settings (user_id, default_rest_seconds, template_colors)
             VALUES (${uid}, ${DEFAULT_REST}, ${tx.json({ upper: '#a78bfa' })})`;
    await setUpExercises(tx, uid);

    const library = await tx<{ id: string; name: string }[]>`SELECT id, name FROM exercise WHERE user_id = ${uid}`;
    const exerciseId = new Map(library.map((e) => [e.name, e.id]));
    const idOf = (name: string) => {
      const id = exerciseId.get(name);
      if (!id) throw new Error(`Unknown exercise: ${name}`);
      return id;
    };

    const sessionsDone = new Map<string, number>();
    const setRows: Record<string, unknown>[] = [];
    let index = 0;
    for (const { date, hour, session } of workouts) {
      const startedAt = parseLocalDate(date);
      startedAt.setHours(hour, index % 45);
      const finishedAt = new Date(startedAt.getTime() + (session.minutes + index % 15) * 60_000);
      // Check-ins exist since recently: only the last two months have them, and not every workout.
      const recent = date >= addDays(now, -60);
      const checkIn = recent && index % 5 !== 4 ? CHECK_INS[index % CHECK_INS.length]! : null;
      const workoutId = await insertWorkout(tx, uid, {
        date,
        startedAt,
        finishedAt,
        title: session.title,
        templateId: session.templateId,
        notes: index % 7 === 0 ? 'Gym was quiet, kept the rests honest.' : null,
        rating: checkIn?.[0] ?? null,
        feelings: checkIn?.[1] ?? [],
      });
      // Every third Lower body ends with some treadmill.
      const lifts = session === LOWER && index % 3 === 0 ? [...session.lifts, cardio('Treadmill', 10 * 60, 8, 2)] : session.lifts;
      for (const [position, l] of lifts.entries()) {
        const n = sessionsDone.get(l.name) ?? 0;
        sessionsDone.set(l.name, n + 1);
        const note = position === 0 && index % 6 === 0 ? 'Left shoulder a bit tight, kept the elbows tucked.' : null;
        const grip = l.grips ? l.grips[n % l.grips.length]! : null;
        const weId = await insertExercise(tx, workoutId, idOf(l.name), position, grip, note);
        setsFor(l, n, position === 0, position === lifts.length - 1).forEach((s, p) =>
          setRows.push({
            id: randomUUID(),
            workout_exercise_id: weId,
            position: p,
            set_type: s.type,
            weight_kg: s.kg,
            reps: s.reps,
            speed_kmh: s.speed ?? null,
            incline_pct: s.incline ?? null,
            completed: true,
            auto_fill: 0,
          }),
        );
      }
      index++;
    }

    // A workout in progress: some sets done, the rest prefilled but open. Discard it in the app to get
    // the "Start workout" state back; re-seeding restores it.
    const startedAt = new Date(Date.now() - 35 * 60_000);
    const activeId = await insertWorkout(tx, uid, { date: now, startedAt, finishedAt: null, title: 'Push day', templateId: null, notes: null, rating: null, feelings: [] });
    const open = (we: string, position: number, kg: number | null, reps: number | null, done: boolean) =>
      setRows.push({
        id: randomUUID(),
        workout_exercise_id: we,
        position,
        set_type: 'normal',
        weight_kg: kg,
        reps,
        speed_kmh: null,
        incline_pct: null,
        completed: done,
        // bit 1 = weight, bit 2 = reps: dimmed until edited
        auto_fill: !done && kg !== null ? 3 : 0,
      });
    const bench = await insertExercise(tx, activeId, idOf('Barbell Bench Press'), 0, null, 'Pause on the chest');
    open(bench, 0, 110, 8, true);
    open(bench, 1, 110, 8, true);
    open(bench, 2, 110, 8, false);
    const pulldown = await insertExercise(tx, activeId, idOf('Lat Pulldown'), 1, 'wide', null);
    open(pulldown, 0, 52.5, 10, false);
    open(pulldown, 1, null, null, false);
    const treadmill = await insertExercise(tx, activeId, idOf('Treadmill'), 2, null, null);
    open(treadmill, 0, null, null, false);

    await tx`INSERT INTO workout_set ${tx(setRows as never[])}`;
    for (const s of skips) await tx`INSERT INTO skip ${tx({ user_id: uid, ...s })}`;
    return { workouts: workouts.length, sets: setRows.length, skips: skips.length };
  });
  console.log(`Seeded "${USERNAME}" / "${PASSWORD}": ${counts.workouts} finished workouts + 1 active, ${counts.sets} sets, ${counts.skips} skips.`);
} finally {
  await sql.end();
}
