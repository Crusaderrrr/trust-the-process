import { notifyChange } from './events';

/** Thrown for any non-2xx answer; `message` is the server's user-facing text when it sent one. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** True when the request never reached the server (offline, laptop down), as opposed to an HTTP error. */
export const isNetworkError = (e: unknown): boolean => !(e instanceof ApiError);

// JSON content type on every request, including body-less POSTs: the server rejects anything else
// for state-changing calls (CSRF guard).
export async function api<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (data as { message?: string } | null)?.message ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  if (method !== 'GET') notifyChange();
  return data as T;
}
