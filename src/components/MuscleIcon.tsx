import type { MuscleGroup } from '../repositories/exercises';

// Body figure with the trained muscle group highlighted. Derived from muscle_group, drawn
// inline so it works offline and needs no image assets. Back, triceps and glutes use a rear
// view (one solid back shape instead of pecs + abs) so they read differently from the front.
type Part = 'pecs' | 'abs' | 'back' | 'lowBack' | 'delts' | 'upperArms' | 'forearms' | 'glutes' | 'thighs' | 'calves';

const HIGHLIGHT: Record<MuscleGroup, Part[]> = {
  chest: ['pecs'],
  back: ['back', 'lowBack'],
  shoulders: ['delts'],
  biceps: ['upperArms'],
  triceps: ['upperArms'],
  legs: ['thighs', 'calves'],
  glutes: ['glutes'],
  core: ['abs'],
  full_body: ['pecs', 'abs', 'delts', 'upperArms', 'forearms', 'glutes', 'thighs', 'calves'],
  cardio: ['pecs', 'abs', 'delts', 'upperArms', 'forearms', 'glutes', 'thighs', 'calves'],
};
const REAR: MuscleGroup[] = ['back', 'triceps', 'glutes'];

const ON = '#b6ed5d';
const OFF = '#74807a';

export default function MuscleIcon({ group, size = 44 }: { group: MuscleGroup; size?: number }) {
  const lit = new Set(HIGHLIGHT[group]);
  const fill = (p: Part) => (lit.has(p) ? ON : OFF);
  const rear = REAR.includes(group);

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-neutral-800"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="6 0 28 50" width={size * 0.9} height={size * 0.9}>
        <circle cx="20" cy="5" r="3.8" fill={OFF} />
        {rear ? (
          <>
            <path d="M13.2 10.5 H26.8 L24.8 24 H15.2 Z" fill={fill('back')} strokeLinejoin="round" />
            <rect x="15.5" y="24.6" width="9" height="2.6" rx="1.2" fill={fill('lowBack')} />
          </>
        ) : (
          <>
            <rect x="13.6" y="10.6" width="6" height="6.2" rx="2" fill={fill('pecs')} />
            <rect x="20.4" y="10.6" width="6" height="6.2" rx="2" fill={fill('pecs')} />
            <rect x="15.2" y="17.6" width="9.6" height="9.4" rx="2" fill={fill('abs')} />
          </>
        )}
        <circle cx="11.4" cy="12.4" r="2.7" fill={fill('delts')} />
        <circle cx="28.6" cy="12.4" r="2.7" fill={fill('delts')} />
        <rect x="9" y="15" width="3.6" height="7" rx="1.8" fill={fill('upperArms')} />
        <rect x="27.4" y="15" width="3.6" height="7" rx="1.8" fill={fill('upperArms')} />
        <rect x="8.4" y="22.6" width="3.2" height="7" rx="1.6" fill={fill('forearms')} />
        <rect x="28.4" y="22.6" width="3.2" height="7" rx="1.6" fill={fill('forearms')} />
        <rect x="14.6" y="27.8" width="10.8" height="4" rx="2" fill={fill('glutes')} />
        <rect x="14.6" y="32.4" width="5.1" height="9" rx="2.4" fill={fill('thighs')} />
        <rect x="20.3" y="32.4" width="5.1" height="9" rx="2.4" fill={fill('thighs')} />
        <rect x="15.1" y="42.2" width="4.2" height="7.4" rx="2" fill={fill('calves')} />
        <rect x="20.7" y="42.2" width="4.2" height="7.4" rx="2" fill={fill('calves')} />
      </svg>
    </span>
  );
}
