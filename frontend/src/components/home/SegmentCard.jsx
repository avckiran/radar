import { Link } from 'react-router-dom';
import Icon from '../Icon.jsx';

export default function SegmentCard({ segment }) {
  const next = segment.nextDue ? `next due ${segment.nextDue}` : 'no due dates';
  return (
    <Link to={`/segments/${segment.id}`} className="rd-segcard">
      <i className={`rd-dot rd-dot--lg rd-seg-${segment.color}`} aria-hidden="true" />
      <span className="rd-stack rd-fill">
        <span className="rd-ell segcard__name">{segment.name}</span>
        <span className="rd-ell rd-muted segcard__stats">
          {segment.activeCount} active · {segment.waitingCount} waiting · {next}
        </span>
      </span>
      <Icon name="chev" size={16} />
    </Link>
  );
}
