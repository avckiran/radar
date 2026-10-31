import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import ItemDetail from './ItemDetail.jsx';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { useOpenItem } from '../../hooks/useOpenItem.js';

const INERT_SELECTORS = ['.shell__main', '.shell__bottom', '.shell__sidebar'];

export default function DetailHost() {
  const [params] = useSearchParams();
  const itemId = params.get('item');
  const { closeItem } = useOpenItem();
  const wide = useMediaQuery('(min-width: 768px)');
  const docked = useMediaQuery('(min-width: 1100px)');
  const ref = useRef(null);
  const open = !!itemId;

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    ref.current?.focus();
    return () => {
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, [open, wide]);

  useEffect(() => {
    if (!open || wide) return undefined;
    const nodes = INERT_SELECTORS.flatMap((s) => [...document.querySelectorAll(s)]);
    nodes.forEach((n) => n.setAttribute('inert', ''));
    return () => nodes.forEach((n) => n.removeAttribute('inert'));
  }, [open, wide]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented) closeItem();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closeItem]);

  if (!open) return null;

  if (!wide) {
    return (
      <div ref={ref} tabIndex={-1} className="detail-screen" role="dialog" aria-modal="true" aria-label="Item details">
        <ItemDetail key={itemId} itemId={itemId} mode="screen" onClose={closeItem} />
      </div>
    );
  }
  return (
    <aside ref={ref} tabIndex={-1} className={`detail-panel ${docked ? 'detail-panel--docked' : ''}`} aria-label="Item details">
      <ItemDetail key={itemId} itemId={itemId} mode="panel" onClose={closeItem} />
    </aside>
  );
}
