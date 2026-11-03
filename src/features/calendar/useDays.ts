import type { Rating } from '../../domain/checkIn';
import { datesBetween, dayStatus, type DayStatus } from '../../domain/calendar';
import { useDbQuery } from '../../hooks/useDbQuery';
import { skipsBetween, type Skip } from '../../repositories/skips';
import { workoutsBetween } from '../../repositories/workouts';

export type DayInfo = {
  date: string;
  status: DayStatus;
  workouts: { id: string; title: string; notes: { name: string; note: string }[] }[];
  skip: Skip | undefined;
  /** Optional mood mark: the day's last rated workout, or the skip's rating. */
  mood: Rating | null;
};

/** Status of every day in [from, to] (SPEC §5.1). */
export function useDays(from: string, to: string): DayInfo[] | undefined {
  return useDbQuery(async () => {
    const [workouts, skips] = await Promise.all([
      workoutsBetween(from, to),
      skipsBetween(from, to),
    ]);
    return datesBetween(from, to).map((date) => {
      const ws = workouts.filter((w) => w.date === date);
      const skip = skips.find((s) => s.date === date);
      return {
        date,
        workouts: ws,
        skip,
        mood: ws.findLast((w) => w.rating)?.rating ?? skip?.rating ?? null,
        status: dayStatus({ done: ws.length > 0, skipped: !!skip }),
      };
    });
  }, [from, to]);
}
