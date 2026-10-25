import Icon from '../Icon.jsx';

const ICONS = { overdue: 'alert', soon: 'cal', later: 'cal', waiting: 'hourglass', snoozed: 'moon', inbox: 'tray' };

export default function StateTag({ tag }) {
  return (
    <span className={`rd-tag rd-tag--${tag.kind}`}>
      <Icon name={ICONS[tag.kind] ?? 'circle'} size={14} />
      {tag.label}
    </span>
  );
}
