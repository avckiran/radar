import { useEffect, useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import SegmentChip from '../home/SegmentChip.jsx';
import { inboxMeta } from './InboxMeta.js';

export default function SortWideRow({ item, segments, busy, offline, active, onActivate, onMove, openItem, showNumbers, controller }) {
  const [segmentId, setSegmentId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const segment = segments.find((s) => s.id === segmentId);
  const isAction = item.kind === 'action';

  useEffect(() => {
    controller.current = {
      ...controller.current,
      [item.id]: {
        pick: (index) => {
          if (segments[index]) {
            setSegmentId(segments[index].id);
            setOpen(false);
          }
        },
        move: () => segment && !busy && !offline && onMove(segmentId, isAction ? dueDate || null : null),
        toggle: () => setOpen((v) => !v),
      },
    };
  });

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => !box.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  return (
    <div className={`rd-card inbox-wide ${active ? 'inbox-wide--active' : ''}`} onFocusCapture={onActivate} onMouseDown={onActivate}>
      <div className="inbox-wide__item rd-fill">
        <button type="button" className="inbox-wide__title rd-ell" onClick={() => openItem(item.id)}>
          {item.title}
        </button>
        <div className="rd-t-secondary rd-muted rd-ell">{inboxMeta(item)}</div>
      </div>

      <div className="inbox-wide__segment" ref={box}>
        <button type="button" className="rd-btn inbox-wide__choose" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {segment ? <SegmentChip segment={segment} /> : <span className="rd-muted">Choose segment</span>}
          <Icon name="chevd" size={16} />
        </button>
        {open && (
          <div className="rd-popover inbox-wide__menu" role="listbox" aria-label="Segment">
            {segments.map((s, index) => (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={segmentId === s.id}
                className="picker__option"
                onClick={() => {
                  setSegmentId(s.id);
                  setOpen(false);
                }}
              >
                <i className={`rd-dot rd-dot--lg rd-seg-${s.color}`} aria-hidden="true" />
                <span className="rd-fill">{s.name}</span>
                {showNumbers && index < 9 && <kbd className="rd-kbd">{index + 1}</kbd>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="inbox-wide__due">
        {isAction ? (
          <input type="date" className="rd-input" aria-label={`Due date for ${item.title}`} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        ) : (
          <span className="rd-t-secondary rd-quiet">No date</span>
        )}
      </div>

      <button
        type="button"
        className="rd-btn rd-btn--primary inbox-wide__move"
        disabled={!segment || busy || offline}
        onClick={() => onMove(segmentId, isAction ? dueDate || null : null)}
      >
        Move
      </button>
    </div>
  );
}
