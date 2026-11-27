import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import ExerciseThumb from '../../components/ExerciseThumb';
import GripIcon from '../../components/GripIcon';
import Icon, { type IconName } from '../../components/Icon';
import Sheet from '../../components/Sheet';
import { btn, card } from '../../components/ui';
import { completeValues, SET_TYPE_NAMES, SET_TYPES, setLabels, type SetType } from '../../domain/sets';
import { setRecordFlags } from '../../domain/progress';
import { formatRest, REST_OPTIONS } from '../../domain/workout';
import { useDbQuery } from '../../hooks/useDbQuery';
import { sessionsByExercise } from '../../repositories/progress';
import {
  getDefaultRest,
  GRIP_NAMES,
  GRIPS,
  resetRestSeconds,
  setRestSeconds,
} from '../../repositories/exercises';
import {
  addSet,
  completeSet,
  deleteSet,
  removeWorkoutExercise,
  setExerciseNote,
  setGrip,
  setSetType,
  uncompleteSet,
  type WorkoutExercise,
  type WorkoutSet,
} from '../../repositories/workouts';
import { requestNotificationPermission } from './notify';
import SetRow, { CARDIO_GRID, SET_GRID, SET_TYPE_COLOR } from './SetRow';

const SET_TYPE_LETTER: Record<SetType, string> = { normal: '1', warmup: 'W', drop: 'D', failure: 'F' };

