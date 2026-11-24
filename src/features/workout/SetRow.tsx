import { useRef, useState } from 'react';
import Icon from '../../components/Icon';
import {
  formatSet,
  formatTime,
  formatWeight,
  parseReps,
  parseTime,
  parseWeight,
  type SetType,
  type SetValues,
} from '../../domain/sets';
import { AUTO_REPS, AUTO_WEIGHT, deleteSet, updateSetValue, type WorkoutSet } from '../../repositories/workouts';

const NONE: SetValues = { weightKg: null, reps: null };

/** Column layouts shared by the set table header and its rows. */
export const SET_GRID = 'grid grid-cols-[2.5rem_1fr_4.5rem_4rem_2.75rem] items-center gap-2';
/** Cardio: SET · TIME · KM/H · INCLINE · ✓ — Previous shows as placeholders (no room for a column). */
export const CARDIO_GRID = 'grid grid-cols-[2.5rem_1fr_1fr_1fr_2.75rem] items-center gap-2';

const field =
  'h-10 w-full rounded-xl bg-neutral-800 text-center font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-neutral-600 focus:ring-2 focus:ring-green-500';

export const SET_TYPE_COLOR: Record<SetType, string> = {
  normal: 'text-neutral-100',
  warmup: 'text-yellow-400',
  drop: 'text-blue-400',
  failure: 'text-red-500',
};

/**
 * One row of the set table: SET · PREVIOUS · KG · REPS · ✓ (cardio: SET · TIME · KM/H · INCLINE · ✓).
 * Swipe left to reveal Delete.
 */
export default function SetRow({
  workoutId,
  set,
  label,
  previous,
  cardio,
  shaking,
  pr,
  onLabel,
  onToggle,
}: {
  workoutId: string;
  set: WorkoutSet;
  label: string;
  previous: SetValues | undefined;
  cardio: boolean;
  shaking: boolean;
  /** This completed set beat the exercise's best weight or estimated 1RM. */
  pr: boolean;
  onLabel: () => void;
  onToggle: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const [ticked, setTicked] = useState(false); // pop the tick only when the user just completed the set, not on load
  const touchX = useRef<number | null>(null);

  const done = !!set.completed;
  // Values copied from an earlier set show dimmed until the user edits them or completes the set.
  const isAuto = (bit: number) => !done && (set.autoFill & bit) !== 0;

  return (
    <div className="relative overflow-hidden">
      {/* Only mounted while swiped: kept behind the row it bled through the rounded edges. */}
      {offset < 0 && (
        <button
          className="absolute inset-y-1 right-0 flex w-20 items-center justify-center rounded-xl bg-red-600"
          onClick={() => deleteSet(workoutId, set.id)}
          aria-label="Delete set"
        >
          <Icon name="delete" />
        </button>
      )}
      <div
        className={`${cardio ? CARDIO_GRID : SET_GRID} relative my-1 rounded-xl p-0.5 transition-[transform,background-color] ${
          done ? (pr ? 'bg-yellow-500/20' : 'bg-green-950') : 'bg-neutral-900'
        } ${shaking ? 'shake' : ''}`}
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={(e) => (touchX.current = e.touches[0]!.clientX)}
        onTouchMove={(e) => {
          if (touchX.current === null) return;
          const dx = e.touches[0]!.clientX - touchX.current;
          if (dx < -40) setOffset(-80);
          else if (dx > 20) setOffset(0);
        }}
        onTouchEnd={() => (touchX.current = null)}
      >
        {pr && (
          <span className="pointer-events-none absolute left-0 top-0 z-10 rounded-br-lg rounded-tl-xl bg-amber-500 px-1 text-[9px] font-extrabold leading-4 text-neutral-950">
            PR
          </span>
        )}
        <button className={`h-10 rounded-xl bg-neutral-800 font-bold ${SET_TYPE_COLOR[set.setType]}`} onClick={onLabel}>
          {label}
        </button>
        {cardio ? (
          <>
            <NumField
              value={set.reps}
              auto={isAuto(AUTO_REPS)}
              previous={previous?.reps}
              format={formatTime}
              parse={parseTime}
              onSave={(v) => updateSetValue(workoutId, set.id, 'reps', v)}
            />
            <NumField
              value={set.speedKmh}
              previous={previous?.speedKmh}
              format={formatWeight}
              parse={parseWeight}
              onSave={(v) => updateSetValue(workoutId, set.id, 'speed_kmh', v)}
            />
            <NumField
              value={set.inclinePct}
              previous={previous?.inclinePct}
              format={formatWeight}
              parse={parseWeight}
              onSave={(v) => updateSetValue(workoutId, set.id, 'incline_pct', v)}
            />
          </>
        ) : (
          <>
            <span className="truncate text-center text-sm text-neutral-500">{formatSet(previous ?? NONE, false)}</span>
            <NumField
              value={set.weightKg}
              auto={isAuto(AUTO_WEIGHT)}
              previous={previous?.weightKg}
              format={formatWeight}
              parse={parseWeight}
              onSave={(v) => updateSetValue(workoutId, set.id, 'weight_kg', v)}
            />
            <NumField
              value={set.reps}
              auto={isAuto(AUTO_REPS)}
              previous={previous?.reps}
              mode="numeric"
              format={String}
              parse={parseReps}
              onSave={(v) => updateSetValue(workoutId, set.id, 'reps', v)}
            />
          </>
        )}
        <button
          className={`flex h-10 items-center justify-center rounded-xl transition ${
            done ? 'bg-green-500 text-neutral-950' : 'bg-neutral-800 text-neutral-500'
          }`}
          onClick={() => {
            setTicked(!done);
            onToggle();
          }}
          aria-label={done ? 'Mark not done' : 'Mark done'}
        >
          <Icon name="check" className={`h-6 w-6 ${done && ticked ? 'pop' : ''}`} />
        </button>
      </div>
    </div>
  );
}

/** Set value input; holds a draft only while focused, so DB reloads never clobber typing. */
function NumField({
  value,
  auto,
  previous,
  mode = 'decimal',
  format,
  parse,
  onSave,
}: {
  value: number | null;
  auto?: boolean;
  previous: number | null | undefined;
  mode?: 'decimal' | 'numeric';
  format: (n: number) => string;
  parse: (text: string) => number | null;
  onSave: (v: number | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className={`${field} ${auto ? 'text-neutral-500' : ''}`}
      inputMode={mode}
      placeholder={previous != null ? format(previous) : ''}
      value={draft ?? (value === null ? '' : format(value))}
      onFocus={(e) => {
        setDraft(e.target.value);
        e.target.select();
      }}
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        setDraft(e.target.value);
        const v = parse(e.target.value);
        if (v !== value) onSave(v);
      }}
    />
  );
}
