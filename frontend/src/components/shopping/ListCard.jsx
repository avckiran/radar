import { Link } from 'react-router-dom';
import { archivedLabel, createdLabel, progress } from '../../lib/shopping.js';
import { plural } from '../../lib/text.js';

export function ProgressBar({ list }) {
  const { pct, label } = progress(list);
  return (
    <div className="shop-progress">
      <div className="shop-bar" role="progressbar" aria-label="Progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={label}>
        <span className="shop-bar__fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="rd-t-secondary rd-muted shop-progress__label">{label}</span>
    </div>
  );
}

// An open list on the overview screen
export function ListCard({ list, today }) {
  return (
    <Link to={`/shopping/${list.id}`} className="rd-card shop-card">
      <span className="shop-card__title rd-ell">{list.title}</span>
      {list.note && <span className="shop-card__note rd-t-secondary rd-muted">{list.note}</span>}
      <ProgressBar list={list} />
      <span className="rd-t-secondary rd-quiet">{createdLabel(list, today)}</span>
    </Link>
  );
}

// An archived list: opens read only; the button starts a new list from it
export function ArchivedRow({ list, today, onCopy, disabled }) {
  return (
    <li className="rd-card shop-archived">
      <Link to={`/shopping/${list.id}`} className="shop-archived__link">
        <span className="shop-card__title rd-ell">{list.title}</span>
        <span className="rd-t-secondary rd-quiet">
          {archivedLabel(list, today)} · {plural(list.total, 'item')}
        </span>
      </Link>
      <button type="button" className="rd-btn rd-btn--sm" disabled={disabled} onClick={() => onCopy(list)}>
        New list from this
      </button>
    </li>
  );
}
