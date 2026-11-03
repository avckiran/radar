import { addDays, followUpOptions } from '../../lib/dates.js';

// "Following up with" and "Check back" choices, shared by the Follow-up form and the Done form.
// The parent keeps the values (value = { waitingOn, choice, custom }) and reads them with followUpValues() from lib/followUp.js.
export default function FollowUpFields({ today, value, onChange, idPrefix = 'fu' }) {
  const options = followUpOptions(today);
  const tomorrow = addDays(today, 1);
  const set = (change) => onChange({ ...value, ...change });
  const choice = (key, label) => (
    <button key={key} type="button" className={`rd-btn ${value.choice === key ? 'rd-btn--selected' : ''}`} aria-pressed={value.choice === key} onClick={() => set({ choice: key })}>
      {label}
    </button>
  );
  return (
    <>
      <div className="waiting-form__field">
        <label className="rd-t-secondary rd-muted" htmlFor={`${idPrefix}-with`}>
          Following up with who or what? (optional)
        </label>
        <input
          id={`${idPrefix}-with`}
          className="rd-input"
          maxLength={200}
          value={value.waitingOn}
          onChange={(e) => set({ waitingOn: e.target.value })}
          placeholder="For example, the insurance company"
        />
      </div>
      <fieldset className="waiting-form__field waiting-form__fieldset">
        <legend className="rd-t-secondary rd-muted">Check back</legend>
        <div className="waiting-form__choices">
          {options.map((o) => choice(o.key, o.label))}
          {choice('pick', 'Pick a date')}
          {choice('none', 'No date')}
        </div>
        {value.choice === 'pick' && (
          <input type="date" className="rd-input" aria-label="Check-back date" min={tomorrow} value={value.custom} onChange={(e) => set({ custom: e.target.value })} />
        )}
      </fieldset>
    </>
  );
}
