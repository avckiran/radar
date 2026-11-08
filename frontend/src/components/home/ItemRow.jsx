import Icon from '../Icon.jsx';

// Same look as a row in the email: a thick left edge in the segment colour,
// the title, the segment name small underneath and a short label on the right.
// Done and Snooze are icon-only buttons (the aria-label says what they do).
const ACTIONS = {
  done: { icon: 'check', aria: 'Mark done' },
  snooze: { icon: 'moon', aria: 'Snooze' },
};

export function RowShell({ segment, children, className = '' }) {
  const colour = segment ? `rd-seg-${segment.color}` : 'hrow--nosegment';
  return <div className={`hrow ${colour} ${className}`}>{children}</div>;
}

export function RowText({ title, segment, creator, sub, onOpen }) {
  const meta = [segment?.name ?? 'No segment', creator].filter(Boolean).join(' · ');
  return (
    <button type="button" className="hrow__open" onClick={onOpen}>
      <span className="hrow__title rd-ell">{title}</span>
      <span className="hrow__meta rd-ell">{meta}</span>
      {sub && <span className="hrow__meta hrow__meta--wrap">{sub}</span>}
    </button>
  );
}

export default function ItemRow({ row, disabled, onAction, onOpen }) {
  return (
    <RowShell segment={row.segment}>
      <RowText title={row.title} segment={row.segment} creator={row.creator} sub={row.sub} onOpen={() => onOpen(row.id)} />
      {row.label && <span className={`hrow__label hrow__label--${row.tone}`}>{row.label}</span>}
      <div className="hrow__actions">
        {row.actions.map((key) => {
          const action = ACTIONS[key];
          return (
            <button
              key={key}
              type="button"
              className="hrow__btn"
              disabled={disabled}
              aria-label={`${action.aria}: ${row.title}`}
              title={action.aria}
              onClick={(e) => onAction(key, row, e.currentTarget)}
            >
              <Icon name={action.icon} size={20} />
            </button>
          );
        })}
      </div>
    </RowShell>
  );
}
