import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { SIGNED_OUT_EVENT, apiGet, apiPost } from '../lib/api.js';
import { saveRecent } from '../lib/recentSearches.js';
import { clearSession, readSession, saveSession } from '../lib/session.js';

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState(() => (readSession() ? { status: 'checking' } : { status: 'out' }));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (state.status !== 'checking') return undefined;
    let cancelled = false;
    apiGet('/api/auth/me')
      .then((me) => !cancelled && setState({ status: 'in', user: me.user }))
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 401) setState({ status: 'out', notice: 'Your session ended. Please sign in again.' });
        else {
          // No connection (or the server is down) but you were already signed in on this device: open with the saved screens.
          // Anything that needs the server will check the sign-in again as soon as it can.
          const known = readSession()?.user;
          if (known && (err.network || [502, 503, 504].includes(err.status))) setState({ status: 'in', user: known });
          else setState({ status: 'unreachable', error: err.message });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [state.status, attempt]);

  useEffect(() => {
    const onEnded = () => setState((s) => (s.status === 'in' ? { status: 'out', notice: 'Your session ended. Please sign in again.' } : s));
    window.addEventListener(SIGNED_OUT_EVENT, onEnded);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onEnded);
  }, []);

  const signIn = useCallback(async ({ username, password, keepSignedIn }) => {
    const result = await apiPost('/api/auth/login', { username, password, keepSignedIn }, { auth: false });
    saveSession({ token: result.token, expiresAt: result.expiresAt, user: result.user }, keepSignedIn);
    setState({ status: 'in', user: result.user });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiPost('/api/auth/logout');
    } catch {
      /* the token is dropped here either way */
    }
    clearSession();
    saveRecent([]);
    setState({ status: 'out' });
  }, []);

  const retry = useCallback(() => {
    setState({ status: 'checking' });
    setAttempt((n) => n + 1);
  }, []);

  const value = useMemo(() => ({ ...state, signIn, signOut, retry }), [state, signIn, signOut, retry]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
