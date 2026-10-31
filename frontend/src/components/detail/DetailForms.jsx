import { useState } from 'react';
import { addDays, followUpOptions } from '../../lib/dates.js';

export function DoneForm({ busy, onSubmit, onCancel }) {
  const [note, setNote] = useState('');
  return (
    <form
      className="waiting-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(note.trim());
      }}
    >
      <h2 className="rd-t-item-title waiting-form__title">Mark done</h2>
      <div className="waiting-form__field">
        <label className="rd-t-secondary rd-muted" htmlFor="done-note">
          Add a note (optional)
        </label>
        <textarea id="done-note" className="rd-textarea" rows={3} maxLength={1000} placeholder="For example, paid online, confirmation number 4471" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="picker__buttons">
        <button type="button" className="rd-btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="rd-btn rd-btn--primary" disabled={busy}>
          Mark done
        </button>
      </div>
    </form>
  );
}

export function ResetForm({ today, busy, error, onSubmit, onCancel }) {
  const [custom, setCustom] = useState('');
  const options = followUpOptions(today);
  return (
    <div className="waiting-form">
      <h2 className="rd-t-item-title waiting-form__title">New follow-up date</h2>
      <div className="waiting-form__choices">
        {options.map((o) => (
          <button key={o.key} type="button" className="rd-btn" disabled={busy} onClick={() => onSubmit(o.date)}>
            {o.label}
          </button>
        ))}
        <button type="button" className="rd-btn" disabled={busy} onClick={() => onSubmit(null)}>
          No date
        </button>
      </div>
      <div className="waiting-form__field">
        <label className="rd-t-secondary rd-muted" htmlFor="reset-date">
          Or pick a date
        </label>
        <input id="reset-date" type="date" className="rd-input" min={addDays(today, 1)} value={custom} onChange={(e) => setCustom(e.target.value)} />
      </div>
      {error && (
        <p className="waiting-form__error" role="alert">
          {error}
        </p>
      )}
      <div className="picker__buttons">
        <button type="button" className="rd-btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="rd-btn rd-btn--primary" disabled={busy || !custom} onClick={() => onSubmit(custom)}>
          Set date
        </button>
      </div>
    </div>
  );
}

export function DeleteConfirm({ busy, onConfirm, onCancel }) {
  return (
    <div className="waiting-form">
      <h2 className="rd-t-item-title waiting-form__title">Delete this item?</h2>
      <p className="rd-t-secondary rd-muted capture__plain">It disappears everywhere in RADAR. Its history is kept.</p>
      <div className="picker__buttons">
        <button type="button" className="rd-btn" data-autofocus onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="rd-btn rd-btn--danger" disabled={busy} onClick={onConfirm}>
          Delete
        </button>
      </div>
    </div>
  );
}
