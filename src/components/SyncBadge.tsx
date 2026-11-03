import { useSyncFailing } from '../hooks/useSyncFailing';

/**
 * Shown while workout changes are waiting for the server. A pill inside the layout (bottom bars, workout
 * header), never at the very top of the screen where a notch or camera cutout can cover it.
 */
export default function SyncBadge({ className = '' }: { className?: string }) {
  if (!useSyncFailing()) return null;
  return (
    <div
      role="status"
      className={`mx-auto w-fit rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-neutral-950 shadow-lg shadow-black/40 ${className}`}
    >
      Offline — changes will sync
    </div>
  );
}
