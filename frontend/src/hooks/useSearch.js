import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api.js';
import { useShellData } from './useShellData.jsx';
import { useOnline } from './useOnline.js';

export const MIN_QUERY = 2;

export function useSearch(query) {
  const { changes } = useShellData();
  const online = useOnline();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ status: 'idle', data: null, error: null });

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      setState({ status: 'idle', data: null, error: null });
      return undefined;
    }
    if (!online) {
      setState((s) => ({ ...s, status: 'offline' }));
      return undefined;
    }
    const controller = new AbortController();
    setState((s) => ({ status: 'loading', data: s.data, error: null }));
    const timer = setTimeout(async () => {
      try {
        const data = await apiGet(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        setState({ status: 'ready', data, error: null });
      } catch (err) {
        if (err.name === 'AbortError') return;
        setState((s) => ({ status: 'error', data: s.data, error: err.message }));
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, online, attempt, changes]);

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
