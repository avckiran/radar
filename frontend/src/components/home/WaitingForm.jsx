import { useState } from 'react';
import Icon from '../Icon.jsx';
import FollowUpFields from './FollowUpFields.jsx';
import { EMPTY_FOLLOW_UP, followUpValues } from '../../lib/followUp.js';

export default function WaitingForm({ today, busy, error, onSubmit, onCancel }) {
  const [fields, setFields] = useState(EMPTY_FOLLOW_UP);
  const { waitingOn, checkBack, invalid } = followUpValues(fields, today);

  function submit(e) {
    e.preventDefault();
    if (!invalid) onSubmit({ waitingOn, followUp: checkBack });
  }

  return (
    <form className="waiting-form" onSubmit={submit}>
      <h2 className="rd-t-item-title waiting-form__title">Follow up on someone or something</h2>
      <FollowUpFields today={today} value={fields} onChange={setFields} idPrefix="waiting" />
      {error && (
        <p className="waiting-form__error" role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}
      <div className="picker__buttons">
        <button type="button" className="rd-btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="rd-btn rd-btn--primary" disabled={busy || invalid}>
          Mark as follow-up
        </button>
      </div>
    </form>
  );
}
