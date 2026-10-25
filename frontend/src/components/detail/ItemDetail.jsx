import { useEffect, useState } from 'react';
import Icon from '../Icon.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import Overlay from '../ui/Overlay.jsx';
import StateTag from '../home/StateTag.jsx';
import SnoozePicker from '../home/SnoozePicker.jsx';
import WaitingForm from '../home/WaitingForm.jsx';
import Field from './Field.jsx';
import Timeline from './Timeline.jsx';
import WaitingBlock from './WaitingBlock.jsx';
import { DeleteConfirm, DoneForm, ResetForm } from './DetailForms.jsx';
import { useResource } from '../../hooks/useResource.js';
import { useShellData } from '../../hooks/useShellData.jsx';
import { useItemActions } from '../../hooks/useItemActions.js';
import { useOnline } from '../../hooks/useOnline.js';
import { useToast } from '../ui/Toast.jsx';
import { apiDelete, apiPatch, apiPost } from '../../lib/api.js';
import { addDays, dayHint, shortDate } from '../../lib/dates.js';

const KIND_LABEL = { action: 'Action', note: 'Note', link: 'Link' };
const KIND_ICON = { action: 'circle', note: 'note', link: 'link' };

function NotesEditor({ kind, value, disabled, onSave }) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => setDraft(value), [value]);
  const dirty = draft.trim() !== value.trim();
  const large = kind === 'note';

  async function save() {
    setSaving(true);
    const result = await onSave(draft);
    setSaving(false);
    setError(result.ok ? null : result.error);
  }

  return (
    <div className="detail-notes">
      <label className="rd-overline" htmlFor="detail-notes">
        {large ? 'Note' : 'Notes'}
      </label>
      <textarea
        id="detail-notes"
        className={`rd-textarea detail-notes__area ${large ? 'detail-notes__area--large' : ''}`}
        rows={large ? 10 : 4}
        maxLength={20000}
        disabled={disabled}
        placeholder={large ? 'Write the note here' : 'Add notes'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      {error && (
        <p className="waiting-form__error" role="alert">
          {error}
        </p>
      )}
      {dirty && (
        <div className="picker__buttons">
          <button type="button" className="rd-btn" onClick={() => setDraft(value)}>
            Discard
          </button>
          <button type="button" className="rd-btn rd-btn--primary" disabled={disabled || saving} onClick={save}>
            {large ? 'Save note' : 'Save notes'}
          </button>
        </div>
      )}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="detail__body" aria-busy="true" aria-label="Loading item">
      <Skeleton width={120} height={20} />
      <Skeleton height={32} />
      <Skeleton height={56} />
      <Skeleton height={56} />
      <Skeleton height={120} />
    </div>
  );
}

