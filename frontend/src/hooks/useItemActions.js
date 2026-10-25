import { useCallback, useState } from 'react';
import { apiPost } from '../lib/api.js';
import { useShellData } from './useShellData.jsx';
import { useToast } from '../components/ui/Toast.jsx';

export function useItemActions() {
  const toast = useToast();
  const { notifyChanged } = useShellData();
  const [pending, setPending] = useState(() => new Set());

  const run = useCallback(
    async (id, action, body, { success, undo = false } = {}) => {
      setPending((p) => new Set(p).add(id));
      try {
        const result = await apiPost(`/api/items/${id}/${action}`, body ?? {});
        if (success) {
          toast.show(
            success,
            undo
              ? {
                  action: {
                    label: 'Undo',
                    onClick: async () => {
                      try {
                        await apiPost(`/api/items/${id}/reopen`, {});
                      } catch (err) {
                        toast.show(err.message);
                      }
                      notifyChanged();
                    },
                  },
                }
              : undefined
          );
        }
        notifyChanged();
        return { ok: true, result };
      } catch (err) {
        toast.show(err.message);
        notifyChanged();
        return { ok: false, error: err.message };
      } finally {
        setPending((p) => {
          const next = new Set(p);
          next.delete(id);
          return next;
        });
      }
    },
    [toast, notifyChanged]
  );

  return { run, pending };
}
