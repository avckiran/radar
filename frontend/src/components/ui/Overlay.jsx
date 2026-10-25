import { useEffect, useRef } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), textarea, select, [href], [tabindex]:not([tabindex="-1"])';

export default function Overlay({ label, onClose, onBackdrop, expanded = false, handle = true, children }) {
  const wide = useMediaQuery('(min-width: 768px)');
  const panel = useRef(null);

  useEffect(() => {
    const opener = document.activeElement;
    const first = panel.current?.querySelector('[data-autofocus]') ?? panel.current?.querySelector(FOCUSABLE);
    (first ?? panel.current)?.focus();
    return () => {
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, []);

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const nodes = [...panel.current.querySelectorAll(FOCUSABLE)];
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className={`overlay ${wide ? 'overlay--center' : ''}`} onClick={onBackdrop === undefined ? onClose : (onBackdrop ?? undefined)}>
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`overlay__panel ${wide ? 'rd-modal' : 'rd-sheet'} ${expanded ? 'overlay__panel--expanded' : ''}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        {!wide && handle && <div className="rd-grab" aria-hidden="true" />}
        {children}
      </div>
    </div>
  );
}
