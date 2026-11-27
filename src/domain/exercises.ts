export const MUSCLE_GROUPS = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'legs',
  'glutes',
  'core',
  'full_body',
  'cardio',
] as const;
export const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'other'] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
export type Equipment = (typeof EQUIPMENT)[number];

/** The grips there are, grouped for picking: lat pulldown / rows vs triceps cable attachments. */
export const GRIP_SETS = {
  back: ['wide', 'normal', 'narrow', 'parallel_wide', 'parallel_normal'],
  triceps: ['rope', 'v_bar', 'straight_bar', 'single_hand'],
} as const;
export type GripSet = keyof typeof GRIP_SETS;
export type Grip = (typeof GRIP_SETS)[GripSet][number];
export const GRIP_SET_NAMES: Record<GripSet, string> = { back: 'Back', triceps: 'Triceps' };
/** Every grip, for filters over history (each set's grips are distinct). */
export const GRIPS: Grip[] = Object.values(GRIP_SETS).flat();
/** Grip used when an exercise has none logged yet; `grips` must not be empty. */
export const defaultGrip = (grips: readonly Grip[]): Grip =>
  (['normal', 'rope'] as const).find((g) => grips.includes(g)) ?? grips[0]!;
export const GRIP_NAMES: Record<Grip, string> = {
  wide: 'Wide',
  normal: 'Normal',
  narrow: 'Narrow',
  parallel_wide: 'Parallel wide',
  parallel_normal: 'Parallel normal',
  rope: 'Rope',
  v_bar: 'V-bar',
  straight_bar: 'Straight bar',
  single_hand: 'Single hand',
};

export const label = (s: string) => (s === 'full_body' ? 'Full body' : s[0]!.toUpperCase() + s.slice(1));

export type Exercise = {
  id: number;
  name: string;
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  isCustom: number;
  archived: number;
  restSeconds: number;
  /** 1 = rest set in a workout; 0 = follows the default from Settings. */
  restCustom: number;
  favorite: number;
  /** Bundled photo path or JPEG data URL; null → muscle-group icon. */
  image: string | null;
  /** Grips offered when logged; null = no grip selector. */
  grips: Grip[] | null;
  /** Logs time / speed / incline instead of kg / reps (treadmill). */
  isCardio: number;
  /** Grip used the last time this exercise was logged (grip exercises only). */
  lastGrip: Grip | null;
  /** Library entry with instructions and pictures; null for plain custom exercises. */
  catalogId: string | null;
};
