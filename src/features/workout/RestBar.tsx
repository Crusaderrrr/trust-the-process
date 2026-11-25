import { useEffect, useRef } from 'react';
import Icon from '../../components/Icon';
import { formatClock } from '../../domain/workout';
import { useNow } from '../../hooks/useDbQuery';
import { updateWorkout } from '../../repositories/workouts';
import { notifyTimesUp } from './notify';

/**
 * Countdown derived from the persisted rest_ends_at, so it survives reloads. The "time's up"
 * signal can only fire while the app is visible — iOS suspends background PWAs.
 */
export default function RestBar({ workoutId, endsAt }: { workoutId: string; endsAt: string }) {
  const now = useNow(250);
  const remaining = (Date.parse(endsAt) - now) / 1000;

  const fired = useRef<string | null>(null);

  useEffect(() => {
    if (remaining > 0 || document.visibilityState !== 'visible' || fired.current === endsAt) return;
    fired.current = endsAt; // ticks keep coming until the cleared value reloads
    void notifyTimesUp();
    void updateWorkout(workoutId, { restEndsAt: null });
  }, [remaining, workoutId, endsAt]);

  const shift = (s: number) =>
    updateWorkout(workoutId, { restEndsAt: new Date(Date.parse(endsAt) + s * 1000).toISOString() });

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2 rounded-2xl bg-neutral-800/95 p-2 shadow-2xl shadow-black/60 ring-1 ring-white/[0.08] backdrop-blur">
        <button className="h-11 rounded-xl bg-neutral-700/70 px-3 text-sm font-semibold" onClick={() => shift(-15)}>
          −15
        </button>
        <div className="flex flex-1 items-center justify-center gap-2">
          <Icon name="timer" className="h-6 w-6 text-green-500" />
          <span className="text-2xl font-bold tabular-nums">{formatClock(Math.ceil(remaining))}</span>
        </div>
        <button className="h-11 rounded-xl bg-neutral-700/70 px-3 text-sm font-semibold" onClick={() => shift(15)}>
          +15
        </button>
        <button
          className="inline-flex h-11 items-center gap-1 rounded-xl bg-green-500 px-3 font-semibold text-neutral-950"
          onClick={() => updateWorkout(workoutId, { restEndsAt: null })}
        >
          <Icon name="skip" className="h-5 w-5" />
          Skip
        </button>
      </div>
    </div>
  );
}
