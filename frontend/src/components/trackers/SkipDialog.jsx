import { useState } from 'react';
import Overlay from '../ui/Overlay.jsx';
import { LIMITS } from '../../lib/trackers.js';

export default function SkipDialog({ row, dayLabel, busy, onClose, onSkip }) {
  const [note, setNote] = useState('');
  return (
    <Overlay label="Skip this day" onClose={onClose}>
      <form
        className="waiting-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSkip(note);
        }}
      >
        <h2 className="rd-t-item-title waiting-form__title">Skip “{row.title}” {dayLabel.toLowerCase()}?</h2>
        <p className="rd-t-secondary rd-muted trk-dialog__text">A skipped day doesn’t break your streak and isn’t counted as missed.</p>
        <div className="waiting-form__field">
          <label className="rd-t-secondary rd-muted" htmlFor="skip-note">
            Why? (optional)
          </label>
          <input id="skip-note" data-autofocus className="rd-input" maxLength={LIMITS.skipNote} placeholder="Sick, travelling…" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="picker__buttons">
          <button type="button" className="rd-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="rd-btn rd-btn--primary" disabled={busy}>
            Skip
          </button>
        </div>
      </form>
    </Overlay>
  );
}
