import { useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, dueShortcuts, shortDate } from '../../lib/dates.js';

export default function SortPhone({ item, segments, today, busy, offline, onMove, openDetails }) {
  const [segmentId, setSegmentId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [picking, setPicking] = useState(false);
  const segment = segments.find((s) => s.id === segmentId);
  const isAction = item.kind === 'action';

  return (
    <div className="sorter">
      <div className="rd-overline">Segment</div>
      <div className="sorter__grid">
        {segments.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`rd-btn rd-btn--sm sorter__seg ${segmentId === s.id ? 'rd-btn--selected' : ''}`}
            aria-pressed={segmentId === s.id}
            onClick={() => setSegmentId(s.id)}
          >
            <i className={`rd-dot rd-seg-${s.color}`} aria-hidden="true" />
            <span className="rd-ell">{s.name}</span>
          </button>
        ))}
      </div>
      {isAction && (
        <>
          <div className="rd-overline">Due date (optional)</div>
          <div className="sorter__dates">
            {dueShortcuts(today).map((d) => (
              <button
                key={d.key}
                type="button"
                className={`rd-btn rd-btn--sm ${dueDate === d.date ? 'rd-btn--selected' : ''}`}
                aria-pressed={dueDate === d.date}
                onClick={() => {
                  setDueDate(dueDate === d.date ? '' : d.date);
                  setPicking(false);
                }}
              >
                {d.label}
              </button>
            ))}
            <button type="button" className={`rd-btn rd-btn--sm ${picking ? 'rd-btn--selected' : ''}`} aria-expanded={picking} onClick={() => setPicking((v) => !v)}>
              Pick
            </button>
          </div>
          {picking && (
            <input type="date" className="rd-input" aria-label="Due date" min={addDays(today, -365)} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          )}
          {dueDate && <div className="rd-t-secondary rd-muted">Due {shortDate(dueDate)}</div>}
        </>
      )}
      <button
        type="button"
        className="rd-btn rd-btn--primary sorter__move"
        disabled={!segment || busy || offline}
        onClick={() => onMove(segmentId, isAction ? dueDate || null : null)}
      >
        {segment ? `Move to ${segment.name}` : 'Pick a segment'}
      </button>
      <Link to={openDetails} className="sorter__details">
        Open details
      </Link>
    </div>
  );
}
