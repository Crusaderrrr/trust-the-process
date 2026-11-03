import { api, ApiError, isNetworkError } from '../api/client';
import { notifyChange } from '../api/events';
import {
  EQUIPMENT,
  GRIP_NAMES,
  GRIP_SET_NAMES,
  GRIP_SETS,
  GRIPS,
  label,
  MUSCLE_GROUPS,
  type Equipment,
  type Exercise,
  type Grip,
  type GripSet,
  type MuscleGroup,
} from '../domain/exercises';
import { patchExerciseInfo } from '../domain/workoutDoc';
import { cachedList, cacheList, isTempId, pendingExercises, queueExercise } from './exerciseCache';
import { dropCleanDocs, patchOpenDocs, syncExercises } from './workoutStore';

// The exercise types and constants live in domain/; re-exported so screens import from one place.
export { EQUIPMENT, GRIP_NAMES, GRIP_SET_NAMES, GRIP_SETS, GRIPS, label, MUSCLE_GROUPS };
export type { Equipment, Exercise, Grip, GripSet, MuscleGroup };

/** Library from the server, kept on the device; offline it comes from that copy plus exercises waiting to upload. */
export async function listExercises(archived = false): Promise<Exercise[]> {
  try {
    await syncExercises(); // so exercises created offline show up with their real ids
    const list = await api<Exercise[]>('GET', `/exercises${archived ? '?archived=1' : ''}`);
    cacheList(archived, list);
    return list;
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    const list = cachedList(archived);
    return archived ? list : [...list, ...pendingExercises()].sort((x, y) => x.name.localeCompare(y.name));
  }
}

export async function getExercise(id: number): Promise<Exercise | undefined> {
  if (!isTempId(id)) {
    try {
      return await api<Exercise>('GET', `/exercises/${id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return undefined;
      if (!isNetworkError(e)) throw e;
    }
  }
  return [...cachedList(false), ...cachedList(true), ...pendingExercises()].find((e) => e.id === id);
}

/** Saved on the server, or, with no connection, queued on the device and uploaded when it returns. */
export async function createExercise(e: {
  name: string;
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  image: string | null;
  gripSet: GripSet | null;
}): Promise<number> {
  const body = { ...e, name: e.name.trim() };
  if (!body.name) throw new Error('Enter a name.');
  try {
    return (await api<Exercise>('POST', '/exercises', body)).id;
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    const taken = [...cachedList(false), ...cachedList(true), ...pendingExercises()];
    if (taken.some((x) => x.name.toLowerCase() === body.name.toLowerCase())) {
      throw new Error(`"${body.name}" already exists (it may be archived).`, { cause: err });
    }
    const id = queueExercise(body);
    notifyChange();
    return id;
  }
}

/** Custom exercises without history are deleted; anything with history is archived (SPEC §4). */
export async function removeExercise(id: number): Promise<'deleted' | 'archived'> {
  return (await api<{ result: 'deleted' | 'archived' }>('DELETE', `/exercises/${id}`)).result;
}

const patch = (id: number, body: object) => api<Exercise>('PATCH', `/exercises/${id}`, body);

export const unarchiveExercise = (id: number) => patch(id, { archived: false });

export async function setGripSet(id: number, gripSet: GripSet | null) {
  await patch(id, { gripSet });
  patchOpenDocs((w) => patchExerciseInfo(w, id, { gripSet }));
}

export async function setExerciseImage(id: number, image: string | null) {
  await patch(id, { image });
  patchOpenDocs((w) => patchExerciseInfo(w, id, { image }));
}

export const setFavorite = (id: number, favorite: boolean) => patch(id, { favorite });

/** Rest chosen in a workout: this exercise keeps it, whatever the default becomes. */
export async function setRestSeconds(id: number, seconds: number) {
  await patch(id, { restSeconds: seconds });
  patchOpenDocs((w) => patchExerciseInfo(w, id, { restSeconds: seconds, restCustom: 1 }));
}

/** Makes the exercise follow the default rest timer again. */
export async function resetRestSeconds(id: number) {
  const e = await patch(id, { restSeconds: null });
  patchOpenDocs((w) => patchExerciseInfo(w, id, { restSeconds: e.restSeconds, restCustom: 0 }));
}

export async function getDefaultRest(): Promise<number> {
  return (await api<{ defaultRestSeconds: number }>('GET', '/settings')).defaultRestSeconds;
}

/** Saves the default and applies it to every exercise whose rest wasn't set in a workout. */
export async function setDefaultRest(seconds: number) {
  await api('PUT', '/settings', { defaultRestSeconds: seconds });
  dropCleanDocs(); // their rest values were copied from the old default
}
