import { useEffect, useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import Overlay from '../ui/Overlay.jsx';

export const COLOR_NAMES = {
  emerald: 'Emerald',
  rose: 'Rose',
  blue: 'Blue',
  violet: 'Violet',
  slate: 'Slate',
  teal: 'Teal',
  lime: 'Lime',
  indigo: 'Indigo',
  magenta: 'Magenta',
  brown: 'Brown',
  sky: 'Sky',
  stone: 'Stone',
};

export function Group({ title, note, children }) {
  return (
    <section className="settings-group" aria-label={title}>
      {title && <h2 className="rd-overline settings-group__title">{title}</h2>}
      {children}
      {note && <p className="rd-t-secondary rd-quiet settings-group__note">{note}</p>}
    </section>
  );
}

export function Card({ children, className = '' }) {
  return <div className={`rd-card settings-card ${className}`}>{children}</div>;
}

// A row that opens something (button) or just shows a value (div)
export function Row({ label, value, hint, onClick, icon, pill, disabled, danger, children }) {
  const inner = (
    <>
      {icon && <Icon name={icon} size={20} />}
      <span className="settings-row__text rd-fill">
        <span className={`settings-row__label ${danger ? 'settings-row__label--danger' : ''}`}>{label}</span>
        {hint && <span className="rd-t-secondary rd-muted settings-row__hint">{hint}</span>}
      </span>
      {value !== undefined && <span className="settings-row__value rd-muted rd-ell">{value}</span>}
      {pill && <span className="rd-nav__pill settings-row__pill">{pill}</span>}
      {children}
      {onClick && !disabled && <Icon name="chev" size={16} />}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className="settings-row settings-row--button" disabled={disabled} onClick={onClick}>
        {inner}
      </button>
    );
  }
  return <div className={`settings-row ${disabled ? 'settings-row--off' : ''}`}>{inner}</div>;
}

export function SheetFrame({ title, onClose, children, label }) {
  return (
    <Overlay label={label ?? title} onClose={onClose}>
      <div className="settings-sheet">
        <div className="settings-sheet__head">
          <h2 className="rd-t-item-title settings-sheet__title">{title}</h2>
          <button type="button" className="rd-btn rd-btn--ghost" aria-label="Close" onClick={onClose}>
            <Icon name="x" size={20} />
          </button>
        </div>
        {children}
      </div>
    </Overlay>
  );
}

export function FormError({ error }) {
  if (!error) return null;
  return (
    <p className="waiting-form__error" role="alert">
      <Icon name="alert" size={16} /> {error}
    </p>
  );
}

export function ColorPicker({ colors, value, onChange, disabled }) {
  return (
    <div className="color-grid" role="group" aria-label="Color">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          className={`color-swatch rd-seg-${color}`}
          aria-label={COLOR_NAMES[color] ?? color}
          aria-pressed={value === color}
          disabled={disabled}
          onClick={() => onChange(color)}
        >
          <span className="color-swatch__dot" />
          {value === color && <Icon name="check" size={16} />}
        </button>
      ))}
    </div>
  );
}

// A single text field with Save, used in a sheet or inline
export function NameForm({ label, value, maxLength, disabled, onSave, autoFocus = false, inline = false }) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(value), [value]);
  const changed = draft.trim() !== value;

  async function submit(e) {
    e.preventDefault();
    if (!changed || saving) return;
    setSaving(true);
    setError(null);
    const result = await onSave(draft.trim());
    setSaving(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <form className={`name-form ${inline ? 'name-form--inline' : ''}`} onSubmit={submit}>
      <label className="rd-t-secondary rd-muted" htmlFor={`name-${label}`}>
        {label}
      </label>
      <div className="name-form__line">
        <input
          id={`name-${label}`}
          className={`rd-input ${error ? 'rd-input--error' : ''}`}
          value={draft}
          maxLength={maxLength}
          disabled={disabled}
          autoFocus={autoFocus}
          data-autofocus={autoFocus ? '' : undefined}
          autoComplete="off"
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="rd-btn rd-btn--primary" disabled={disabled || !changed || !draft.trim() || saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <FormError error={error} />
    </form>
  );
}

// − / value / + with a short pause before saving, so quick taps make one request
export function Stepper({ value, min, max, unit, disabled, onCommit, label }) {
  const [local, setLocal] = useState(value);
  const timer = useRef(null);
  useEffect(() => setLocal(value), [value]);
  useEffect(() => () => clearTimeout(timer.current), []);

  function step(delta) {
    const next = Math.min(max, Math.max(min, local + delta));
    if (next === local) return;
    setLocal(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onCommit(next), 450);
  }

  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="rd-btn" aria-label={`Fewer ${unit}s`} disabled={disabled || local <= min} onClick={() => step(-1)}>
        −
      </button>
      <span className="stepper__value" aria-live="polite">
        {local} {local === 1 ? unit : `${unit}s`}
      </span>
      <button type="button" className="rd-btn" aria-label={`More ${unit}s`} disabled={disabled || local >= max} onClick={() => step(1)}>
        +
      </button>
    </div>
  );
}
