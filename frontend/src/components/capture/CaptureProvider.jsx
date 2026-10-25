import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import CaptureSheet from './CaptureSheet.jsx';
import { useShellData } from '../../hooks/useShellData.jsx';
import { useToast } from '../ui/Toast.jsx';

const Ctx = createContext(() => {});

function isTyping(target) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

export function CaptureProvider({ children }) {
  const [openWith, setOpenWith] = useState(null);
  const { notifyChanged } = useShellData();
  const toast = useToast();

  const openCapture = useCallback((options) => {
    setOpenWith({ segmentId: typeof options?.segmentId === 'string' ? options.segmentId : '' });
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key.toLowerCase() !== 'n' || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (isTyping(e.target) || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      e.preventDefault();
      setOpenWith({ segmentId: '' });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const onSaved = useCallback(
    (result) => {
      setOpenWith(null);
      if (!result.created) toast.show('Already saved.');
      else toast.show(result.segmentName ? `Added to ${result.segmentName}` : 'Saved to Inbox');
      notifyChanged();
    },
    [notifyChanged, toast]
  );

  const value = useMemo(() => openCapture, [openCapture]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {openWith && <CaptureSheet initialSegmentId={openWith.segmentId} onClose={() => setOpenWith(null)} onSaved={onSaved} />}
    </Ctx.Provider>
  );
}

export function useQuickAdd() {
  return useContext(Ctx);
}
