import { useState } from 'react';
import { addDays, followUpOptions } from '../../lib/dates.js';
import FollowUpFields from '../home/FollowUpFields.jsx';
import { EMPTY_FOLLOW_UP, followUpValues } from '../../lib/followUp.js';

// Mark done: an optional note, and optionally a new follow-up item ("Follow up: <title>") so the finished task
// leaves the to-do list but the thing you are waiting for does not get lost.
export function DoneForm({ today, busy, onSubmit, onCancel }) {
  const [note, setNote] = useState('');
  const [follow, setFollow] = useState(false);
  const [fields, setFields] = useState(EMPTY_FOLLOW_UP);
  const { waitingOn, checkBack, invalid } = followUpValues(fields, today);
  return (
    <form
      className="waiting-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (follow && invalid) return;
        onSubmit({ note: note.trim(), followUp: follow ? { waitingOn, checkBack } : null });
      }}
    >
      <h2 className="rd-t-item-title waiting-form__title">Mark done</h2>
      <div className="waiting-form__field">
        <label className="rd-t-secondary rd-muted" htmlFor="done-note">
          Add a note (optional)
        </label>
        <textarea id="done-note" className="rd-textarea" rows={3} maxLength={1000} placeholder="For example, paid online, confirmation number 4471" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <button type="button" className={`rd-btn done-follow ${follow ? 'rd-btn--selected' : ''}`} aria-pressed={follow} onClick={() => setFollow((f) => !f)}>
        {follow ? 'Follow-up will be created' : 'Needs a follow-up?'}
      </button>
      {follow && (
        <>
          <p className="rd-t-secondary rd-muted done-follow__hint">A new follow-up with no due date is added to this segment. This task is still marked done.</p>
          <FollowUpFields today={today} value={fields} onChange={setFields} idPrefix="done" />
        </>
      )}
      <div className="picker__buttons">
        <button type="button" className="rd-btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="rd-btn rd-btn--primary" disabled={busy || (follow && invalid)}>
          {follow ? 'Done and follow up' : 'Mark done'}
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
      <h2 className="rd-t-item-title waiting-form__title">New check-back date</h2>
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