export default function ExerciseCard({
  we,
  workoutId,
  withRest,
  onReplace,
}: {
  we: WorkoutExercise;
  workoutId: string;
  /** Rest timer only runs during a live workout, not when editing history. */
  withRest: boolean;
  onReplace: () => void;
}) {
  const [sheet, setSheet] = useState<'menu' | 'rest' | 'grip' | null>(null);
  const [typeFor, setTypeFor] = useState<WorkoutSet | null>(null);
  const [shaking, setShaking] = useState<string | null>(null);

  // PR badges only in a live workout (editing history would compare a workout with itself) and not for cardio.
  const live = withRest && !we.isCardio;
  const history = useDbQuery(
    async () => (live ? ((await sessionsByExercise({ exerciseId: we.exerciseId })).get(we.exerciseId) ?? []) : []),
    [live, we.exerciseId],
    { key: 'exerciseSessions', refetch: false },
  );
  // Offline or still loading: no history, no badges.
  const prs = history ? setRecordFlags(history, we.sets) : [];
  const labels = setLabels(we.sets.map((s) => s.setType));
  const close = () => setSheet(null);

  const toggle = (set: WorkoutSet, i: number) => {
    if (set.completed) return void uncompleteSet(workoutId, set.id);
    const values = completeValues(set, we.previous[i]);
    if (!values) {
      setShaking(set.id);
      setTimeout(() => setShaking(null), 400);
      return;
    }
    requestNotificationPermission();
    void completeSet(workoutId, set.id, values, withRest ? { seconds: we.restSeconds } : undefined);
  };

  return (
    <section className={`${card} p-3`}>
      <div className="flex items-center gap-3">
        <ExerciseThumb image={we.image} muscleGroup={we.muscleGroup} size={48} />
        <Link to={`/exercises/${we.exerciseId}`} className="min-w-0 flex-1 truncate text-[17px] font-semibold text-green-500">
          {we.name}
        </Link>
        <div className="relative">
          <button
            className={btn.icon}
            onClick={() => setSheet(sheet === 'menu' ? null : 'menu')}
            aria-label="Exercise menu"
            aria-expanded={sheet === 'menu'}
          >
            <Icon name="more" />
          </button>
          {/* Always mounted so it can animate out; invisible and untouchable while closed. */}
          {sheet === 'menu' && (
            <button className="fixed inset-0 z-10 cursor-default" onClick={close} aria-label="Close menu" />
          )}
          <div
            className={`absolute right-0 top-full z-20 mt-1 w-52 origin-top-right overflow-hidden rounded-xl bg-neutral-800 py-1 shadow-xl ring-1 ring-neutral-700 transition duration-150 ${
              sheet === 'menu' ? 'scale-100 opacity-100' : 'pointer-events-none scale-90 opacity-0'
            }`}
          >
            <button
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-neutral-100 active:bg-neutral-700"
              onClick={() => (close(), onReplace())}
            >
              <Icon name="swap" className="h-5 w-5 text-neutral-400" />
              Replace exercise
            </button>
            <button
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-red-400 active:bg-neutral-700"
              onClick={() => {
                close();
                void removeWorkoutExercise(workoutId, we.id);
              }}
            >
              <Icon name="delete" className="h-5 w-5" />
              Remove exercise
            </button>
          </div>
        </div>
      </div>

      {/* Uncontrolled: DB reloads must not clobber typing. The note belongs to this workout only. */}
      <input
        className="mt-2 w-full rounded-lg bg-transparent px-1 py-1 text-sm text-neutral-300 outline-none placeholder:text-neutral-600 focus:bg-neutral-800"
        defaultValue={we.note ?? ''}
        placeholder="Add a note…"
        maxLength={120}
        enterKeyHint="done"
        onChange={(e) => void setExerciseNote(workoutId, we.id, e.target.value)}
      />

      {(withRest || we.grip) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {we.grip && (
            <div className="relative">
              <Pill icon="grip" onClick={() => setSheet(sheet === 'grip' ? null : 'grip')}>
                {GRIP_NAMES[we.grip]} grip
              </Pill>
              {sheet === 'grip' && (
                <>
                  {/* Invisible full-screen layer: a tap anywhere else closes the dropdown. */}
                  <button className="fixed inset-0 z-10 cursor-default" onClick={close} aria-label="Close grip list" />
                  <div className="absolute left-0 top-full z-20 mt-1 min-w-48 overflow-hidden rounded-xl bg-neutral-800 py-1 shadow-xl ring-1 ring-neutral-700">
                    {/* a workout cached before 0.8.0 has no `grips`; offer every grip until it is reloaded */}
                    {(we.grips ?? GRIPS).map((g) => (
                      <button
                        key={g}
                        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-neutral-700 ${g === we.grip ? 'text-green-500' : 'text-neutral-100'}`}
                        onClick={() => {
                          void setGrip(workoutId, we.id, g);
                          close();
                        }}
                      >
                        <GripIcon grip={g} />
                        <span className="flex-1">{GRIP_NAMES[g]}</span>
                        {g === we.grip && <Icon name="check" className="h-5 w-5" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {withRest && (
            <Pill icon="timer" onClick={() => setSheet('rest')}>
              Rest {formatRest(we.restSeconds)}
            </Pill>
          )}
        </div>
      )}

      <div className={`${we.isCardio ? CARDIO_GRID : SET_GRID} mt-3 text-center text-[11px] font-semibold tracking-wide text-neutral-500`}>
        <span>SET</span>
        {we.isCardio ? (
          <>
            <span>TIME</span>
            <span>KM/H</span>
            <span>INCLINE</span>
          </>
        ) : (
          <>
            <span>PREVIOUS</span>
            <span>KG</span>
            <span>REPS</span>
          </>
        )}
        <span className="flex justify-center">
          <Icon name="check" className="h-4 w-4" />
        </span>
      </div>
      {we.sets.map((s, i) => (
        <SetRow
          key={s.id}
          workoutId={workoutId}
          set={s}
          label={labels[i]!}
          previous={we.previous[i]}
          cardio={!!we.isCardio}
          shaking={shaking === s.id}
          pr={!!prs[i]}
          onLabel={() => setTypeFor(s)}
          onToggle={() => toggle(s, i)}
        />
      ))}
      <button className={`${btn.secondary} mt-2 w-full py-2.5`} onClick={() => addSet(workoutId, we.id)}>
        <Icon name="add" className="h-5 w-5" />
        Add set
      </button>

      {typeFor && (
        <Sheet title="Set type" onClose={() => setTypeFor(null)}>
          <div className="flex flex-col gap-2 pb-2">
            {SET_TYPES.map((t) => (
              <button
                key={t}
                // ring-inset: an outer ring gets clipped by the sheet's scroll container
                className={`${btn.secondary} justify-start ${t === typeFor.setType ? 'ring-2 ring-green-500 ring-inset' : ''}`}
                onClick={() => {
                  void setSetType(workoutId, typeFor.id, t);
                  setTypeFor(null);
                }}
              >
                <span className={`w-5 text-center font-bold ${SET_TYPE_COLOR[t]}`}>{SET_TYPE_LETTER[t]}</span>
                {SET_TYPE_NAMES[t]}
              </button>
            ))}
            <button
              className={`${btn.danger} justify-start`}
              onClick={() => {
                void deleteSet(workoutId, typeFor.id);
                setTypeFor(null);
              }}
            >
              <Icon name="delete" className="h-5 w-5" />
              Delete set
            </button>
          </div>
        </Sheet>
      )}

      {sheet === 'rest' && <RestSheet we={we} onClose={close} />}

    </section>
  );
}

function Pill({ icon, onClick, children }: { icon: IconName; onClick: () => void; children: ReactNode }) {
  return (
    <button
      className="inline-flex items-center gap-1.5 rounded-full bg-neutral-800 px-3 py-1 text-sm text-neutral-200 active:bg-neutral-700"
      onClick={onClick}
    >
      <Icon name={icon} className="h-4 w-4 text-green-500" />
      {children}
      <Icon name="chevronDown" className="h-4 w-4 text-neutral-500" />
    </button>
  );
}

/** Per-exercise rest: a fixed value (kept for this exercise) or "use default" from Settings. */
function RestSheet({ we, onClose }: { we: WorkoutExercise; onClose: () => void }) {
  const defaultRest = useDbQuery(getDefaultRest, []);
  const pick = (seconds: number) => {
    void setRestSeconds(we.exerciseId, seconds);
    onClose();
  };
  return (
    <Sheet title={`Rest timer · ${we.name}`} onClose={onClose}>
      <div className="flex flex-col gap-3 pb-2">
        <button
          className={`${btn.secondary} justify-between ${!we.restCustom ? 'ring-2 ring-green-500 ring-inset' : ''}`}
          onClick={() => {
            void resetRestSeconds(we.exerciseId);
            onClose();
          }}
        >
          <span>Use default{defaultRest !== undefined && ` (${formatRest(defaultRest)})`}</span>
          {!we.restCustom && <Icon name="check" className="h-5 w-5 text-green-500" />}
        </button>
        <div className="grid grid-cols-3 gap-2">
          {REST_OPTIONS.map((s) => (
            <button
              key={s}
              className={`${btn.chip(!!we.restCustom && s === we.restSeconds)} py-3 text-base`}
              onClick={() => pick(s)}
            >
              {formatRest(s)}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
