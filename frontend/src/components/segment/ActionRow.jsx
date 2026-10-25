import Icon from '../Icon.jsx';
import StateTag from '../home/StateTag.jsx';

export default function ActionRow({ row, disabled, onDone, onOpen }) {
  return (
    <div className="rd-card seg-row">
      <button type="button" className="seg-check" disabled={disabled} aria-label={`Mark done: ${row.title}`} onClick={() => onDone(row)}>
        <span className="seg-check__ring">
          <Icon name="check" size={14} />
        </span>
      </button>
      <div className="seg-row__body">
        <button type="button" className="seg-row__title" onClick={() => onOpen(row.id)}>
          {row.title}
        </button>
        <div className="seg-row__meta">
          {row.tag.kind === 'none' ? <span className="rd-t-secondary rd-quiet">{row.tag.label}</span> : <StateTag tag={row.tag} />}
          {row.creator && (
            <span className="rd-by">
              <i className="rd-avatar" aria-hidden="true">
                {row.creator[0]}
              </i>
              <span className="rd-ell">{row.creator}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
