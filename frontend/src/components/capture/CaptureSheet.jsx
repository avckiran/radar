import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import Overlay from '../ui/Overlay.jsx';
import { apiPost } from '../../lib/api.js';
import { newId } from '../../lib/ids.js';
import { addDays, monthDay, weekdayShort } from '../../lib/dates.js';
import { domainOf, looksLikeUrl } from '../../lib/links.js';
import { useShellData } from '../../hooks/useShellData.jsx';
import { useOnline } from '../../hooks/useOnline.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { readLastType, rememberType } from '../../lib/lastType.js';

const TYPES = {
  action: { label: 'Action', icon: 'check', heading: 'Add something' },
  note: { label: 'Note', icon: 'note', heading: 'New note' },
  link: { label: 'Link', icon: 'link', heading: 'New link' },
};

function dueLabel(ymd) {
  return `${weekdayShort(ymd)} ${monthDay(ymd)}`;
}

function GrowingText({ value, onChange, expanded, ...rest }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    if (!expanded) el.style.height = `${el.scrollHeight}px`;
  }, [value, expanded]);
  return <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

function Handle({ onExpand, onCloseRequest }) {
  const startY = useRef(null);
  return (
    <button
      type="button"
      className="capture__handle"
      aria-label="Expand to full screen"
      onPointerDown={(e) => {
        startY.current = e.clientY;
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }}
      onPointerUp={(e) => {
        if (startY.current === null) return;
        const dy = e.clientY - startY.current;
        startY.current = null;
        if (dy < -30 || Math.abs(dy) < 8) onExpand();
        else if (dy > 60) onCloseRequest();
      }}
    >
      <span className="rd-grab" aria-hidden="true" />
    </button>
  );
}

function OptionButton({ icon, label, active, open, onClick }) {
  return (
    <button
      type="button"
      className={`rd-btn rd-btn--sm capture__option ${active || open ? 'rd-btn--selected' : ''}`}
      aria-expanded={open}
      onClick={onClick}
    >
      <Icon name={icon} size={16} />
      <span className="rd-ell">{label}</span>
    </button>
  );
}

