import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from '../lib/api.js';
import { useShellData } from './useShellData.jsx';
import { useOnline } from './useOnline.js';

export function useResource(path) {
  const { changes } = useShellData();
  const online = useOnline();
  const [state, setState] = useState({ data: null, loading: !!path, error: null });
  const latest = useRef(0);

  const load = useCallback(
    async ({ quiet = false } = {}) => {
      if (!path) return;
      const ticket = ++latest.current;
      if (!quiet) setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await apiGet(path);
        if (ticket === latest.current) setState({ data, loading: false, error: null });
      } catch (err) {
        if (ticket === latest.current) setState((s) => ({ ...s, loading: false, error: quiet && s.data ? null : err.message }));
      }
    },
    [path]
  );

  useEffect(() => {
    setState({ data: null, loading: !!path, error: null });
    load();
  }, [path, load]);

  useEffect(() => {
    if (changes > 0) load({ quiet: true });
  }, [changes, load]);

  useEffect(() => {
    if (online) load({ quiet: true });
  }, [online, load]);

  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && load({ quiet: true });
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const setData = useCallback((updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })), []);
  return { ...state, reload: () => load(), setData };
}
