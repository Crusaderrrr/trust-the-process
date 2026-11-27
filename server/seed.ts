import type { Sql, Tx } from './db.js';

// The exercise library every new account starts with (copied per user, so favourites, rest, grip,
// photo and archive state stay per account). Pictures and instructions come from the catalog (catalog.ts).
// [name, muscle group, equipment, catalog id, grip set]
const LIBRARY: [string, string, string, string, ('back' | 'triceps')?][] = [
  ['Barbell Bench Press', 'chest', 'barbell', 'bench-press'],
  ['Incline Barbell Bench Press', 'chest', 'barbell', 'incline-bench-press'],
  ['Dumbbell Bench Press', 'chest', 'dumbbell', 'db-bench-press'],
  ['Incline Dumbbell Press', 'chest', 'dumbbell', 'incline-db-press'],
  ['Dumbbell Fly', 'chest', 'dumbbell', 'db-fly'],
  ['Cable Crossover', 'chest', 'cable', 'cable-fly'],
  ['Chest Press Machine', 'chest', 'machine', 'chest-press-machine'],
  ['Push-Up', 'chest', 'bodyweight', 'push-up'],
  ['Dip', 'chest', 'bodyweight', 'dips'],
  ['Deadlift', 'back', 'barbell', 'deadlift'],
  ['Barbell Row', 'back', 'barbell', 'barbell-row'],
  ['Dumbbell Row', 'back', 'dumbbell', 'single-arm-db-row'],
  ['Pull-Up', 'back', 'bodyweight', 'pull-up', 'back'],
  ['Chin-Up', 'back', 'bodyweight', 'chin-ups'],
  ['Lat Pulldown', 'back', 'cable', 'lat-pulldown', 'back'],
  ['Seated Cable Row', 'back', 'cable', 'seated-cable-row', 'back'],
  ['T-Bar Row', 'back', 'barbell', 't-bar-row', 'back'],
  ['Face Pull', 'shoulders', 'cable', 'face-pull'],
  ['Overhead Press', 'shoulders', 'barbell', 'ohp'],
  ['Seated Dumbbell Shoulder Press', 'shoulders', 'dumbbell', 'dumbbell-shoulder-press'],
  ['Lateral Raise', 'shoulders', 'dumbbell', 'lateral-raise'],
  ['Cable Lateral Raise', 'shoulders', 'cable', 'cable-lateral-raise'],
  ['Rear Delt Fly', 'shoulders', 'dumbbell', 'rear-delt-fly'],
  ['Shrug', 'shoulders', 'dumbbell', 'db-shrug'],
  ['Barbell Curl', 'biceps', 'barbell', 'barbell-curl'],
  ['Dumbbell Curl', 'biceps', 'dumbbell', 'bicep-curl'],
  ['Hammer Curl', 'biceps', 'dumbbell', 'hammer-curl'],
  ['Preacher Curl', 'biceps', 'machine', 'machine-preacher-curl'],
  ['Cable Curl', 'biceps', 'cable', 'cable-curl'],
  ['Triceps Pushdown', 'triceps', 'cable', 'tricep-pushdown', 'triceps'],
  ['Overhead Triceps Extension', 'triceps', 'cable', 'cable-overhead-tricep-extension', 'triceps'],
  ['Skull Crusher', 'triceps', 'barbell', 'skull-crusher'],
  ['Close-Grip Bench Press', 'triceps', 'barbell', 'close-grip-bench-press'],
  ['Back Squat', 'legs', 'barbell', 'squat'],
  ['Front Squat', 'legs', 'barbell', 'front-squat'],
  ['Leg Press', 'legs', 'machine', 'leg-press'],
  ['Romanian Deadlift', 'legs', 'barbell', 'romanian-deadlift'],
  ['Bulgarian Split Squat', 'legs', 'dumbbell', 'bulgarian-split-squat'],
  ['Walking Lunge', 'legs', 'dumbbell', 'walking-lunge'],
  ['Leg Extension', 'legs', 'machine', 'leg-extension'],
  ['Lying Leg Curl', 'legs', 'machine', 'leg-curl'],
  ['Seated Leg Curl', 'legs', 'machine', 'seated-leg-curl'],
  ['Standing Calf Raise', 'legs', 'machine', 'standing-calf-raise'],
  ['Seated Calf Raise', 'legs', 'machine', 'seated-calf-raise'],
  ['Hip Thrust', 'glutes', 'barbell', 'hip-thrust'],
  ['Cable Kickback', 'glutes', 'cable', 'cable-kickback'],
  ['Hip Abduction Machine', 'glutes', 'machine', 'hip-abduction'],
  ['Plank', 'core', 'bodyweight', 'plank'],
  ['Hanging Leg Raise', 'core', 'bodyweight', 'hanging-leg-raise'],
  ['Cable Crunch', 'core', 'cable', 'cable-crunch'],
  ['Ab Wheel Rollout', 'core', 'other', 'ab-wheel-rollout'],
  ['Kettlebell Swing', 'full_body', 'kettlebell', 'kettlebell-swing'],
];

export const DEFAULT_REST_SECONDS = 120;

const GRIPS = {
  back: ['wide', 'normal', 'narrow', 'parallel_wide', 'parallel_normal'],
  triceps: ['rope', 'v_bar', 'straight_bar', 'single_hand'],
};

/** Library name → catalog id. */
export const CORE_CATALOG_IDS = new Map<string, string>([
  ...LIBRARY.map(([name, , , id]) => [name.toLowerCase(), id] as const),
  ['treadmill', 'treadmill-running'],
]);

/** Names people give their own exercises → the catalog entry meant. Exact catalog names need no entry. */
export const NAME_ALIASES = new Map<string, string>([
  ['butterfly', 'pec-deck'],
  ['pec dec', 'pec-deck'],
  ['pec deck machine', 'pec-deck'],
]);

/** Catalog entries not added as exercises: grip / attachment variants the app picks per logged set. */
export const SKIPPED_CATALOG_IDS = new Set([
  'close-grip-lat-pulldown',
  'v-bar-lat-pulldown',
  'reverse-grip-lat-pulldown',
  'behind-the-neck-lat-pulldown',
  'wide-grip-pull-ups',
  'close-grip-pull-ups',
  'neutral-grip-pull-ups',
  'wide-grip-seated-cable-row',
  'v-bar-tricep-pushdown',
  'single-arm-tricep-pushdown',
]);

export async function seedExercises(tx: Sql | Tx, userId: number | string): Promise<void> {
  const rows = LIBRARY.map(([name, muscle_group, equipment, , gripSet]) => ({
    user_id: userId,
    name,
    muscle_group,
    equipment,
    grips: gripSet ? GRIPS[gripSet] : null,
    rest_seconds: DEFAULT_REST_SECONDS,
  }));
  await tx`INSERT INTO exercise ${tx(rows, 'user_id', 'name', 'muscle_group', 'equipment', 'grips', 'rest_seconds')}`;
  // Cardio: sets log time / speed / incline; rest timer off by default.
  await tx`INSERT INTO exercise (user_id, name, muscle_group, equipment, is_cardio, rest_seconds, rest_custom)
           VALUES (${userId}, 'Treadmill', 'cardio', 'machine', true, 0, true)`;
}
