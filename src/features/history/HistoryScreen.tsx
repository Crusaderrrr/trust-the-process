import { Link } from 'react-router';
import Icon from '../../components/Icon';
import { card, PageHeader } from '../../components/ui';
import { parseLocalDate } from '../../domain/dates';
import { prCountByWorkout } from '../../domain/progress';
import { formatWeight } from '../../domain/sets';
import { formatDuration } from '../../domain/workout';
import { useDbQuery } from '../../hooks/useDbQuery';
import { GRIP_NAMES } from '../../repositories/exercises';
import { sessionsByExercise } from '../../repositories/progress';
import { listHistory } from '../../repositories/workouts';
import TonnageChart from './TonnageChart';

export const formatDate = (date: string) =>
  parseLocalDate(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

export default function HistoryScreen() {
  const data = useDbQuery(async () => {
    const [items, sessions] = await Promise.all([listHistory(), sessionsByExercise()]);
    return { items, prs: prCountByWorkout([...sessions.values()]) };
  }, [], { key: 'history' });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="History" subtitle={data ? `${data.items.length} workouts` : undefined} />
      {data?.items.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-neutral-500">
          <Icon name="history" className="h-12 w-12 text-neutral-700" />
          No workouts yet. Finished workouts show up here.
        </div>
      )}
      {data && data.items.length > 0 && <TonnageChart workouts={data.items} />}
      {data?.items.map((w) => {
        const prs = data.prs.get(w.id) ?? 0;
        return (
          <Link key={w.id} to={`/history/${w.id}`} className={`${card} flex flex-col gap-3 p-4 active:bg-neutral-800`}>
            <div>
              <h2 className="truncate text-lg font-semibold">{w.title}</h2>
              <p className="text-sm text-neutral-400">{formatDate(w.date)}</p>
            </div>
            <div className="flex gap-4 text-sm text-neutral-300">
              <span className="flex items-center gap-1.5">
                <Icon name="clock" className="h-4 w-4 text-neutral-500" />
                {formatDuration((Date.parse(w.finishedAt!) - Date.parse(w.startedAt)) / 1000)}
              </span>
              <span className="flex items-center gap-1.5">
                <Icon name="weight" className="h-4 w-4 text-neutral-500" />
                {formatWeight(w.volume)} kg
              </span>
              {prs > 0 && (
                <span className="flex items-center gap-1.5 text-amber-400">
                  <Icon name="trophy" className="h-4 w-4" />
                  {prs} PR{prs > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <ul className="flex flex-col gap-1 border-t border-white/[0.06] pt-3 text-sm text-neutral-400">
              {w.exercises.slice(0, 5).map((e, i) => (
                <li key={i} className="truncate">
                  <span className="font-medium text-neutral-200">{e.sets} ×</span> {e.name}
                  {e.grip && <span className="text-neutral-500"> · {GRIP_NAMES[e.grip]}</span>}
                </li>
              ))}
              {w.exercises.length > 5 && <li>+{w.exercises.length - 5} more</li>}
            </ul>
          </Link>
        );
      })}
    </div>
  );
}
