import { NavLink } from 'react-router';
import Icon, { type IconName } from './Icon';

const tabs: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Today', icon: 'today' },
  { to: '/history', label: 'History', icon: 'history' },
  { to: '/calendar', label: 'Calendar', icon: 'calendar' },
  { to: '/exercises', label: 'Exercises', icon: 'dumbbell' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

/** Floating pill; its look and the active tab's come from the theme. */
export default function TabBar() {
  return (
    <nav className="ui-tabbar pointer-events-auto relative mx-auto flex w-full max-w-md gap-1 rounded-full p-1.5">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.to === '/'}
          className={({ isActive }) =>
            `relative flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-[11px] font-medium transition duration-200 active:scale-90 ${
              isActive ? 'ui-tab-on' : 'ui-tab'
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
