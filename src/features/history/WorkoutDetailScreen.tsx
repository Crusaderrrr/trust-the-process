import { Link, Navigate, useNavigate, useParams } from 'react-router';
import ExerciseThumb from '../../components/ExerciseThumb';
import Icon from '../../components/Icon';
import { BackButton, btn, card, Stat } from '../../components/ui';
import { FEELING_NAMES, RATING_COLOR, RATING_NAMES } from '../../domain/checkIn';
import { formatSet, formatWeight, setLabels } from '../../domain/sets';
import { formatDuration, summarize } from '../../domain/workout';
import { useDbQuery } from '../../hooks/useDbQuery';
import { GRIP_NAMES } from '../../repositories/exercises';
import { deleteWorkout, getWorkout } from '../../repositories/workouts';
import { SET_TYPE_COLOR } from '../workout/SetRow';
import WorkoutEditor from '../workout/WorkoutEditor';
import { formatDate } from './HistoryScreen';

function useWorkoutParam() {
  const id = useParams().id ?? '';
  return useDbQuery(() => getWorkout(id), [id]);
}

export function WorkoutDetailScreen() {
  const navigate = useNavigate();
  const w = useWorkoutParam();
  if (w === undefined) return null;
  if (w === null) return <Navigate to="/history" replace />;
  if (!w.finishedAt) return <Navigate to="/workout" replace />;

  const summary = summarize(w.exercises.flatMap((e) => e.sets));

  return (
    <div className="flex flex-col gap-4">
      <BackButton />
      <div>
        <p className="text-sm font-medium text-green-500">{formatDate(w.date)}</p>
        <h1 className="text-[28px] leading-tight font-bold tracking-tight">{w.title}</h1>
      </div>
      <div className={`${card} grid grid-cols-3 gap-2 p-3 text-center`}>
        <Stat icon="clock" label="Duration" value={formatDuration((Date.parse(w.finishedAt) - Date.parse(w.startedAt)) / 1000)} />
        <Stat icon="weight" label="Volume" value={`${formatWeight(summary.volume)} kg`} />
        <Stat icon="sets" label="Sets" value={String(summary.sets)} />
      </div>
      {w.rating && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <span className="flex items-center gap-2 rounded-full bg-neutral-800 px-3 py-1.5 text-sm font-medium">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: RATING_COLOR[w.rating] }} />
            {RATING_NAMES[w.rating]}
          </span>
          {w.feelings.map((f) => (
            <span key={f} className="rounded-full bg-neutral-800 px-3 py-1.5 text-sm text-neutral-300">
              {FEELING_NAMES[f]}
            </span>
          ))}
        </div>
      )}
      {w.notes && <p className="px-1 whitespace-pre-wrap text-neutral-300">{w.notes}</p>}

      {w.exercises.map((we) => {
        const labels = setLabels(we.sets.map((s) => s.setType));
        return (
          <section key={we.id} className={`${card} p-3`}>
            <Link to={`/exercises/${we.exerciseId}`} className="flex items-center gap-3">
              <ExerciseThumb image={we.image} muscleGroup={we.muscleGroup} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-green-500">{we.name}</span>
                {we.grip && <span className="text-sm text-neutral-400">{GRIP_NAMES[we.grip]} grip</span>}
              </span>
              <Icon name="chevronRight" className="h-5 w-5 text-neutral-600" />
            </Link>
            {we.note && <p className="mt-2 px-1 text-sm text-neutral-400">{we.note}</p>}
            <ul className="mt-3 flex flex-col gap-1">
              {we.sets.map((s, i) => (
                <li key={s.id} className="flex items-center gap-3 rounded-lg bg-neutral-800/50 px-3 py-1.5 text-sm">
                  <span className={`w-5 text-center font-bold ${SET_TYPE_COLOR[s.setType]}`}>{labels[i]}</span>
                  <span className="tabular-nums">{formatSet(s, !!we.isCardio)}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <div className="grid grid-cols-2 gap-2">
        <Link to={`/history/${w.id}/edit`} className={btn.secondary}>
          <Icon name="edit" className="h-5 w-5" />
          Edit
        </Link>
        <button
          className={btn.danger}
          onClick={async () => {
            if (!confirm('Delete this workout? This cannot be undone.')) return;
            await deleteWorkout(w.id);
            navigate('/history', { replace: true });
          }}
        >
          <Icon name="delete" className="h-5 w-5" />
          Delete
        </button>
      </div>
    </div>
  );
}

export function EditWorkoutScreen() {
  const w = useWorkoutParam();
  if (w === undefined) return null;
  if (w === null) return <Navigate to="/history" replace />;
  if (!w.finishedAt) return <Navigate to="/workout" replace />;
  return <WorkoutEditor workout={w} mode="edit" />;
}
