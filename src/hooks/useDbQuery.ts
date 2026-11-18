import { useEffect, useMemo, useState } from 'react';
import { DB_CHANGE } from '../api/events';

/** Last result of every keyed query, so a screen opens with data and refreshes behind it. */
const memo = new Map<string, unknown>();

/** Forget everything shown so far; the next account must not see this one's data. */
export const clearQueryCache = () => memo.clear();

type Options<T> = {
  /** Remembers the result (per deps) and shows it at once next time, while the query runs again. */
  key?: string;
  /** Shown while nothing is remembered yet, e.g. a copy kept on the device. */
  initial?: () => T | undefined;
  /** Re-run after every DB write (default). `false`: run once per mount; for data that rarely changes. */
  refetch?: boolean;
};

/** Runs a repository read and re-runs it after every DB write. undefined while loading. */
export function useDbQuery<T>(fn: () => Promise<T>, deps: unknown[], { key, initial, refetch = true }: Options<T> = {}): T | undefined {
  const memoKey = key === undefined ? undefined : `${key}|${JSON.stringify(deps)}`;
  const [result, setResult] = useState<{ key: string | undefined; data: T }>();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputed only when the query changes
  const seed = useMemo(() => (memoKey === undefined ? undefined : ((memo.get(memoKey) as T | undefined) ?? initial?.())), [memoKey]);

  useEffect(() => {
    let alive = true;
    const load = () => {
      fn().then((data) => {
        if (!alive) return;
        if (memoKey !== undefined) memo.set(memoKey, data);
        setResult({ key: memoKey, data });
      }, console.error);
    };
    load();
    if (refetch) window.addEventListener(DB_CHANGE, load);
    return () => {
      alive = false;
      if (refetch) window.removeEventListener(DB_CHANGE, load);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller controls deps
  }, deps);

  // Unkeyed queries keep showing the previous result while deps change, as before.
  return result && (memoKey === undefined || result.key === memoKey) ? result.data : seed;
}

/** Re-renders every `ms` and returns the current time; for live clocks. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
