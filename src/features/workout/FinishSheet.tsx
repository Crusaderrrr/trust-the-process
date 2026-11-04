import { useState } from 'react';
import Icon from '../../components/Icon';
import CheckIn from '../../components/CheckIn';
import Sheet from '../../components/Sheet';
import { btn, card, input, Stat } from '../../components/ui';
import type { Feeling, Rating } from '../../domain/checkIn';
import { prCountByWorkout } from '../../domain/progress';
import { completeValues, formatWeight } from '../../domain/sets';
import { finishedAtFor, formatDuration, summarize } from '../../domain/workout';
import { useDbQuery, useNow } from '../../hooks/useDbQuery';
import { sessionsByExercise } from '../../repositories/progress';
import { finalizeWorkout, type WorkoutDetail } from '../../repositories/workouts';

/** Incomplete sets that could be ticked now (have values, or Previous to fall back on). */
export function resolvableSets(w: WorkoutDetail) {
  return w.exercises.flatMap((we) =>
    we.sets.flatMap((s, i) => {
      if (s.completed) return [];
      const v = completeValues(s, we.previous[i]);
      return v ? [{ id: s.id, ...v }] : [];
    }),
  );
}

/**
 * Finish flow (SPEC §6.2): resolve incomplete sets first, then a save sheet with title, notes
 * and a summary. Callers handle the "no completed sets at all" case before opening this.
 */
export default function FinishSheet({
  workout,
  onClose,
  onFinished,
}: {
  workout: WorkoutDetail;
  onClose: () => void;
  onFinished: () => void;
}) {
  const allSets = workout.exercises.flatMap((e) => e.sets);
  const incomplete = allSets.filter((s) => !s.completed).length;
  const completed = allSets.length - incomplete;
  const resolvable = resolvableSets(workout);

  const [title, setTitle] = useState(workout.title);
  const [notes, setNotes] = useState(workout.notes ?? '');
  const [rating, setRating] = useState<Rating | null>(null);
  const [feelings, setFeelings] = useState<Feeling[]>([]);
  const now = useNow();

  const prs = useDbQuery(
    async () =>
      prCountByWorkout([...(await sessionsByExercise({ includeWorkoutId: workout.id })).values()]).get(
        workout.id,
      ) ?? 0,
    [workout.id],
  );

  if (incomplete > 0) {
    return (
      <Sheet title="Unfinished sets" onClose={onClose}>
        <p className="mb-4 flex items-center gap-2 text-neutral-400">
          <Icon name="warning" className="h-5 w-5 text-amber-400" />
          {incomplete} set{incomplete === 1 ? ' is' : 's are'} not marked done.
        </p>
        <div className="flex flex-col gap-2 pb-2">
          {resolvable.length > 0 && (
            <button className={btn.primary} onClick={() => finalizeWorkout(workout.id, resolvable, {})}>
              <Icon name="check" />
              Complete {resolvable.length === incomplete ? 'them' : `${resolvable.length} with values`}
            </button>
          )}
          {completed > 0 && (
            <button className={btn.secondary} onClick={() => finalizeWorkout(workout.id, [], {})}>
              <Icon name="delete" className="h-5 w-5" />
              Discard incomplete sets
            </button>
          )}
          <button className={btn.secondary} onClick={onClose}>
            Keep logging
          </button>
        </div>
      </Sheet>
    );
  }

  const summary = summarize(allSets);
  const finishedAt = finishedAtFor(workout, now);
  const duration = (Date.parse(finishedAt) - Date.parse(workout.startedAt)) / 1000;

  return (
    <Sheet title="Save workout" onClose={onClose}>
      <div className="flex flex-col gap-3 pb-2">
        <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        <textarea
          className={input}
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="How did it go?"
        />
        <div className={`${card} grid grid-cols-4 gap-1 p-3 text-center`}>
          <Stat icon="clock" label="Time" value={formatDuration(duration)} />
          <Stat icon="weight" label="Volume" value={`${formatWeight(summary.volume)} kg`} />
          <Stat icon="sets" label="Sets" value={String(summary.sets)} />
          <Stat icon="trophy" label="PRs" value={prs === undefined ? '…' : String(prs)} />
        </div>
        <CheckIn
          rating={rating}
          feelings={feelings}
          onChange={(v) => {
            setRating(v.rating);
            setFeelings(v.feelings);
          }}
        />
        <button
          className={btn.primary}
          onClick={async () => {
            await finalizeWorkout(workout.id, [], {
              title: title.trim() || workout.title,
              notes,
              rating,
              feelings,
              finishedAt: finishedAtFor(workout, Date.now()),
            });
            onFinished();
          }}
        >
          <Icon name="save" />
          Save workout
        </button>
      </div>
    </Sheet>
  );
}
