import { useState } from 'react';
import Icon from '../Icon.jsx';
import { addDays, followUpOptions } from '../../lib/dates.js';

export default function WaitingForm({ today, busy, error, onSubmit, onCancel }) {
  const [waitingOn, setWaitingOn] = useState('');
  const [choice, setChoice] = useState('none');
  const [custom, setCustom] = useState('');
  const options = followUpOptions(today);
  const tomorrow = addDays(today, 1);

  const followUp = choice === 'pick' ? custom : (options.find((o) => o.key === choice)?.date ?? null);
  const invalid = choice === 'pick' && (!custom || custom < today);

  function submit(e) {
    e.preventDefault();
    if (!invalid) onSubmit({ waitingOn: waitingOn.trim(), followUp: followUp || null });
  }

  return (
    <form className="waiting-form" onSubmit={submit}>
      <h2 className="rd-t-item-title waiting-form__title">Waiting on someone or something</h2>
      <div className="waiting-form__field">
        <label className="rd-t-secondary rd-muted" htmlFor="waiting-on">
          Who or what? (optional)
        </label>
        <input
          id="waiting-on"
          className="rd-input"
          maxLength={200}
          value={waitingOn}
          onChange={(e) => setWaitingOn(e.target.value)}
          placeholder="For example, the insurance company"
        />
      </div>
      <fieldset className="waiting-form__field waiting-form__fieldset">
        <legend className="rd-t-secondary rd-muted">Follow up</legend>
        <div className="waiting-form__choices">
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              className={`rd-btn ${choice === o.key ? 'rd-btn--selected' : ''}`}
              aria-pressed={choice === o.key}
              onClick={() => setChoice(o.key)}
            >
              {o.label}
            </button>
          ))}
          <button
            type="button"
            className={`rd-btn ${choice === 'pick' ? 'rd-btn--selected' : ''}`}
            aria-pressed={choice === 'pick'}
            onClick={() => setChoice('pick')}
          >
            Pick a date
          </button>
          <button
            type="button"
            className={`rd-btn ${choice === 'none' ? 'rd-btn--selected' : ''}`}
            aria-pressed={choice === 'none'}
            onClick={() => setChoice('none')}
          >
            No date
          </button>
        </div>
        {choice === 'pick' && (
          <input
            type="date"
            className="rd-input"
            aria-label="Follow-up date"
            min={tomorrow}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
        )}
      </fieldset>
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
          Mark as waiting
        </button>
      </div>
    </form>
  );
}
