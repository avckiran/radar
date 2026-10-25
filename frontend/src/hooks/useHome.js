import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPost } from '../lib/api.js';
import { removeAttentionRow } from '../lib/homeState.js';
import { useShellData } from './useShellData.jsx';
import { useOnline } from './useOnline.js';
import { useToast } from '../components/ui/Toast.jsx';

export function useHome() {
  const toast = useToast();
  const online = useOnline();
  const { refresh: refreshShell } = useShellData();
  const [state, setState] = useState({ data: null, loading: true, error: null, updatedAt: null });
  const [pending, setPending] = useState(() => new Set());
  const latest = useRef(0);

  const load = useCallback(async ({ quiet = false } = {}) => {
    const ticket = ++latest.current;
    if (!quiet) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await apiGet('/api/home');
      if (ticket === latest.current) setState({ data, loading: false, error: null, updatedAt: new Date() });
    } catch (err) {
      if (ticket !== latest.current) return;
      setState((s) => ({ ...s, loading: false, error: quiet && s.data ? null : err.message }));
      if (quiet) toast.show(err.message);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (online) load({ quiet: true });
  }, [online, load]);

  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && load({ quiet: true });
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const act = useCallback(
    async (row, action, body, { success, optimistic = false } = {}) => {
      const before = state.data;
      setPending((p) => new Set(p).add(row.id));
      if (optimistic) setState((s) => ({ ...s, data: removeAttentionRow(s.data, row.id) }));
      try {
        await apiPost(`/api/items/${row.id}/${action}`, body);
        if (success) toast.show(success);
        return { ok: true };
      } catch (err) {
        if (optimistic) setState((s) => ({ ...s, data: before }));
        toast.show(err.message);
        return { ok: false, error: err.message };
      } finally {
        setPending((p) => {
          const next = new Set(p);
          next.delete(row.id);
          return next;
        });
        load({ quiet: true });
        refreshShell();
      }
    },
    [state.data, toast, load, refreshShell]
  );

  return { ...state, pending, reload: () => load(), act };
}
