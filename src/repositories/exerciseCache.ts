import { api, ApiError } from '../api/client';
import type { Equipment, Exercise, GripSet, MuscleGroup } from '../domain/exercises';

// Offline support for the exercise library: the last list the server sent is kept in localStorage,
// and exercises created without a connection wait in a queue until the server is reachable again.
// A queued exercise has a negative temporary id; once the server assigns the real one, the open
// workouts are re-pointed to it (workoutStore.syncExercises).

export type NewExercise = {
  name: string;
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  image: string | null;
  gripSet: GripSet | null;
};
type Pending = { tempId: number; body: NewExercise };

const LIST_KEY = 'ttp:exercises';
const PENDING_KEY = 'ttp:exercises:new';

const read = <T>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback;
  } catch {
    return fallback;
  }
};

/** Storage can be full or blocked; the cache is a convenience, never a reason to fail. */
function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const isTempId = (id: number) => id < 0;

const pending = () => read<Pending[]>(PENDING_KEY, []);
export const hasPending = () => pending().length > 0;

/** Remembers the server's list. Photos are the bulk, so if the quota is hit they are dropped from the copy. */
export function cacheList(archived: boolean, list: Exercise[]) {
  const key = LIST_KEY + (archived ? ':archived' : '');
  if (!write(key, list)) write(key, list.map((e) => (e.image?.startsWith('data:') ? { ...e, image: null } : e)));
}

export const cachedList = (archived: boolean) => read<Exercise[]>(LIST_KEY + (archived ? ':archived' : ''), []);

/** Queued exercises as library entries, so lists and pickers can show them offline. */
export const pendingExercises = (): Exercise[] =>
  pending().map(({ tempId, body }) => {
    const cardio = body.muscleGroup === 'cardio';
    return {
      id: tempId,
      name: body.name,
      muscleGroup: body.muscleGroup,
      equipment: body.equipment,
      isCustom: 1,
      archived: 0,
      restSeconds: cardio ? 0 : 120,
      restCustom: cardio ? 1 : 0,
      favorite: 0,
      image: body.image,
      gripSet: cardio ? null : body.gripSet,
      isCardio: cardio ? 1 : 0,
      lastGrip: null,
    };
  });

/** Queues an exercise created offline; returns its temporary id. */
export function queueExercise(body: NewExercise): number {
  const queue = pending();
  const tempId = Math.min(0, ...queue.map((p) => p.tempId)) - 1;
  if (!write(PENDING_KEY, [...queue, { tempId, body }])) throw new Error('Not enough storage to save the exercise offline.');
  return tempId;
}

/** Creates the exercise; a name the server already has (made on another device) resolves to that one. */
async function create(p: Pending): Promise<number | null> {
  try {
    return (await api<Exercise>('POST', '/exercises', p.body)).id;
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 409) throw e;
    const all = [...(await api<Exercise[]>('GET', '/exercises')), ...(await api<Exercise[]>('GET', '/exercises?archived=1'))];
    return all.find((x) => x.name.toLowerCase() === p.body.name.toLowerCase())?.id ?? null;
  }
}

// Offline, a server error or an expired session: keep the queue and try again later.
const retryable = (e: unknown) => !(e instanceof ApiError) || e.status >= 500 || e.status === 401;

let flushing: Promise<Map<number, number>> | null = null;

/** Sends queued exercises to the server. Resolves with temporary id → real id for those that went through. */
export function flushPending(): Promise<Map<number, number>> {
  return (flushing ??= (async () => {
    const mapped = new Map<number, number>();
    for (const p of pending()) {
      try {
        const id = await create(p);
        if (id) mapped.set(p.tempId, id);
      } catch (e) {
        if (retryable(e)) break;
        console.error(e); // the server refused it; retrying cannot help
      }
      write(PENDING_KEY, pending().filter((x) => x.tempId !== p.tempId));
    }
    return mapped;
  })().finally(() => (flushing = null)));
}

/** On logout: the next account must not see (or upload) this one's exercises. */
export function forgetExercises() {
  try {
    for (const k of [LIST_KEY, LIST_KEY + ':archived', PENDING_KEY]) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
