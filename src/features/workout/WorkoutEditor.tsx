import { useState } from 'react';
import { useNavigate } from 'react-router';
import Icon from '../../components/Icon';
import SyncBadge from '../../components/SyncBadge';
import { btn, card, input, Stat } from '../../components/ui';
import { parseLocalDate, toLocalDate } from '../../domain/dates';
import { formatWeight } from '../../domain/sets';
import { formatClock, summarize } from '../../domain/workout';
import { useNow } from '../../hooks/useDbQuery';
import {
  addExercises,
  deleteWorkout,
  finalizeWorkout,
  replaceExercise,
  updateWorkout,
  type WorkoutDetail,
} from '../../repositories/workouts';
import ExercisePicker from '../exercises/ExercisePicker';
import ExerciseCard from './ExerciseCard';
import FinishSheet, { resolvableSets } from './FinishSheet';
import ReorderSheet from './ReorderSheet';
import RestBar from './RestBar';

/**
 * The logging screen. `active`: live workout with timer, rest timer and Finish.
 * `edit`: a finished workout from History, plus date/time/duration fields.
 * Every change is written straight to the DB.
 */
export default function WorkoutEditor({ workout, mode }: { workout: WorkoutDetail; mode: 'active' | 'edit' }) {
  const navigate = useNavigate();
  const [picker, setPicker] = useState<{ replace?: string } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [reordering, setReordering] = useState(false);

  const allSets = workout.exercises.flatMap((e) => e.sets);
  const summary = summarize(allSets);

  const finish = () => {
    if (summary.sets === 0 && resolvableSets(workout).length === 0) {
      if (confirm('No sets are done yet. Discard this workout?')) discard();
      return;
    }
    setFinishing(true);
  };

  const discard = async () => {
    await deleteWorkout(workout.id);
    navigate('/', { replace: true });
  };

  // Edit mode: drop incomplete sets; an edit that leaves nothing behind offers deletion.
  const done = async () => {
    if (summary.sets === 0) {
      if (confirm('No completed sets. Delete this workout?')) {
        await deleteWorkout(workout.id);
        navigate('/history', { replace: true });
      }
      return;
    }
    await finalizeWorkout(workout.id, [], {});
    navigate(`/history/${workout.id}`, { replace: true });
  };

  return (
    // Header outside the scrolling body so it always stays on top (more reliable than
    // position: sticky in iOS standalone mode).
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b border-white/[0.06] bg-neutral-950 px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-3">
        <div className="flex items-center justify-between gap-2">
          {mode === 'active' ? (
            <button className={btn.icon} onClick={() => navigate('/')} aria-label="Minimize">
              <Icon name="chevronDown" className="h-6 w-6" />
            </button>
          ) : (
            <span className="w-10" />
          )}
          <h1 className="text-[17px] font-semibold">{mode === 'active' ? 'Log Workout' : 'Edit Workout'}</h1>
          <button
            className="inline-flex items-center gap-1.5 rounded-full bg-green-500 px-4 py-2 font-semibold text-neutral-950 active:bg-green-600"
            onClick={mode === 'active' ? finish : done}
          >
            <Icon name={mode === 'active' ? 'finish' : 'check'} className="h-5 w-5" />
            {mode === 'active' ? 'Finish' : 'Done'}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {mode === 'active' ? <LiveDuration startedAt={workout.startedAt} /> : <span />}
          <Stat icon="weight" label="Volume" value={`${formatWeight(summary.volume)} kg`} />
          <Stat icon="sets" label="Sets" value={String(summary.sets)} />
        </div>
        <SyncBadge className="mt-2" />
      </header>

      <div
        className={`scroll-area flex min-h-0 flex-1 flex-col gap-3 px-4 pt-4 ${
          workout.restEndsAt && mode === 'active' ? 'pb-28' : 'pb-[max(1.5rem,env(safe-area-inset-bottom))]'
        }`}
      >
        {mode === 'edit' && <EditFields workout={workout} />}

        {workout.exercises.map((we) => (
          <ExerciseCard
            key={we.id}
            we={we}
            workoutId={workout.id}
            withRest={mode === 'active'}
            onReplace={() => setPicker({ replace: we.id })}
          />
        ))}

        {workout.exercises.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-10 text-center text-neutral-500">
            <Icon name="dumbbell" className="h-12 w-12 text-neutral-700" />
            Add your first exercise to get started.
          </div>
        )}

        <button className={btn.primary} onClick={() => setPicker({})}>
          <Icon name="add" />
          Add exercise
        </button>
        {workout.exercises.length > 1 && (
          <button className={btn.secondary} onClick={() => setReordering(true)}>
            <Icon name="swap" className="h-5 w-5" />
            Reorder exercises
          </button>
        )}
        <button
          className={btn.danger}
          onClick={() => {
            if (confirm(mode === 'active' ? 'Discard this workout?' : 'Delete this workout?')) {
              if (mode === 'active') void discard();
              else void deleteWorkout(workout.id).then(() => navigate('/history', { replace: true }));
            }
          }}
        >
          <Icon name="delete" className="h-5 w-5" />
          {mode === 'active' ? 'Discard workout' : 'Delete workout'}
        </button>
      </div>

      {mode === 'active' && workout.restEndsAt && <RestBar workoutId={workout.id} endsAt={workout.restEndsAt} />}

      {picker && (
        <ExercisePicker
          single={picker.replace !== undefined}
          onClose={() => setPicker(null)}
          onDone={(ids) => {
            setPicker(null);
            if (picker.replace !== undefined) void replaceExercise(workout.id, picker.replace, ids[0]!);
            else void addExercises(workout.id, ids);
          }}
        />
      )}

      {reordering && <ReorderSheet workoutId={workout.id} exercises={workout.exercises} onClose={() => setReordering(false)} />}

      {finishing && (
        <FinishSheet
          workout={workout}
          onClose={() => setFinishing(false)}
          onFinished={() => navigate(`/history/${workout.id}`, { replace: true })}
        />
      )}
    </div>
  );
}

