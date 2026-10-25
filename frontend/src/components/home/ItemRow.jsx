import Icon from '../Icon.jsx';
import StateTag from './StateTag.jsx';
import SegmentChip from './SegmentChip.jsx';

const ACTIONS = {
  done: { icon: 'check', label: 'Done', aria: 'Mark done' },
  snooze: { icon: 'moon', label: 'Snooze', aria: 'Snooze' },
  waiting: { icon: 'hourglass', label: 'Waiting', aria: 'Mark as waiting' },
  back: { icon: 'back', label: 'Resume', aria: 'Back to active' },
  sort: { icon: 'folder', label: 'Sort', aria: 'Sort into a segment' },
};

function Meta({ row }) {
  const showDue = row.due && row.tag.kind !== row.due.kind && ['waiting', 'snoozed'].includes(row.tag.kind);
  return (
    <div className="rd-itemrow__meta">
      <SegmentChip segment={row.segment} />
      {showDue && <span className="rd-t-secondary rd-muted itemrow__due">{row.due.label}</span>}
      {row.creator && (
        <span className="rd-by">
          <i className="rd-avatar" aria-hidden="true">
            {row.creator[0]}
          </i>
          <span className="rd-ell">{row.creator}</span>
        </span>
      )}
    </div>
  );
}

export default function ItemRow({ row, wide, disabled, onAction, onOpen }) {
  const level = row.due?.kind ?? row.tag.kind;
  const urgency = level === 'overdue' ? 'rd-itemrow--overdue' : level === 'soon' ? 'rd-itemrow--soon' : '';
  const buttons = row.actions.map((key) => {
    const action = ACTIONS[key];
    return (
      <button
        key={key}
        type="button"
        disabled={disabled}
        aria-label={`${action.aria}: ${row.title}`}
        onClick={(e) => onAction(key, row, e.currentTarget)}
      >
        <Icon name={action.icon} size={16} />
        {action.label}
      </button>
    );
  });

  if (wide) {
    return (
      <div className={`rd-card rd-itemrow rd-itemrow--wide ${urgency}`}>
        <div className="rd-fill itemrow__body">
          <StateTag tag={row.tag} />
          <button type="button" className="rd-itemrow__title rd-ell itemrow__open" onClick={() => onOpen(row.id)}>
            {row.title}
          </button>
          <Meta row={row} />
        </div>
        <div className="rd-actions--wide">{buttons}</div>
      </div>
    );
  }
  return (
    <div className={`rd-card rd-itemrow ${urgency}`}>
      <StateTag tag={row.tag} />
      <button type="button" className="rd-itemrow__title rd-ell itemrow__open" onClick={() => onOpen(row.id)}>
        {row.title}
      </button>
      <Meta row={row} />
      <div className="rd-actions">{buttons}</div>
    </div>
  );
}
