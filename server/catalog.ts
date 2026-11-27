// The exercise catalog (RepDB free tier): imported from the downloaded archive into shared tables, then
// linked to / copied into every account's library. Its licence allows in-app use only, so none of it is in git.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { Sql, Tx } from './db.js';
import type { EQUIPMENT, MUSCLE_GROUPS } from './routes/util.js';
import { CORE_CATALOG_IDS, DEFAULT_REST_SECONDS, NAME_ALIASES, SKIPPED_CATALOG_IDS } from './seed.js';

const record = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name_en: z.string(),
  description_en: z.string(),
  category: z.string(),
  equipment: z.string().nullish(),
  variation_group: z.string().nullish(),
  primary_muscles: z.array(z.string()),
  secondary_muscles: z.array(z.string()).default([]),
  instructions_en: z.array(z.string()),
  tips_en: z.array(z.string()).default([]),
  images: z.object({ flat: z.object({ start: z.string().optional(), peak: z.string().optional(), main: z.string().optional() }) }),
});

export type CatalogData = {
  name: string;
  description: string;
  category: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string | null;
  variationGroup: string | null;
  instructions: string[];
  tips: string[];
  /** catalog_image names; either start (+ peak) or main. */
  images: { start?: string; peak?: string; main?: string };
};

type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
type Equipment = (typeof EQUIPMENT)[number];

const MUSCLES: Record<string, MuscleGroup> = {
  pectoralis_major: 'chest',
  serratus_anterior: 'chest',
  latissimus_dorsi: 'back',
  rhomboids: 'back',
  trapezius: 'back',
  erector_spinae: 'back',
  anterior_deltoid: 'shoulders',
  lateral_deltoid: 'shoulders',
  posterior_deltoid: 'shoulders',
  supraspinatus: 'shoulders',
  infraspinatus_teres_minor: 'shoulders',
  biceps_brachii: 'biceps',
  brachialis: 'biceps',
  brachioradialis: 'biceps',
  forearms: 'biceps',
  forearm_flexors: 'biceps',
  forearm_extensors: 'biceps',
  triceps_brachii: 'triceps',
  quadriceps: 'legs',
  hamstrings: 'legs',
  gastrocnemius: 'legs',
  soleus: 'legs',
  tibialis_anterior: 'legs',
  adductors: 'legs',
  hip_flexors: 'legs',
  gluteus_maximus: 'glutes',
  gluteus_medius: 'glutes',
  abductors: 'glutes',
  rectus_abdominis: 'core',
  obliques: 'core',
  transverse_abdominis: 'core',
  quadratus_lumborum: 'core',
};

export function toMuscleGroup(primary: string[], category: string): MuscleGroup {
  if (category === 'cardio') return 'cardio';
  if (category === 'olympic' || category === 'plyometrics') return 'full_body';
  return MUSCLES[primary[0] ?? ''] ?? 'full_body';
}

const MACHINES = ['leg_press', 'smith_machine', 'hack_squat', 'leg_curl', 'leg_extension', 'pec_deck', 'rower',
  'treadmill', 'elliptical', 'stationary_bike', 'stair_climber', 'ski_erg', 'air_bike'];

export function toEquipment(equipment: string | null): Equipment {
  if (!equipment || ['pull_up_bar', 'rings', 'dip_station'].includes(equipment)) return 'bodyweight';
  if (['barbell', 'ez_bar', 'trap_bar'].includes(equipment)) return 'barbell';
  if (equipment === 'dumbbell' || equipment === 'kettlebell' || equipment === 'cable') return equipment;
  return equipment.endsWith('_machine') || MACHINES.includes(equipment) ? 'machine' : 'other';
}

export const catalogImageUrl = (name: string) => `/api/catalog/images/${name}`;
const picture = (d: CatalogData) => {
  const name = d.images.start ?? d.images.main;
  return name ? catalogImageUrl(name) : null;
};

