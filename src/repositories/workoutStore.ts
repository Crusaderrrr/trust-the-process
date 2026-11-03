import { api, ApiError, isNetworkError } from '../api/client';
import { notifyChange } from '../api/events';
import type { WorkoutDetail } from '../domain/workoutDoc';

// Workout documents live here while they are open. An edit applies to the cached
// document at once, is mirrored to localStorage, and the whole document is PUT to the server after
// a short debounce. While the server is unreachable the PUT is retried with backoff and the local
// copy survives a reload. Newest document wins.

type Entry = { doc: WorkoutDetail; dirty: boolean; saving: Promise<boolean> | null; timer?: number; retries: number };

const cache = new Map<string, Entry>();
/** The unfinished workout's id; null = none; undefined = not asked yet. */
let activeId: string | null | undefined;

const DEBOUNCE_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
const KEY = 'ttp:pending:';

// ---- "Offline — changes will sync" state ----
export const SYNC_STATE = 'sync-state';
let failing = false;
export const isSyncFailing = () => failing;
function setFailing(v: boolean) {
  if (failing === v) return;
  failing = v;
  window.dispatchEvent(new Event(SYNC_STATE));
}
const anyFailing = () => [...cache.values()].some((e) => e.dirty && e.retries > 0);

// ---- local copy; storage can be blocked or full, the in-memory copy still works ----
function saveLocal(doc: WorkoutDetail) {
  try {
    localStorage.setItem(KEY + doc.id, JSON.stringify(doc));
  } catch {
    /* in-memory only */
  }
}
function dropLocal(id: string) {
  try {
    localStorage.removeItem(KEY + id);
  } catch {
    /* ignore */
  }
}

/** The server computes `previous`; it is read-only, so it is not sent back. */
const toBody = (w: WorkoutDetail) => ({
  ...w,
  exercises: w.exercises.map((e) => ({ ...e, previous: undefined })),
});

function remember(doc: WorkoutDetail): Entry {
  const entry: Entry = { doc, dirty: false, saving: null, retries: 0 };
  cache.set(doc.id, entry);
  return entry;
}

/** One save attempt (or the one already running). Resolves true when the server has the document. */
function flush(entry: Entry): Promise<boolean> {
  clearTimeout(entry.timer);
  if (entry.saving) return entry.saving;
  if (!entry.dirty) return Promise.resolve(true);
  const id = entry.doc.id;
  entry.saving = (async () => {
    entry.dirty = false;
    try {
      await api('PUT', `/workouts/${id}`, toBody(entry.doc));
      entry.retries = 0;
      if (entry.dirty) schedule(entry, 0); // edited while the request was in flight
      else dropLocal(id);
      setFailing(anyFailing());
      return true;
    } catch (e) {
      entry.dirty = true;
      if (isNetworkError(e) || (e as ApiError).status >= 500 || (e as ApiError).status === 401) {
        entry.retries++;
        schedule(entry, Math.min(MAX_BACKOFF_MS, 2000 * 2 ** (entry.retries - 1)));
        setFailing(true);
      } else {
        // The server refused this document; retrying cannot help. Show the server's truth again.
        console.error(e);
        entry.dirty = false;
        dropLocal(id);
        cache.delete(id);
        if (activeId === id) activeId = undefined;
        setFailing(anyFailing());
        notifyChange();
      }
      return false;
    } finally {
      entry.saving = null;
    }
  })();
  return entry.saving;
}

function schedule(entry: Entry, delay: number) {
  clearTimeout(entry.timer);
  entry.timer = window.setTimeout(() => void flush(entry), delay);
}

function flushAll() {
  for (const e of cache.values()) if (e.dirty) void flush(e);
}

/** Marks a document changed: mirrors it locally and queues the save. */
function touch(entry: Entry, delay = DEBOUNCE_MS) {
  entry.dirty = true;
  saveLocal(entry.doc);
  schedule(entry, delay);
}

// Flush when the app goes to the background or the connection returns.
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushAll());
window.addEventListener('pagehide', flushAll);
window.addEventListener('online', () => {
  for (const e of cache.values()) e.retries = 0;
  flushAll();
});

// Copies left in localStorage by a closed tab / killed app: reopen them and finish the save.
try {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k?.startsWith(KEY)) continue;
    const doc = JSON.parse(localStorage.getItem(k) ?? 'null') as WorkoutDetail | null;
    if (!doc?.id) continue;
    const entry = remember(doc);
    if (!doc.finishedAt) activeId = doc.id;
    touch(entry, 0);
  }
} catch {
  /* unreadable storage: fall back to the server's copy */
}

/** Cached document, else fetched; null if the workout does not exist. */
export async function loadWorkout(id: string): Promise<WorkoutDetail | null> {
  const cached = cache.get(id);
  if (cached) return cached.doc;
  try {
    const { workout } = await api<{ workout: WorkoutDetail }>('GET', `/workouts/${id}`);
    return (cache.get(id) ?? remember(workout)).doc;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export async function loadActive(): Promise<WorkoutDetail | null> {
  if (activeId !== undefined) return activeId ? loadWorkout(activeId) : null;
  const { workout } = await api<{ workout: WorkoutDetail | null }>('GET', '/workouts/active');
  if (!workout) return (activeId = null);
  activeId = workout.id;
  return (cache.get(workout.id) ?? remember(workout)).doc;
}

function apply(entry: Entry, edit: (doc: WorkoutDetail) => WorkoutDetail) {
  entry.doc = edit(entry.doc);
  // Finishing frees the "active workout" slot.
  if (entry.doc.finishedAt && activeId === entry.doc.id) activeId = null;
  touch(entry);
  notifyChange();
}

/** Applies an edit to a workout's document. Resolves once it is applied locally; the save follows. */
export async function mutate(id: string, edit: (doc: WorkoutDetail) => WorkoutDetail): Promise<void> {
  const entry = cache.get(id);
  // Synchronous when cached, so rapid edits are applied in the order they were made.
  if (entry) return apply(entry, edit);
  const doc = await loadWorkout(id);
  const loaded = doc && cache.get(id);
  if (!loaded) throw new Error('Workout not found');
  apply(loaded, edit);
}

/** Adds a new document (start / log past); it is saved in the background. */
export async function create(doc: WorkoutDetail): Promise<void> {
  const entry = remember(doc);
  if (!doc.finishedAt) activeId = doc.id;
  touch(entry, 0);
  notifyChange();
}

export async function remove(id: string): Promise<void> {
  const entry = cache.get(id);
  cache.delete(id);
  if (activeId === id) activeId = null;
  if (entry) {
    clearTimeout(entry.timer);
    entry.dirty = false;
  }
  dropLocal(id);
  setFailing(anyFailing());
  notifyChange();
  await entry?.saving?.catch(() => {}); // let an in-flight save land first, so it cannot re-create the row
  await api('DELETE', `/workouts/${id}`);
}

/** Tries once to save every pending document; reads of derived server data call this first. */
export async function settled(): Promise<void> {
  await Promise.all([...cache.values()].map(flush));
}

/** Keeps open documents in step after an exercise was edited (rest timer, grips, photo). */
export function patchOpenDocs(edit: (doc: WorkoutDetail) => WorkoutDetail) {
  for (const entry of cache.values()) {
    entry.doc = edit(entry.doc);
    if (entry.dirty) saveLocal(entry.doc);
  }
  notifyChange();
}

/** After a settings change that affects many exercises: forget documents with nothing pending. */
export function dropCleanDocs() {
  for (const [id, entry] of cache) if (!entry.dirty && !entry.saving) cache.delete(id);
  activeId = undefined;
}