export default function ItemDetail({ itemId, mode, onClose }) {
  const [deleted, setDeleted] = useState(false);
  const { data, loading, error, reload, setData } = useResource(deleted ? null : `/api/items/${itemId}`);
  const shell = useShellData();
  const online = useOnline();
  const toast = useToast();
  const { run, pending } = useItemActions();
  const [dialog, setDialog] = useState(null);
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const segments = shell.data?.segments ?? [];
  const disabled = !online;
  const busyAction = pending.has(itemId);

  if (deleted) return null;

  const goneMessage = error && /not found/i.test(error);

  function closeDialog() {
    setDialog(null);
    setFormError(null);
  }

  async function mutate(call, onDone) {
    try {
      const res = await call();
      if (res) setData(res);
      shell.notifyChanged();
      onDone?.(res);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  const patch = (body) => mutate(() => apiPatch(`/api/items/${itemId}`, body));
  const logFollowUp = (note) => mutate(() => apiPost(`/api/items/${itemId}/follow-ups`, { note }));
  const resetDate = (followUp) => mutate(() => apiPost(`/api/items/${itemId}/follow-up-date`, { followUp }));

  async function remove() {
    setBusy(true);
    try {
      await apiDelete(`/api/items/${itemId}`);
      setDeleted(true);
      toast.show('Deleted');
      onClose();
      shell.notifyChanged();
    } catch (err) {
      setFormError(err.message);
    }
    setBusy(false);
  }

  async function runAction(action, body, options) {
    const result = await run(itemId, action, body, options);
    if (result.ok) closeDialog();
    else setFormError(result.error);
    return result;
  }

  const header = (
    <header className="detail__header">
      {mode === 'screen' ? (
        <button type="button" className="rd-btn rd-btn--ghost detail__back" onClick={onClose} aria-label="Back">
          <Icon name="back" size={20} />
          Back
        </button>
      ) : (
        <span className="rd-overline detail__kind">{data ? KIND_LABEL[data.item.kind] : 'Item'}</span>
      )}
      {mode !== 'screen' && (
        <button type="button" className="rd-btn rd-btn--ghost detail__close" onClick={onClose} aria-label="Close details">
          <Icon name="x" size={20} />
        </button>
      )}
    </header>
  );

  if (loading || (!data && !error)) {
    return (
      <>
        {header}
        <DetailSkeleton />
      </>
    );
  }

  if (!data) {
    return (
      <>
        {header}
        <div className="detail__body">
          <div className="rd-card home__error" role="alert">
            <Icon name="alert" size={22} />
            <div className="rd-fill">
              <div className="allclear__title">{goneMessage ? 'This item is gone' : 'Couldn’t load this item'}</div>
              <div className="rd-t-secondary rd-muted">{goneMessage ? 'It was deleted or moved.' : error}</div>
            </div>
            {!goneMessage && (
              <button type="button" className="rd-btn" onClick={reload}>
                Try again
              </button>
            )}
          </div>
        </div>
      </>
    );
  }

  const { item, actions, waiting, followUps, history, today } = data;
  const segmentOptions = segments.map((s) => ({ value: s.id, label: s.name }));

  const barButtons = {
    done: (
      <button key="done" type="button" className="rd-btn rd-btn--primary" disabled={disabled || busyAction} onClick={() => setDialog('done')}>
        <Icon name="check" size={18} />
        Done
      </button>
    ),
    snooze: (
      <button key="snooze" type="button" className="rd-btn" disabled={disabled || busyAction} onClick={() => setDialog('snooze')}>
        <Icon name="moon" size={18} />
        Snooze
      </button>
    ),
    waiting: (
      <button key="waiting" type="button" className="rd-btn" disabled={disabled || busyAction} onClick={() => setDialog('waiting')}>
        <Icon name="hourglass" size={18} />
        Waiting
      </button>
    ),
    back: (
      <button key="back" type="button" className="rd-btn" disabled={disabled || busyAction} onClick={() => runAction('reopen', {}, { success: 'Back to active' })}>
        <Icon name="back" size={18} />
        Back to Active
      </button>
    ),
    reopen: (
      <button key="reopen" type="button" className="rd-btn rd-btn--primary" disabled={disabled || busyAction} onClick={() => runAction('reopen', {}, { success: 'Reopened' })}>
        <Icon name="refresh" size={18} />
        Reopen
      </button>
    ),
  };

  const stateTag = item.tag ?? (item.kind === 'action' && item.state === 'active' ? { kind: 'later', label: 'Active' } : null);

  return (
    <>
      {header}
      <div className="detail__body">
        <div className="detail__top">
          {mode === 'screen' && <span className="rd-overline detail__kind">{KIND_LABEL[item.kind]}</span>}
          {stateTag && <StateTag tag={stateTag} />}
        </div>
        <Field
          label="Title"
          display={<span className="detail__title">{item.title}</span>}
          value={item.title}
          disabled={disabled}
          onSave={(title) => patch({ title })}
        />
        <p className="rd-t-secondary rd-muted detail__added">
          <Icon name={KIND_ICON[item.kind]} size={14} /> Added by {item.creator || 'someone'} · {item.createdLabel}
        </p>

        <div className="rd-card detail__fields">
          <Field
            label="Segment"
            type="select"
            display={item.segment?.name}
            value={item.segment?.id ?? ''}
            options={segmentOptions}
            placeholder="No segment"
            disabled={disabled}
            onSave={(segmentId) => patch({ segmentId })}
          />
          {item.kind === 'action' && (
            <Field
              label="Due date"
              type="date"
              display={item.dueDate ? shortDate(item.dueDate) : null}
              value={item.dueDate ?? ''}
              placeholder="No date"
              min={addDays(today, -365)}
              allowClear
              disabled={disabled}
              onSave={(dueDate) => patch({ dueDate: dueDate || null })}
            />
          )}
          {item.kind === 'link' && (
            <>
              <div className="detail-field detail-field--static">
                <span className="rd-t-secondary rd-muted detail-field__label">Link</span>
                <span className="detail-field__value rd-ell">{item.domain}</span>
                <a className="rd-btn rd-btn--sm" href={item.url} target="_blank" rel="noopener noreferrer">
                  <Icon name="share" size={16} />
                  Open
                </a>
              </div>
              <Field label="Web address" type="url" display={item.url} value={item.url ?? ''} disabled={disabled} onSave={(url) => patch({ url })} />
            </>
          )}
          {item.kind === 'action' && (
            <Field
              label="Link"
              type="url"
              display={item.url ? item.domain : null}
              value={item.url ?? ''}
              placeholder="No link"
              allowClear
              disabled={disabled}
              onSave={(url) => patch({ url: url || null })}
            />
          )}
        </div>

        {item.kind === 'link' && (
          <div className="detail-notes">
            <label className="rd-overline" htmlFor="detail-description">
              Description
            </label>
            <DescriptionEditor value={item.description} disabled={disabled} onSave={(description) => patch({ description })} />
          </div>
        )}

        {item.kind !== 'link' && (
          <NotesEditor kind={item.kind} value={item.body} disabled={disabled} onSave={(body) => patch({ body })} />
        )}

        {item.kind === 'link' && (
          <p className="rd-reserved detail__saved">
            <Icon name="cloud" size={16} /> Saved copy of the page (Phase 2)
          </p>
        )}

        {waiting && (
          <WaitingBlock
            waiting={waiting}
            followUps={followUps}
            disabled={disabled}
            onLog={logFollowUp}
            onReset={() => setDialog('reset')}
            onDone={() => setDialog('done')}
          />
        )}

        <section aria-label="History">
          <h3 className="rd-overline detail__history-title">History</h3>
          <Timeline entries={history} />
        </section>

        <div className="detail__delete">
          <button type="button" className="rd-btn rd-btn--ghost rd-btn--danger" disabled={disabled} onClick={() => setDialog('delete')}>
            <Icon name="trash" size={16} />
            Delete
          </button>
        </div>
        {disabled && <p className="rd-t-secondary rd-muted detail__offline">You’re offline. You can read this item, but changes wait until you’re back.</p>}
      </div>

      {actions.length > 0 && <div className="detail__bar">{actions.map((key) => barButtons[key])}</div>}

      {dialog === 'done' && (
        <Overlay label="Mark done" onClose={closeDialog}>
          <DoneForm
            busy={busyAction}
            onCancel={closeDialog}
            onSubmit={(note) => runAction('done', note ? { note } : {}, { success: 'Marked done', undo: true })}
          />
        </Overlay>
      )}
      {dialog === 'snooze' && (
        <Overlay label="Snooze" onClose={closeDialog}>
          <h2 className="rd-t-item-title">Snooze until</h2>
          <SnoozePicker today={today} onPick={(until) => runAction('snooze', { until }, { success: `Snoozed until ${dayHint(until, today)}` })} onCancel={closeDialog} />
        </Overlay>
      )}
      {dialog === 'waiting' && (
        <Overlay label="Mark as waiting" onClose={closeDialog}>
          <WaitingForm
            today={today}
            busy={busyAction}
            error={formError}
            onCancel={closeDialog}
            onSubmit={(values) => runAction('waiting', values, { success: 'Marked as waiting' })}
          />
        </Overlay>
      )}
      {dialog === 'reset' && (
        <Overlay label="Reset follow-up date" onClose={closeDialog}>
          <ResetForm
            today={today}
            busy={busy}
            error={formError}
            onCancel={closeDialog}
            onSubmit={async (date) => {
              setBusy(true);
              const result = await resetDate(date);
              setBusy(false);
              if (result.ok) closeDialog();
              else setFormError(result.error);
            }}
          />
        </Overlay>
      )}
      {dialog === 'delete' && (
        <Overlay label="Delete item" onClose={closeDialog}>
          <DeleteConfirm busy={busy} onCancel={closeDialog} onConfirm={remove} />
          {formError && (
            <p className="waiting-form__error" role="alert">
              {formError}
            </p>
          )}
        </Overlay>
      )}
    </>
  );
}

function DescriptionEditor({ value, disabled, onSave }) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => setDraft(value), [value]);
  const dirty = draft.trim() !== value.trim();

  async function save() {
    setSaving(true);
    const result = await onSave(draft);
    setSaving(false);
    setError(result.ok ? null : result.error);
  }

  return (
    <>
      <textarea
        id="detail-description"
        className="rd-textarea"
        rows={3}
        maxLength={1000}
        disabled={disabled}
        placeholder="Add a description"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      {error && (
        <p className="waiting-form__error" role="alert">
          {error}
        </p>
      )}
      {dirty && (
        <div className="picker__buttons">
          <button type="button" className="rd-btn" onClick={() => setDraft(value)}>
            Discard
          </button>
          <button type="button" className="rd-btn rd-btn--primary" disabled={disabled || saving} onClick={save}>
            Save description
          </button>
        </div>
      )}
    </>
  );
}
