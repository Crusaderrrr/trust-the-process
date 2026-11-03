import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import * as authApi from '../../api/auth';
import { isNetworkError } from '../../api/client';
import { btn, input } from '../../components/ui';
import { forgetExercises } from '../../repositories/exerciseCache';
import { forgetLastSets } from '../../repositories/lastSets';

const LAST_USER_KEY = 'ttp.lastUser';

type AuthState = { user: authApi.User; logout: () => Promise<void> };
const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthGate');
  return ctx;
}

// Remembered only so the installed PWA still opens at the gym with no signal; the server is the
// authority whenever it is reachable.
function rememberedUser(): authApi.User | null {
  try {
    return JSON.parse(localStorage.getItem(LAST_USER_KEY) ?? 'null') as authApi.User | null;
  } catch {
    return null;
  }
}
function remember(user: authApi.User | null) {
  try {
    if (user) localStorage.setItem(LAST_USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(LAST_USER_KEY);
  } catch {
    // Private mode etc.: losing the offline shortcut is acceptable.
  }
}

type Gate = { status: 'loading' } | { status: 'anonymous' } | { status: 'user'; user: authApi.User };

/** Renders the app only for a logged-in user; otherwise the login / sign-up screen. */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [gate, setGate] = useState<Gate>({ status: 'loading' });

  useEffect(() => {
    authApi.fetchMe().then(
      (user) => {
        remember(user);
        setGate({ status: 'user', user });
      },
      (e: unknown) => {
        const cached = isNetworkError(e) ? rememberedUser() : null;
        if (cached) setGate({ status: 'user', user: cached });
        else {
          if (!isNetworkError(e)) remember(null);
          setGate({ status: 'anonymous' });
        }
      },
    );
  }, []);

  const onAuthed = useCallback((user: authApi.User) => {
    remember(user);
    setGate({ status: 'user', user });
  }, []);
  const logout = useCallback(async () => {
    await authApi.logout();
    remember(null);
    forgetExercises();
    forgetLastSets();
    // The SQLite worker, caches and route state all belong to the previous account.
    location.reload();
  }, []);

  if (gate.status === 'loading') return null;
  if (gate.status === 'anonymous') return <AuthScreen onAuthed={onAuthed} />;
  return <AuthContext value={{ user: gate.user, logout }}>{children}</AuthContext>;
}

// An invite link looks like `/#/signup?invite=ABCD-EFGH-2345`.
function inviteFromHash(): string | null {
  const [route, query = ''] = location.hash.slice(1).split('?');
  return route === '/signup' ? (new URLSearchParams(query).get('invite') ?? '') : null;
}

function AuthScreen({ onAuthed }: { onAuthed: (user: authApi.User) => void }) {
  const [linkInvite] = useState(inviteFromHash);
  const [mode, setMode] = useState<'login' | 'signup'>(linkInvite === null ? 'login' : 'signup');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [invite, setInvite] = useState(linkInvite ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onAuthed(
        mode === 'login' ? await authApi.login(username, password) : await authApi.signup(username, password, invite),
      );
    } catch (err) {
      setError(isNetworkError(err) ? "Can't reach the server. Check your connection." : (err as Error).message);
      setBusy(false);
    }
  };

  const signup = mode === 'signup';
  return (
    <div className="scroll-area h-full px-6 pt-[max(env(safe-area-inset-top),2rem)] pb-8">
      <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-6">
        <header className="text-center">
          <img src="/icon-192.png" alt="" className="mx-auto mb-4 h-20 w-20 rounded-2xl" />
          <h1 className="text-[28px] leading-tight font-bold tracking-tight">Trust The Process</h1>
          <p className="mt-1 text-neutral-400">{signup ? 'Create your account' : 'Log in to continue'}</p>
        </header>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            className={input}
            placeholder="Username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            className={input}
            type="password"
            placeholder={signup ? 'Password (10+ characters)' : 'Password'}
            autoComplete={signup ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={signup ? 10 : undefined}
          />
          {signup && (
            <input
              className={input}
              placeholder="Invite code"
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
              required
            />
          )}
          {error && (
            <p role="alert" className="px-1 text-sm text-red-400">
              {error}
            </p>
          )}
          <button className={btn.primary} disabled={busy}>
            {signup ? 'Sign up' : 'Log in'}
          </button>
        </form>

        <button
          type="button"
          className="text-sm text-green-500"
          onClick={() => {
            setMode(signup ? 'login' : 'signup');
            setError('');
          }}
        >
          {signup ? 'Already have an account? Log in' : 'Have an invite code? Sign up'}
        </button>
      </div>
    </div>
  );
}