/** Reads exercises.json and the images from the dataset folder into the catalog, then syncs every account. */
export async function importCatalog(sql: Sql, dir: string): Promise<{ exercises: number; images: number }> {
  const json: unknown = JSON.parse(await readFile(path.join(dir, 'exercises.json'), 'utf8'));
  const { exercises } = z.object({ exercises: z.array(record) }).parse(json);

  // Database name → file. basename() keeps a crafted path inside the dataset folder.
  const files = new Map<string, string>();
  const rows = exercises.map((e) => {
    const images: CatalogData['images'] = {};
    for (const pose of ['start', 'peak', 'main'] as const) {
      const file = e.images.flat[pose];
      if (!file) continue;
      const name = path.basename(file);
      images[pose] = name;
      files.set(name, path.join(dir, 'images', 'flat', name));
    }
    const data: CatalogData = {
      name: e.name_en,
      description: e.description_en,
      category: e.category,
      primaryMuscles: e.primary_muscles,
      secondaryMuscles: e.secondary_muscles,
      equipment: e.equipment ?? null,
      variationGroup: e.variation_group ?? null,
      instructions: e.instructions_en,
      tips: e.tips_en,
      images,
    };
    return { id: e.id, data };
  });
  for (const [folder, prefix] of [['muscles', 'muscle-'], ['equipment', 'equipment-']] as const) {
    for (const file of await readdir(path.join(dir, 'images', folder))) {
      if (file.endsWith('.webp')) files.set(prefix + file, path.join(dir, 'images', folder, file));
    }
  }

  await sql.begin(async (tx) => {
    for (const r of rows) {
      await tx`INSERT INTO catalog_exercise (id, data) VALUES (${r.id}, ${tx.json(r.data)})
               ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`;
    }
    for (const [name, file] of files) {
      await tx`INSERT INTO catalog_image (name, bytes) VALUES (${name}, ${await readFile(file)})
               ON CONFLICT (name) DO UPDATE SET bytes = EXCLUDED.bytes`;
    }
  });
  await syncLibrary(sql);
  return { exercises: rows.length, images: files.size };
}

const loadCatalog = (sql: Sql | Tx) => sql<{ id: string; data: CatalogData }[]>`SELECT id, data FROM catalog_exercise ORDER BY id`;

/**
 * Brings one account up to date with the catalog; safe to repeat, does nothing while the catalog is empty.
 * A row gets the catalog picture only when it is first linked (replacing any own photo, the owner's choice),
 * so a photo added later stays.
 */
export async function syncUser(sql: Sql | Tx, userId: number | string, catalog?: Awaited<ReturnType<typeof loadCatalog>>) {
  const entries = catalog ?? (await loadCatalog(sql));
  if (!entries.length) return;
  const byId = new Map(entries.map((e) => [e.id, e.data]));
  const byName = new Map(entries.map((e) => [e.data.name.toLowerCase(), e.id]));

  const own = await sql<{ id: string; name: string; is_custom: boolean; catalog_id: string | null }[]>`
    SELECT id, name, is_custom, catalog_id FROM exercise WHERE user_id = ${userId}`;
  const linked = new Set(own.flatMap((r) => r.catalog_id ?? []));
  for (const row of own) {
    if (row.catalog_id) continue;
    const key = row.name.toLowerCase();
    const id = row.is_custom ? (NAME_ALIASES.get(key) ?? byName.get(key)) : CORE_CATALOG_IDS.get(key);
    const data = id ? byId.get(id) : undefined;
    if (!id || !data) continue;
    await sql`UPDATE exercise SET catalog_id = ${id}, image = ${picture(data)} WHERE id = ${row.id}`;
    linked.add(id);
  }

  const [settings] = await sql<{ default_rest_seconds: number }[]>`
    SELECT default_rest_seconds FROM user_settings WHERE user_id = ${userId}`;
  const rest = settings?.default_rest_seconds ?? DEFAULT_REST_SECONDS;
  const missing = entries
    .filter((e) => !linked.has(e.id) && !SKIPPED_CATALOG_IDS.has(e.id))
    .map(({ id, data }) => {
      const cardio = data.category === 'cardio';
      return {
        user_id: userId,
        name: data.name,
        muscle_group: toMuscleGroup(data.primaryMuscles, data.category),
        equipment: toEquipment(data.equipment),
        image: picture(data),
        catalog_id: id,
        is_cardio: cardio,
        rest_seconds: cardio ? 0 : rest,
        rest_custom: cardio,
      };
    });
  // A name the account already uses (archived rows included) wins over the catalog entry.
  if (missing.length) await sql`INSERT INTO exercise ${sql(missing)} ON CONFLICT DO NOTHING`;
}

export async function syncLibrary(sql: Sql): Promise<void> {
  const catalog = await loadCatalog(sql);
  for (const { id } of await sql<{ id: string }[]>`SELECT id FROM app_user`) {
    await sql.begin((tx) => syncUser(tx, id, catalog));
  }
}
