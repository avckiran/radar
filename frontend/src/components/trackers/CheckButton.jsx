import Icon from '../Icon.jsx';

export default function CheckButton({ checked, label, disabled, onClick }) {
  return (
    <button type="button" className={`trk-check ${checked ? 'trk-check--on' : ''}`} aria-pressed={checked} aria-label={label} disabled={disabled} onClick={onClick}>
      <span className="trk-check__box" aria-hidden="true">
        {checked && <Icon name="check" size={16} />}
      </span>
    </button>
  );
}
