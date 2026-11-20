import { NavLink } from 'react-router';
import Icon, { type IconName } from './Icon';

const tabs: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Today', icon: 'today' },
  { to: '/history', label: 'History', icon: 'history' },
  { to: '/calendar', label: 'Calendar', icon: 'calendar' },
  { to: '/exercises', label: 'Exercises', icon: 'dumbbell' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

/**
 * "Liquid glass" look without the native material: a translucent, blurred and saturated pill, a bright
 * rim along the top edge, a soft sheen across the upper half, and a glowing glass lens on the active tab.
 */
export default function TabBar() {
  return (
    <nav className="pointer-events-auto relative mx-auto flex w-full max-w-md gap-1 rounded-full bg-neutral-900/60 p-1.5 ring-1 ring-white/10 backdrop-blur-2xl backdrop-saturate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(255,255,255,0.03),0_12px_32px_rgba(0,0,0,0.55)] before:pointer-events-none before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-b before:from-white/[0.06] before:via-transparent before:to-transparent">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.to === '/'}
          className={({ isActive }) =>
            `relative flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-[11px] font-medium transition duration-200 active:scale-90 ${
              isActive
                ? 'bg-gradient-to-b from-white/10 to-white/[0.03] text-green-400 ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_16px_rgba(34,197,94,0.18)]'
                : 'text-neutral-400 active:bg-white/5'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon
                name={t.icon}
                className={`h-6 w-6 transition-transform duration-200 ${isActive ? '-translate-y-px scale-110' : ''}`}
              />
              {t.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
