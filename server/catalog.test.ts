import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { importCatalog, syncLibrary, toEquipment, toMuscleGroup } from './catalog.js';
import { migrate, type Sql } from './db.js';
import { seedExercises } from './seed.js';
import { tempSchema } from './test-db.js';

let sql: Sql;
let drop: () => Promise<void>;
let dir: string;
let uid: string;

const entry = (id: string, name: string, over: object = {}) => ({
  id,
  name_en: name,
  description_en: 'About it.',
  category: 'strength',
  equipment: 'cable',
  primary_muscles: ['latissimus_dorsi'],
  secondary_muscles: [],
  instructions_en: ['Pull.'],
  tips_en: [],
  images: { flat: { start: `images/flat/${id}-start.webp`, peak: `images/flat/${id}-peak.webp` } },
  ...over,
});

const entries = [
  entry('lat-pulldown', 'Lat Pulldown'),
  entry('close-grip-lat-pulldown', 'Close Grip Lat Pulldown'),
  entry('pec-deck', 'Pec Deck', { equipment: 'pec_deck', primary_muscles: ['pectoralis_major'] }),
  entry('straight-arm-pulldown', 'Straight-Arm Pulldown'),
  entry('treadmill-running', 'Treadmill Running', { category: 'cardio', equipment: 'treadmill' }),
];

const addUser = async (username: string): Promise<string> =>
  (await sql<{ id: string }[]>`INSERT INTO app_user (username, password_hash) VALUES (${username}, 'x') RETURNING id`)[0]!.id;

const row = async (name: string) =>
  (await sql`SELECT * FROM exercise WHERE user_id = ${uid} AND name = ${name}`)[0];

beforeAll(async () => {
  ({ sql, drop } = await tempSchema());
  await migrate(sql);

  dir = await mkdtemp(path.join(tmpdir(), 'repdb-'));
  for (const folder of ['flat', 'muscles', 'equipment']) await mkdir(path.join(dir, 'images', folder), { recursive: true });
  await writeFile(path.join(dir, 'exercises.json'), JSON.stringify({ exercises: entries }));
  for (const e of entries) {
    for (const file of Object.values(e.images.flat)) await writeFile(path.join(dir, file as string), 'img');
  }
  await writeFile(path.join(dir, 'images', 'muscles', 'latissimus-dorsi.webp'), 'img');
  await writeFile(path.join(dir, 'images', 'equipment', 'cable.webp'), 'img');

  uid = await addUser('ann');
  await seedExercises(sql, uid);
  // An existing account: an own photo on a built-in, a hand-made pec deck, and a name the catalog also has.
  await sql`UPDATE exercise SET image = 'data:image/jpeg;base64,own' WHERE user_id = ${uid} AND name = 'Lat Pulldown'`;
  await sql`INSERT INTO exercise (user_id, name, muscle_group, equipment, is_custom, image, rest_seconds)
            VALUES (${uid}, 'Butterfly', 'chest', 'machine', true, 'data:image/jpeg;base64,own', 90)`;
  expect(await importCatalog(sql, dir)).toEqual({ exercises: 5, images: 12 });
});
afterAll(async () => {
  await drop();
  await rm(dir, { recursive: true, force: true });
});

describe('catalog sync', () => {
  it('links built-ins and replaces their picture', async () => {
    expect(await row('Lat Pulldown')).toMatchObject({
      catalog_id: 'lat-pulldown',
      image: '/api/catalog/images/lat-pulldown-start.webp',
      is_custom: false,
    });
    expect(await row('Treadmill')).toMatchObject({ catalog_id: 'treadmill-running' });
  });

  it('links a custom "Butterfly" to the pec deck instead of adding a duplicate', async () => {
    expect(await row('Butterfly')).toMatchObject({
      catalog_id: 'pec-deck',
      image: '/api/catalog/images/pec-deck-start.webp',
      rest_seconds: 90,
    });
    expect(await row('Pec Deck')).toBeUndefined();
  });

  it('adds the missing entries once, without the grip variants', async () => {
    expect(await row('Straight-Arm Pulldown')).toMatchObject({ muscle_group: 'back', equipment: 'cable', is_custom: false });
    expect(await row('Close Grip Lat Pulldown')).toBeUndefined();
    expect(await row('Treadmill Running')).toBeUndefined();
    const count = async () => (await sql`SELECT 1 FROM exercise WHERE user_id = ${uid}`).length;
    const before = await count();
    await syncLibrary(sql);
    expect(await count()).toBe(before);
  });

  it('leaves a photo added after linking, and does not bring back archived rows', async () => {
    await sql`UPDATE exercise SET image = 'data:image/jpeg;base64,later' WHERE user_id = ${uid} AND name = 'Butterfly'`;
    await sql`UPDATE exercise SET archived = true WHERE user_id = ${uid} AND name = 'Straight-Arm Pulldown'`;
    await importCatalog(sql, dir);
    expect(await row('Butterfly')).toMatchObject({ image: 'data:image/jpeg;base64,later' });
    expect((await sql`SELECT 1 FROM exercise WHERE user_id = ${uid} AND name = 'Straight-Arm Pulldown'`).length).toBe(1);
  });

  it('keeps an own exercise that already uses a catalog name', async () => {
    const id = await addUser('bob');
    await sql`INSERT INTO exercise (user_id, name, muscle_group, equipment, is_custom, rest_seconds)
              VALUES (${id}, 'straight-arm pulldown', 'chest', 'other', true, 60)`;
    await syncLibrary(sql);
    const rows = await sql`SELECT * FROM exercise WHERE user_id = ${id} AND lower(name) = 'straight-arm pulldown'`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ is_custom: true, muscle_group: 'chest', catalog_id: 'straight-arm-pulldown' });
  });
});

describe('dataset mapping', () => {
  it('maps muscles and equipment to the app categories', () => {
    expect(toMuscleGroup(['rhomboids'], 'strength')).toBe('back');
    expect(toMuscleGroup(['quadriceps'], 'olympic')).toBe('full_body');
    expect(toMuscleGroup(['hamstrings'], 'cardio')).toBe('cardio');
    expect(toEquipment(null)).toBe('bodyweight');
    expect(toEquipment('ez_bar')).toBe('barbell');
    expect(toEquipment('hip_thrust_machine')).toBe('machine');
    expect(toEquipment('plates')).toBe('other');
  });
});
