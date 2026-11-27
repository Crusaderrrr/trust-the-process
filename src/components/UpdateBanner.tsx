import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';
import Icon from './Icon';
import { btn } from './ui';

// A new version downloads in the background and waits; it takes over only when the user taps Update, so
// nothing changes under them. Registered on import, once, whichever screen is showing.
let waiting = false;
const listeners = new Set<() => void>();

const applyUpdate = registerSW({
  immediate: true,
  onNeedRefresh() {
    waiting = true;
    listeners.forEach((notify) => notify());
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    // An installed app resumed from the background doesn't look for updates by itself.
    const check = () => void registration.update().catch(() => {}); // offline: try next time
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
    setInterval(check, 60 * 60 * 1000);
  },
});

const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => void listeners.delete(notify);
};

export default function UpdateBanner() {
  const show = useSyncExternalStore(subscribe, () => waiting);
  if (!show) return null;
  return (
    // Same surface as the tab bar, so each theme styles it already.
    <div role="status" className="ui-tabbar pointer-events-auto flex items-center gap-3 rounded-full py-2 pr-2 pl-5">
      <span className="min-w-0 flex-1 text-sm font-medium">New version available</span>
      <button className={`${btn.primary} py-2! text-sm`} onClick={() => void applyUpdate(true)}>
        <Icon name="download" className="h-4 w-4" />
        Update
      </button>
    </div>
  );
}
