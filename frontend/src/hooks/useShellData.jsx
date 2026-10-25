import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiGet } from '../lib/api.js';
import { useOnline } from './useOnline.js';

const Ctx = createContext(null);

export function ShellDataProvider({ children }) {
  const online = useOnline();
  const [state, setState] = useState({ data: null, loading: true, error: null, updatedAt: null });
  const [attempt, setAttempt] = useState(0);
  const [changes, setChanges] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    apiGet('/api/segments', { signal: controller.signal })
      .then((data) => setState({ data, loading: false, error: null, updatedAt: new Date() }))
      .catch((err) => {
        if (err.name === 'AbortError') return;

        setState((s) => ({ ...s, loading: false, error: err.message }));
      });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (online) setAttempt((n) => (state.error ? n + 1 : n));

  }, [online]);

  const refresh = useCallback(() => setAttempt((n) => n + 1), []);
  const notifyChanged = useCallback(() => {
    setAttempt((n) => n + 1);
    setChanges((n) => n + 1);
  }, []);
  const value = useMemo(() => ({ ...state, refresh, notifyChanged, changes }), [state, refresh, notifyChanged, changes]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShellData() {
  return useContext(Ctx);
}
