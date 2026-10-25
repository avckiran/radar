import { useState } from 'react';
import { addDays, dayHint, snoozeOptions } from '../../lib/dates.js';

export default function SnoozePicker({ today, onPick, onCancel }) {
  const [picking, setPicking] = useState(false);
  const [date, setDate] = useState('');
  const tomorrow = addDays(today, 1);

  return (
    <div className="picker">
      {snoozeOptions(today).map((option) => (
        <button key={option.key} type="button" className="picker__option" onClick={() => onPick(option.date)}>
          <span className="rd-fill">{option.label}</span>
          <span className="rd-quiet">{dayHint(option.date, today)}</span>
        </button>
      ))}
      {!picking ? (
        <button type="button" className="picker__option" onClick={() => setPicking(true)}>
          <span className="rd-fill">Pick a date</span>
        </button>
      ) : (
        <div className="picker__date">
          <label className="rd-t-secondary rd-muted" htmlFor="snooze-date">
            Snooze until
          </label>
          <input
            id="snooze-date"
            type="date"
            className="rd-input"
            min={tomorrow}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <div className="picker__buttons">
            <button type="button" className="rd-btn" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="rd-btn rd-btn--primary" disabled={!date || date < tomorrow} onClick={() => onPick(date)}>
              Snooze
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
