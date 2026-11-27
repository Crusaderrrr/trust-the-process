import type { MuscleGroup } from './exercises';

/** A catalog entry as the API sends it (server/catalog.ts). */
export type CatalogEntry = {
  name: string;
  description: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string | null;
  instructions: string[];
  tips: string[];
  images: { start?: string; peak?: string; main?: string };
  /** Catalog ids of similar exercises. */
  related: string[];
};

export const catalogImage = (name: string) => `/api/catalog/images/${name}`;
const file = (id: string) => `${id.replaceAll('_', '-')}.webp`;

// id → [short name, anatomical name]
const MUSCLES: Record<string, [string, string]> = {
  abductors: ['Abductors', 'Hip Abductors'],
  adductors: ['Adductors', 'Hip Adductors'],
  anterior_deltoid: ['Front Delts', 'Anterior Deltoid'],
  biceps_brachii: ['Biceps', 'Biceps Brachii'],
  brachialis: ['Brachialis', 'Brachialis'],
  brachioradialis: ['Brachioradialis', 'Brachioradialis'],
  erector_spinae: ['Lower Back', 'Erector Spinae'],
  forearm_extensors: ['Forearm Extensors', 'Wrist Extensor Muscles'],
  forearm_flexors: ['Forearm Flexors', 'Wrist Flexor Muscles'],
  forearms: ['Forearms', 'Forearm Muscles'],
  gastrocnemius: ['Calves', 'Gastrocnemius'],
  gluteus_maximus: ['Glutes', 'Gluteus Maximus'],
  gluteus_medius: ['Glute Medius', 'Gluteus Medius'],
  hamstrings: ['Hamstrings', 'Hamstring Muscles'],
  hip_flexors: ['Hip Flexors', 'Hip Flexor Muscles'],
  infraspinatus_teres_minor: ['Infraspinatus & Teres Minor', 'Infraspinatus and Teres Minor'],
  lateral_deltoid: ['Side Delts', 'Lateral Deltoid'],
  latissimus_dorsi: ['Lats', 'Latissimus Dorsi'],
  obliques: ['Obliques', 'Oblique Abdominals'],
  pectoralis_major: ['Chest', 'Pectoralis Major'],
  posterior_deltoid: ['Rear Delts', 'Posterior Deltoid'],
  quadratus_lumborum: ['Quadratus Lumborum', 'Quadratus Lumborum'],
  quadriceps: ['Quads', 'Quadriceps Femoris'],
  rectus_abdominis: ['Abs', 'Rectus Abdominis'],
  rhomboids: ['Rhomboids', 'Rhomboid Muscles'],
  serratus_anterior: ['Serratus', 'Serratus Anterior'],
  soleus: ['Soleus', 'Soleus'],
  supraspinatus: ['Supraspinatus', 'Supraspinatus'],
  tibialis_anterior: ['Shins', 'Tibialis Anterior'],
  transverse_abdominis: ['Deep Core', 'Transversus Abdominis'],
  trapezius: ['Traps', 'Trapezius'],
  triceps_brachii: ['Triceps', 'Triceps Brachii'],
};
/** Muscles the dataset names but has no picture for. */
const NO_MUSCLE_IMAGE = new Set(['forearms', 'quadratus_lumborum', 'supraspinatus']);

const titleCase = (id: string) => id.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

export function muscleInfo(id: string): { name: string; latin: string; image: string | null } {
  const [name, latin] = MUSCLES[id] ?? [titleCase(id), ''];
  return { name, latin, image: NO_MUSCLE_IMAGE.has(id) || !MUSCLES[id] ? null : catalogImage(`muscle-${file(id)}`) };
}

// Only the names that aren't just the id in title case.
const EQUIPMENT_NAMES: Record<string, string> = {
  assisted_pullup_machine: 'Assisted Pull-Up Machine',
  bosu_ball: 'Balance Dome',
  cable: 'Cable Machine',
  ez_bar: 'EZ Curl Bar',
  hack_squat: 'Hack Squat Machine',
  plate_loaded_dip_machine: 'Plate-Loaded Dip Machine',
  plate_loaded_lateral_raise_machine: 'Plate-Loaded Lateral Raise Machine',
  plates: 'Weight Plate',
  pull_up_bar: 'Pull-Up Bar',
  rings: 'Gymnastic Rings',
};

export const equipmentInfo = (id: string) => ({
  name: EQUIPMENT_NAMES[id] ?? titleCase(id),
  image: catalogImage(`equipment-${file(id)}`),
});

const GROUP_MUSCLE: Record<MuscleGroup, string | null> = {
  chest: 'pectoralis_major',
  back: 'latissimus_dorsi',
  shoulders: 'lateral_deltoid',
  biceps: 'biceps_brachii',
  triceps: 'triceps_brachii',
  legs: 'quadriceps',
  glutes: 'gluteus_maximus',
  core: 'rectus_abdominis',
  full_body: null,
  cardio: null,
};

/** The picture standing for a whole muscle group; null → draw an icon instead. */
export const muscleGroupImage = (group: MuscleGroup): string | null => {
  const muscle = GROUP_MUSCLE[group];
  return muscle && muscleInfo(muscle).image;
};
