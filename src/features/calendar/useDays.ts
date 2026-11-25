import type { Rating } from '../../domain/checkIn';
import { datesBetween, type DayStatus } from '../../domain/calendar';
import { useDbQuery } from '../../hooks/useDbQuery';
import { workoutsBetween } from '../../repositories/workouts';

export type DayInfo = {
  date: string;
  status: DayStatus;
  workouts: { id: string; title: string; notes: { name: string; note: string }[] }[];
  /** Optional mood mark: the day's last rated workout. */
  mood: Rating | null;
};

/** Status of every day in [from, to]. */
export function useDays(from: string, to: string): DayInfo[] | undefined {
  return useDbQuery(async () => {
    const workouts = await workoutsBetween(from, to);
    return datesBetween(from, to).map((date): DayInfo => {
      const ws = workouts.filter((w) => w.date === date);
      return {
        date,
        workouts: ws,
        mood: ws.findLast((w) => w.rating)?.rating ?? null,
        status: ws.length ? 'done' : 'rest',
      };
    });
  }, [from, to], { key: 'days' });
}