function LiveDuration({ startedAt }: { startedAt: string }) {
  const now = useNow();
  return <Stat icon="clock" label="Duration" value={formatClock((now - Date.parse(startedAt)) / 1000)} />;
}

const timeOf = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Title, date, start time, duration and notes of a finished workout. */
function EditFields({ workout }: { workout: WorkoutDetail }) {
  const durationMin = Math.round((Date.parse(workout.finishedAt!) - Date.parse(workout.startedAt)) / 60000);

  // Keeps duration when date or start time change.
  const setStart = (date: string, time: string, minutes = durationMin) => {
    const start = parseLocalDate(date);
    const [h, m] = time.split(':').map(Number);
    start.setHours(h ?? 0, m ?? 0);
    void updateWorkout(workout.id, {
      date: toLocalDate(start),
      startedAt: start.toISOString(),
      finishedAt: new Date(start.getTime() + minutes * 60000).toISOString(),
    });
  };

  return (
    <section className={`${card} flex flex-col gap-3 p-3`}>
      <input
        className={input}
        defaultValue={workout.title}
        placeholder="Title"
        onChange={(e) => e.target.value.trim() && updateWorkout(workout.id, { title: e.target.value.trim() })}
      />
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs text-neutral-400">
          Date
          <input
            type="date"
            className={`${input} mt-1 px-2`}
            value={workout.date}
            onChange={(e) => e.target.value && setStart(e.target.value, timeOf(workout.startedAt))}
          />
        </label>
        <label className="text-xs text-neutral-400">
          Start
          <input
            type="time"
            className={`${input} mt-1 px-2`}
            value={timeOf(workout.startedAt)}
            onChange={(e) => e.target.value && setStart(workout.date, e.target.value)}
          />
        </label>
        <label className="text-xs text-neutral-400">
          Minutes
          <input
            className={`${input} mt-1 px-2`}
            inputMode="numeric"
            defaultValue={durationMin}
            onChange={(e) => {
              const m = Number(e.target.value);
              if (Number.isInteger(m) && m > 0) setStart(workout.date, timeOf(workout.startedAt), m);
            }}
          />
        </label>
      </div>
      <textarea
        className={input}
        rows={2}
        defaultValue={workout.notes ?? ''}
        placeholder="Notes"
        onChange={(e) => updateWorkout(workout.id, { notes: e.target.value })}
      />
    </section>
  );
}
