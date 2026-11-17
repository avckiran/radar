import { useRef, useState } from 'react';
import Overlay from '../ui/Overlay.jsx';
import { apiPatch, apiPost } from '../../lib/api.js';
import { newId } from '../../lib/ids.js';
import {
  DAY_CHIPS,
  DAY_PRESETS,
  LIMITS,
  MODES,
  PARTS,
  emptyForm,
  formFromTracker,
  formProblem,
  samePreset,
  scheduleBody,
  scheduleChanged,
  toggleDay,
} from '../../lib/trackers.js';

function Field({ id, label, children, hint }) {
  return (
    <div className="waiting-form__field">
      <span className="rd-t-secondary rd-muted" id={`${id}-label`}>
        {label}
      </span>
      {children}
      {hint && <span className="rd-t-secondary rd-quiet">{hint}</span>}
    </div>
  );
}

function Segmented({ label, value, options, onChange, disabled }) {
  return (
    <div className="rd-segmented trk-segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.key} type="button" aria-pressed={value === o.key} disabled={disabled} onClick={() => onChange(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// The ID is made once per form, so pressing Save twice never makes two trackers.
export default function TrackerForm({ tracker, today, onClose, onSaved }) {
  const isNew = !tracker;
  const id = useRef(newId());
  const [form, setForm] = useState(() => (tracker ? formFromTracker(tracker, today) : emptyForm(today)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const locked = !isNew && (tracker.status === 'paused' || tracker.status === 'finished');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function submit(e) {
    e.preventDefault();
    const problem = formProblem(form, { isNew, today });
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const endDate = form.hasEnd ? form.endDate : null;
      let saved;
      if (isNew) {
        saved = await apiPost('/api/trackers', {
          id: id.current,
          title: form.title,
          note: form.note,
          scope: form.scope,
          part: form.part,
          startDate: form.startDate,
          endDate,
          schedule: scheduleBody(form),
        });
      } else {
        saved = await apiPatch(`/api/trackers/${tracker.id}`, { title: form.title, note: form.note, part: form.part, endDate });
        if (!locked && scheduleChanged(form, tracker.schedule)) saved = await apiPost(`/api/trackers/${tracker.id}/schedule`, scheduleBody(form));
      }
      onSaved(saved.tracker, isNew);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Overlay label={isNew ? 'New tracker' : 'Edit tracker'} onClose={onClose} expanded>
      <form className="waiting-form trk-form" onSubmit={submit}>
        <h2 className="rd-t-item-title waiting-form__title">{isNew ? 'New tracker' : 'Edit tracker'}</h2>

        <div className="waiting-form__field">
          <label className="rd-t-secondary rd-muted" htmlFor="trk-title">
            Name
          </label>
          <input id="trk-title" data-autofocus className="rd-input" maxLength={LIMITS.title} placeholder="Take vitamins, Meditate, Trash out…" value={form.title} onChange={(e) => set({ title: e.target.value })} />
        </div>

        <Field id="trk-often" label="How often">
          {locked ? (
            <p className="rd-t-secondary rd-quiet trk-dialog__text">{tracker.status === 'paused' ? 'Resume this tracker to change how often it happens.' : 'This tracker has finished.'}</p>
          ) : (
            <>
              <Segmented label="How often" value={form.mode} options={MODES} onChange={(mode) => set({ mode })} />
              {form.mode === 'days' && (
                <>
                  <div className="trk-days" role="group" aria-label="Days of the week">
                    {DAY_CHIPS.map((d) => (
                      <button key={d.value} type="button" className="rd-btn trk-day" aria-pressed={form.days.includes(d.value)} aria-label={d.name} onClick={() => set({ days: toggleDay(form.days, d.value) })}>
                        {d.letter}
                      </button>
                    ))}
                  </div>
                  <div className="trk-presets">
                    {DAY_PRESETS.map((p) => (
                      <button key={p.key} type="button" className={`rd-btn rd-btn--sm ${samePreset(form.days, p) ? 'rd-btn--selected' : ''}`} onClick={() => set({ days: p.days })}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {form.mode === 'interval' && (
                <div className="trk-inline">
                  <label htmlFor="trk-interval">Every</label>
                  <select id="trk-interval" className="rd-input trk-select" value={form.intervalDays} onChange={(e) => set({ intervalDays: Number(e.target.value) })}>
                    {Array.from({ length: 29 }, (_, i) => i + 2).map((n) => (
                      <option key={n} value={n}>
                        {n === 2 ? '2 days (every other day)' : `${n} days`}
                      </option>
                    ))}
                  </select>
                  <span className="rd-t-secondary rd-quiet">
                    {isNew ? `counting from ${form.startDate === today ? 'today' : 'the start date'}` : 'counting from today'}
                  </span>
                </div>
              )}
              {form.mode === 'weekly' && (
                <div className="trk-inline">
                  <label htmlFor="trk-perweek">Do it on</label>
                  <select id="trk-perweek" className="rd-input trk-select" value={form.perWeek} onChange={(e) => set({ perWeek: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? 'day' : 'days'} a week
                      </option>
                    ))}
                  </select>
                  <span className="rd-t-secondary rd-quiet">any days you like</span>
                </div>
              )}
              {!isNew && <span className="rd-t-secondary rd-quiet">A new schedule starts today. Past days stay as they were.</span>}
            </>
          )}
        </Field>

        <Field id="trk-part" label="Time of day">
          <Segmented label="Time of day" value={form.part} options={PARTS} onChange={(part) => set({ part })} />
        </Field>

        <Field id="trk-scope" label="Whose is it?" hint={form.scope === 'household' ? 'Everyone in the household sees it, and one tick covers everybody.' : 'Only you can see it.'}>
          {isNew ? (
            <Segmented
              label="Whose is it"
              value={form.scope}
              options={[
                { key: 'personal', label: 'Just me' },
                { key: 'household', label: 'Household' },
              ]}
              onChange={(scope) => set({ scope })}
            />
          ) : (
            <p className="rd-t-secondary rd-muted trk-dialog__text">{tracker.scope === 'household' ? 'Household tracker' : 'Just you'}. This can’t be changed later.</p>
          )}
        </Field>

        {isNew && (
          <div className="waiting-form__field">
            <label className="rd-t-secondary rd-muted" htmlFor="trk-start">
              Starts
            </label>
            <input id="trk-start" type="date" className="rd-input" min={today} value={form.startDate} onChange={(e) => set({ startDate: e.target.value || today })} />
          </div>
        )}

        {tracker?.status !== 'finished' && (
          <div className="waiting-form__field">
            <label className="trk-switch">
              <input type="checkbox" className="settings-check" checked={form.hasEnd} onChange={(e) => set({ hasEnd: e.target.checked })} />
              <span>Ends on a date</span>
            </label>
            {form.hasEnd && (
              <>
                <label className="sr-only" htmlFor="trk-end">
                  End date
                </label>
                <input id="trk-end" type="date" className="rd-input" min={isNew ? form.startDate : today} value={form.endDate} onChange={(e) => set({ endDate: e.target.value })} />
              </>
            )}
          </div>
        )}

        <div className="waiting-form__field">
          <label className="rd-t-secondary rd-muted" htmlFor="trk-note">
            Note (optional)
          </label>
          <textarea id="trk-note" className="rd-textarea" rows={2} maxLength={LIMITS.note} placeholder="Before breakfast, ten minutes…" value={form.note} onChange={(e) => set({ note: e.target.value })} />
        </div>

        {error && (
          <p className="waiting-form__error rd-t-secondary" role="alert">
            {error}
          </p>
        )}
        <div className="picker__buttons">
          <button type="button" className="rd-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="rd-btn rd-btn--primary" disabled={busy}>
            {isNew ? 'Create tracker' : 'Save'}
          </button>
        </div>
      </form>
    </Overlay>
  );
}
