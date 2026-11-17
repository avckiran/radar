import { useCallback, useRef, useState } from 'react';
import { apiDelete, apiPost } from '../lib/api.js';
import { useShellData } from './useShellData.jsx';
import { useToast } from '../components/ui/Toast.jsx';

// Ticking, un-ticking and skipping a day. Every call answers with the refreshed day, which the screen can show at once;
// the rest of the app (Home, other tabs) is told that something changed so it reloads quietly.
export function useTrackerActions({ onDay } = {}) {
  const toast = useToast();
  const { notifyChanged } = useShellData();
  const [pending, setPending] = useState(() => new Set());
  const onDayRef = useRef(onDay);
  onDayRef.current = onDay;

  const run = useCallback(
    async (key, fn) => {
      setPending((p) => new Set(p).add(key));
      try {
        const result = await fn();
        onDayRef.current?.(result.day);
        notifyChanged();
        return result;
      } catch (err) {
        toast.show(err.message);
        return null;
      } finally {
        setPending((p) => {
          const next = new Set(p);
          next.delete(key);
          return next;
        });
      }
    },
    [notifyChanged, toast]
  );

  return {
    pending,
    isPending: (id, date) => pending.has(`${id}:${date}`),
    tick: (id, date) => run(`${id}:${date}`, () => apiPost(`/api/trackers/${id}/checkins/${date}`, { status: 'done' })),
    untick: (id, date) => run(`${id}:${date}`, () => apiDelete(`/api/trackers/${id}/checkins/${date}`)),
    skip: (id, date, note) => run(`${id}:${date}`, () => apiPost(`/api/trackers/${id}/checkins/${date}`, { status: 'skipped', note })),
  };
}
