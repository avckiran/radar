import Icon from '../Icon.jsx';

// A 44px press area around a 26px box. Pressed = done.
export default function CheckButton({ checked, label, disabled, onClick }) {
  return (
    <button type="button" className={`trk-check ${checked ? 'trk-check--on' : ''}`} aria-pressed={checked} aria-label={label} disabled={disabled} onClick={onClick}>
      <span className="trk-check__box" aria-hidden="true">
        {checked && <Icon name="check" size={16} />}
      </span>
    </button>
  );
}
