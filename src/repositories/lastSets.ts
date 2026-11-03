import { api } from '../api/client';
import { pickPrevious, withFinished, type LastSets } from '../domain/lastSets';
import type { Grip } from '../domain/exercises';
import type { SetValues } from '../domain/sets';
import type { WorkoutDetail } from '../domain/workoutDoc';

// The "Previous" column offline: the server's latest sets per exercise and grip are kept in
// localStorage, refreshed whenever the app is online, and topped up locally when a workout finishes.

const KEY = 'ttp:lastSets';

function read(): LastSets[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as LastSets[];
  } catch {
    return [];
  }
}

function write(entries: LastSets[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    /* storage full: the column is just empty offline */
  }
}

export async function refreshLastSets(): Promise<void> {
  try {
    write(await api<LastSets[]>('GET', '/exercises/last-sets'));
  } catch {
    /* offline or not signed in: keep what we have */
  }
}

export const previousFromDevice = (
  w: Pick<WorkoutDetail, 'date' | 'startedAt'>,
  exerciseId: number,
  grip: Grip | null,
): SetValues[] => pickPrevious(read(), exerciseId, grip, w);

export const rememberFinished = (w: WorkoutDetail) => write(withFinished(read(), w));

export function forgetLastSets() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

window.addEventListener('online', () => void refreshLastSets());
