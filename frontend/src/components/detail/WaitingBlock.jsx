import { useState } from 'react';
import Timeline from './Timeline.jsx';

export default function WaitingBlock({ waiting, followUps, disabled, onLog, onReset, onDone }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const latest = followUps[0]?.type === 'follow_up' && followUps[0].kind !== 'reset' ? followUps[0].id : null;

  async function submit(e) {
    e.preventDefault();
    if (!note.trim()) return;
    setSaving(true);
    const result = await onLog(note.trim());
    setSaving(false);
    if (result.ok) {
      setNote('');
      setError(null);
    } else setError(result.error);
  }

  return (
    <section className="rd-card detail-wait" aria-label="Waiting">
      <h3 className="rd-overline">Waiting</h3>
      <dl className="detail-wait__kv">
        <div>
          <dt className="rd-t-secondary rd-muted">Waiting on</dt>
          <dd>{waiting.on ?? 'Not set'}</dd>
        </div>
        <div>
          <dt className="rd-t-secondary rd-muted">Since</dt>
          <dd>{waiting.since}</dd>
        </div>
        <div>
          <dt className="rd-t-secondary rd-muted">Follow up</dt>
          <dd>{waiting.followUp ?? 'Not set'}</dd>
        </div>
      </dl>

      <h3 className="rd-overline">Follow-up log</h3>
      <form className="detail-wait__composer" onSubmit={submit}>
        <textarea
          className="rd-textarea"
          rows={2}
          aria-label="What happened?"
          placeholder="What happened? e.g. called, told 3–5 days"
          maxLength={1000}
          disabled={disabled}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {error && (
          <p className="waiting-form__error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="rd-btn rd-btn--primary" disabled={disabled || saving || !note.trim()}>
          Log follow-up
        </button>
      </form>

      <Timeline
        entries={followUps}
        renderAfter={(entry) =>
          entry.id === latest ? (
            <span className="detail-wait__next">
              <button type="button" className="rd-btn rd-btn--sm" disabled={disabled} onClick={onReset}>
                Reset follow-up date
              </button>
              <button type="button" className="rd-btn rd-btn--sm" disabled={disabled} onClick={onDone}>
                Mark done
              </button>
            </span>
          ) : null
        }
      />
      {followUps.length <= 1 && (
        <p className="rd-reserved detail-wait__hint">No follow-ups yet. Log what happened each time you reach out.</p>
      )}
    </section>
  );
}
