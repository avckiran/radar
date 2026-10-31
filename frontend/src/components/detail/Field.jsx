import { useState } from 'react';
import Icon from '../Icon.jsx';

export default function Field({ label, display, value, type = 'text', options = [], placeholder, min, allowClear = false, disabled, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function start() {
    setDraft(value ?? '');
    setError(null);
    setEditing(true);
  }

  async function save(next = draft) {
    setSaving(true);
    const result = await onSave(next);
    setSaving(false);
    if (result.ok) setEditing(false);
    else setError(result.error);
  }

  if (!editing) {
    return (
      <button type="button" className="detail-field" disabled={disabled} aria-label={`Edit ${label}`} onClick={start}>
        <span className="rd-t-secondary rd-muted detail-field__label">{label}</span>
        <span className="detail-field__value rd-ell">{display || <span className="rd-quiet">{placeholder ?? 'Not set'}</span>}</span>
        <Icon name="edit" size={16} />
      </button>
    );
  }

  return (
    <form
      className="detail-field detail-field--editing"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          setEditing(false);
        }
      }}
    >
      <label className="rd-t-secondary rd-muted" htmlFor={`field-${label}`}>
        {label}
      </label>
      {type === 'select' ? (
        <select id={`field-${label}`} className="rd-input" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}>
          {value ? null : <option value="">Choose…</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={`field-${label}`}
          className="rd-input"
          type={type}
          autoFocus
          min={min}
          inputMode={type === 'url' ? 'url' : undefined}
          autoCapitalize={type === 'url' ? 'none' : undefined}
          maxLength={type === 'text' ? 300 : undefined}
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      )}
      {error && (
        <p className="waiting-form__error" role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}
      <div className="picker__buttons">
        {allowClear && value && (
          <button type="button" className="rd-btn rd-btn--ghost" disabled={saving} onClick={() => save('')}>
            Clear
          </button>
        )}
        <button type="button" className="rd-btn" onClick={() => setEditing(false)}>
          Cancel
        </button>
        <button type="submit" className="rd-btn rd-btn--primary" disabled={saving || (type === 'select' && !draft)}>
          Save
        </button>
      </div>
    </form>
  );
}