export default function CaptureSheet({ onClose, onSaved }) {
  const shell = useShellData();
  const online = useOnline();
  const wide = useMediaQuery('(min-width: 768px)');
  const desktop = useMediaQuery('(min-width: 1024px)');
  const segments = shell.data?.segments ?? [];
  const today = shell.data?.today ?? null;

  const [draft, setDraft] = useState(() => ({
    type: readLastType(),
    title: '',
    body: '',
    url: '',
    description: '',
    attachedUrl: '',
    segmentId: '',
    dueDate: '',
  }));
  const [expanded, setExpanded] = useState(false);
  const [panel, setPanel] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [hintDismissed, setHintDismissed] = useState(false);
  const itemId = useRef(newId());
  const root = useRef(null);
  const mounted = useRef(false);

  const { type, title, body, url, description, attachedUrl, segmentId, dueDate } = draft;
  const info = TYPES[type];
  const segment = segments.find((s) => s.id === segmentId) ?? null;
  const dirty = [title, body, url, description, attachedUrl].some((v) => v.trim());
  const canSave = type === 'action' ? !!title.trim() : type === 'note' ? !!(title.trim() || body.trim()) : !!url.trim();
  const fullScreen = expanded && !wide;

  const set = (field, value) => {
    setDraft((d) => ({ ...d, [field]: value }));
    setError(null);
  };

  function chooseType(next) {
    if (next === type) return;
    set('type', next);
    rememberType(next);
    setPanel(null);
  }

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (!confirming) root.current?.closest('[role="dialog"]')?.querySelector('[data-autofocus]')?.focus();
  }, [type, confirming]);

  function requestClose() {
    if (confirming) setConfirming(false);
    else if (dirty) setConfirming(true);
    else onClose();
  }

  async function submit() {
    if (!canSave || saving || !online) return;
    const base = { id: itemId.current, kind: type, segmentId: segmentId || null };
    const payload =
      type === 'action'
        ? { ...base, title, dueDate: dueDate || null, url: attachedUrl || null }
        : type === 'note'
          ? { ...base, title, body }
          : { ...base, url, title, description };
    setSaving(true);
    setError(null);
    try {
      const result = await apiPost('/api/items', payload);
      rememberType(type);
      onSaved(result);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  function useLink() {
    setDraft((d) => ({ ...d, type: 'link', url: d.title.trim(), title: '' }));
    rememberType('link');
  }

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) set('url', text.trim());
    } catch {
      root.current?.querySelector('[data-autofocus]')?.focus();
    }
  }

  const suggestLink = type === 'action' && !hintDismissed && looksLikeUrl(title);
  const domain = domainOf(url);
  const attachedDomain = domainOf(attachedUrl);
  const toggle = (name) => setPanel((p) => (p === name ? null : name));
  const tomorrow = today ? addDays(today, 1) : null;

  const helper = segment
    ? type === 'action'
      ? `Goes straight to ${segment.name} · Active`
      : `Filed in ${segment.name}`
    : 'No segment chosen. It goes to your Inbox to sort later.';
  const shortHelper = segment ? `${segment.name} · ${type === 'action' ? 'Active' : 'filed'}` : 'No segment · goes to Inbox';

  const options = (
    <>
      <div className="capture__options">
        <OptionButton icon="folder" label={segment?.name ?? 'Segment'} active={!!segment} open={panel === 'segment'} onClick={() => toggle('segment')} />
        {type === 'action' && (
          <>
            <OptionButton icon="cal" label={dueDate ? dueLabel(dueDate) : 'Due date'} active={!!dueDate} open={panel === 'due'} onClick={() => toggle('due')} />
            <OptionButton icon="link" label={attachedDomain || 'Link'} active={!!attachedUrl} open={panel === 'link'} onClick={() => toggle('link')} />
          </>
        )}
      </div>
      {panel === 'segment' && (
        <div className="capture__panel" role="group" aria-label="Segment">
          <button
            type="button"
            className={`rd-btn rd-btn--sm ${!segmentId ? 'rd-btn--selected' : ''}`}
            aria-pressed={!segmentId}
            onClick={() => {
              set('segmentId', '');
              setPanel(null);
            }}
          >
            No segment
          </button>
          {segments.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`rd-btn rd-btn--sm ${segmentId === s.id ? 'rd-btn--selected' : ''}`}
              aria-pressed={segmentId === s.id}
              onClick={() => {
                set('segmentId', s.id);
                setPanel(null);
              }}
            >
              <i className={`rd-dot rd-seg-${s.color}`} aria-hidden="true" />
              <span className="rd-ell">{s.name}</span>
            </button>
          ))}
        </div>
      )}
      {panel === 'due' && (
        <div className="capture__panel" role="group" aria-label="Due date">
          {today && (
            <>
              <button type="button" className={`rd-btn rd-btn--sm ${dueDate === today ? 'rd-btn--selected' : ''}`} onClick={() => set('dueDate', today)}>
                Today
              </button>
              <button type="button" className={`rd-btn rd-btn--sm ${dueDate === tomorrow ? 'rd-btn--selected' : ''}`} onClick={() => set('dueDate', tomorrow)}>
                Tomorrow
              </button>
            </>
          )}
          <input type="date" className="rd-input capture__date" aria-label="Pick a due date" value={dueDate} onChange={(e) => set('dueDate', e.target.value)} />
          {dueDate && (
            <button type="button" className="rd-btn rd-btn--sm rd-btn--ghost" onClick={() => set('dueDate', '')}>
              Clear
            </button>
          )}
        </div>
      )}
      {panel === 'link' && (
        <div className="capture__panel" role="group" aria-label="Link">
          <input
            className="rd-input"
            inputMode="url"
            autoCapitalize="none"
            aria-label="Link address"
            placeholder="Paste a link"
            value={attachedUrl}
            onChange={(e) => set('attachedUrl', e.target.value)}
          />
          {attachedUrl && (
            <button type="button" className="rd-btn rd-btn--sm rd-btn--ghost" onClick={() => set('attachedUrl', '')}>
              Clear
            </button>
          )}
        </div>
      )}
    </>
  );

  const saveLabel = saving ? 'Saving…' : 'Save';
  const saveDisabled = !canSave || saving || !online;
  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ ↵' : 'Ctrl ↵';

  return (
    <Overlay label={info.heading} onClose={requestClose} onBackdrop={dirty ? null : onClose} expanded={expanded} handle={false}>
      {confirming ? (
        <div className="capture__confirm">
          <h2 className="rd-t-item-title">Discard this draft?</h2>
          <p className="rd-t-secondary rd-muted">Your draft hasn’t been saved.</p>
          <div className="picker__buttons">
            <button type="button" className="rd-btn" data-autofocus onClick={() => setConfirming(false)}>
              Keep editing
            </button>
            <button type="button" className="rd-btn rd-btn--danger" onClick={onClose}>
              Discard
            </button>
          </div>
        </div>
      ) : (
        <form
          ref={root}
          className={`capture ${expanded ? 'capture--expanded' : ''}`}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
        >
          {!wide && !expanded && <Handle onExpand={() => setExpanded(true)} onCloseRequest={requestClose} />}

          {fullScreen ? (
            <div className="capture__header capture__header--full">
              <button type="button" className="rd-btn rd-btn--ghost" onClick={requestClose}>
                Cancel
              </button>
              <h2 className="rd-t-item-title">{info.heading}</h2>
              <button type="submit" className="rd-btn rd-btn--primary rd-btn--sm" disabled={saveDisabled}>
                {saveLabel}
              </button>
            </div>
          ) : (
            <div className="capture__header">
              <h2 className="rd-t-item-title rd-fill">{info.heading}</h2>
              <button
                type="button"
                className="rd-btn rd-btn--ghost capture__icon"
                aria-label={expanded ? 'Collapse' : 'Expand to full screen'}
                onClick={() => setExpanded((v) => !v)}
              >
                <Icon name={expanded ? 'collapse' : 'expand'} size={18} />
              </button>
              <button type="button" className="rd-btn rd-btn--ghost capture__icon" aria-label="Close" onClick={requestClose}>
                <Icon name="x" size={18} />
              </button>
            </div>
          )}

          {!fullScreen && (
            <div className="rd-segmented" role="group" aria-label="Type">
              {Object.entries(TYPES).map(([key, t]) => (
                <button key={key} type="button" aria-pressed={type === key} onClick={() => chooseType(key)}>
                  <Icon name={t.icon} size={16} />
                  {t.label}
                </button>
              ))}
            </div>
          )}

          <div className="capture__fields">
            {type === 'action' && (
              <>
                <input
                  className="rd-input"
                  aria-label="Title"
                  placeholder="What do you want to remember?"
                  maxLength={300}
                  data-autofocus
                  value={title}
                  onChange={(e) => set('title', e.target.value)}
                />
                {suggestLink && (
                  <div className="capture__hint" role="status">
                    <Icon name="link" size={16} />
                    <span className="rd-fill">Looks like a link. Save as Link?</span>
                    <button type="button" className="rd-btn rd-btn--sm" onClick={useLink}>
                      Use Link
                    </button>
                    <button type="button" className="rd-btn rd-btn--sm rd-btn--ghost" aria-label="Keep as an action" onClick={() => setHintDismissed(true)}>
                      <Icon name="x" size={16} />
                    </button>
                  </div>
                )}
              </>
            )}

            {type === 'note' && (
              <>
                <input
                  className="rd-input"
                  aria-label="Title"
                  placeholder="Title (optional)"
                  maxLength={300}
                  data-autofocus
                  value={title}
                  onChange={(e) => set('title', e.target.value)}
                />
                <GrowingText
                  className="rd-textarea capture__body"
                  aria-label="Note"
                  placeholder="Write your note"
                  rows={5}
                  maxLength={20000}
                  expanded={expanded}
                  value={body}
                  onChange={(v) => set('body', v)}
                />
              </>
            )}

            {type === 'link' && (
              <>
                <div className="capture__paste">
                  <input
                    className="rd-input"
                    aria-label="Link address"
                    inputMode="url"
                    autoCapitalize="none"
                    placeholder="Paste a link"
                    data-autofocus
                    value={url}
                    onChange={(e) => set('url', e.target.value)}
                  />
                  <button type="button" className="rd-btn" onClick={paste}>
                    <Icon name="paste" size={16} />
                    Paste
                  </button>
                </div>
                {domain && <div className="rd-t-secondary rd-muted capture__domain">{domain}</div>}
                <input
                  className="rd-input"
                  aria-label="Title"
                  placeholder={domain || 'Title (optional)'}
                  maxLength={300}
                  value={title}
                  onChange={(e) => set('title', e.target.value)}
                />
                <GrowingText
                  className="rd-textarea"
                  aria-label="Description"
                  placeholder="Description (optional)"
                  rows={2}
                  maxLength={1000}
                  expanded={false}
                  value={description}
                  onChange={(v) => set('description', v)}
                />
              </>
            )}
          </div>

          {fullScreen ? (
            <div className="capture__bar">
              {options}
              <div className="capture__barline">
                <span className="rd-t-secondary rd-muted rd-fill rd-ell">{shortHelper}</span>
                <button type="button" className="rd-btn rd-btn--sm rd-btn--ghost" onClick={() => setExpanded(false)}>
                  <Icon name="collapse" size={16} />
                  Collapse
                </button>
              </div>
            </div>
          ) : (
            <>
              {options}
              <div className="rd-t-secondary rd-muted">{helper}</div>
            </>
          )}

          {!online && (
            <div className="rd-banner capture__notice" role="status">
              <Icon name="offline" size={18} />
              <span>You’re offline. Capture needs a connection for now.</span>
            </div>
          )}
          {error && (
            <div className="rd-banner rd-banner--error capture__notice" role="alert">
              <Icon name="alert" size={18} />
              <span className="rd-fill">{error}</span>
              <button type="button" className="rd-btn rd-btn--sm" disabled={saving} onClick={submit}>
                Try again
              </button>
            </div>
          )}

          {!fullScreen && (
            <div className="capture__footer">
              {desktop && (
                <span className="rd-t-secondary rd-quiet capture__keys">
                  <kbd className="rd-kbd">N</kbd> to add anywhere · <kbd className="rd-kbd">{shortcut}</kbd> to save
                </span>
              )}
              {wide && (
                <button type="button" className="rd-btn" onClick={requestClose}>
                  Cancel
                </button>
              )}
              <button type="submit" className={`rd-btn rd-btn--primary ${wide ? '' : 'capture__save-full'}`} disabled={saveDisabled}>
                {saveLabel}
              </button>
            </div>
          )}
        </form>
      )}
    </Overlay>
  );
}
