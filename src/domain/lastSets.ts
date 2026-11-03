import type { Grip } from './exercises';
import type { SetValues } from './sets';
import type { WorkoutDetail } from './workoutDoc';

/** The completed sets of the latest finished workout for one exercise and grip (the offline "Previous" column). */
export type LastSets = { exerciseId: number; grip: Grip | null; date: string; startedAt: string; sets: SetValues[] };

type Stamp = Pick<LastSets, 'date' | 'startedAt'>;
const isBefore = (a: Stamp, b: Stamp) => a.date < b.date || (a.date === b.date && a.startedAt < b.startedAt);

/**
 * Same rule as the server's `previousSets`: the latest entry that started before `before`; with a grip,
 * entries of that grip or of none qualify and the same grip wins.
 */
export function pickPrevious(entries: LastSets[], exerciseId: number, grip: Grip | null, before: Stamp): SetValues[] {
  const fits = entries.filter(
    (e) => e.exerciseId === exerciseId && (grip === null || e.grip === grip || e.grip === null) && isBefore(e, before),
  );
  const best = fits.reduce<LastSets | undefined>((a, b) => {
    if (!a) return b;
    if ((a.grip === grip) !== (b.grip === grip)) return a.grip === grip ? a : b;
    return isBefore(a, b) ? b : a;
  }, undefined);
  return best?.sets ?? [];
}

/** Folds a finished workout into the entries, so the next workout offline already sees it. */
export function withFinished(entries: LastSets[], w: WorkoutDetail): LastSets[] {
  if (!w.finishedAt) return entries;
  let out = entries;
  for (const e of w.exercises) {
    const sets = e.sets
      .filter((s) => s.completed)
      .map((s) => ({ weightKg: s.weightKg, reps: s.reps, speedKmh: s.speedKmh, inclinePct: s.inclinePct, setType: s.setType }));
    if (!sets.length) continue;
    const old = out.find((x) => x.exerciseId === e.exerciseId && x.grip === e.grip);
    if (old && isBefore(w, old)) continue; // a newer workout is already remembered (this one is an edit of an old one)
    out = [...out.filter((x) => x !== old), { exerciseId: e.exerciseId, grip: e.grip, date: w.date, startedAt: w.startedAt, sets }];
  }
  return out;
}
