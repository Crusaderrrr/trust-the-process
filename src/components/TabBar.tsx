import { NavLink } from 'react-router';
import Icon, { type IconName } from './Icon';

const tabs: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Today', icon: 'today' },
  { to: '/history', label: 'History', icon: 'history' },
  { to: '/calendar', label: 'Calendar', icon: 'calendar' },
  { to: '/exercises', label: 'Exercises', icon: 'dumbbell' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

/** Translucent, blurred pill; the active tab sits in a darker lens. */
export default function TabBar() {
  return (
    <nav className="pointer-events-auto relative mx-auto flex w-full max-w-md gap-1 rounded-full bg-neutral-900/60 p-1.5 ring-1 ring-white/[0.06] backdrop-blur-2xl backdrop-saturate-200 shadow-[0_12px_32px_rgba(0,0,0,0.55)]">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.to === '/'}
          className={({ isActive }) =>
            `relative flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-[11px] font-medium transition duration-200 active:scale-90 ${
              isActive
                ? 'bg-black/50 text-green-400'
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
