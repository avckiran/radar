import { NavLink } from 'react-router-dom';
import Icon from '../Icon.jsx';
import Logo from '../Logo.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import { useShellData } from '../../hooks/useShellData.jsx';
import { useQuickAdd } from '../../hooks/useQuickAdd.js';

function NavItem({ to, icon, label, count, hint, end }) {
  return (
    <NavLink to={to} end={end} className="rd-nav">
      <Icon name={icon} />
      <span className="rd-fill rd-ell">{label}</span>
      {count > 0 && (
        <span className="rd-nav__pill">
          {count}
          <span className="sr-only"> to sort</span>
        </span>
      )}
      {hint && <kbd className="rd-kbd">{hint}</kbd>}
    </NavLink>
  );
}

export function SoonItem({ icon, label }) {
  return (
    <button type="button" className="rd-nav rd-nav--soon" aria-disabled="true">
      <Icon name={icon} />
      <span className="rd-fill rd-ell">{label}</span>
      <span className="rd-nav__pill">Soon</span>
    </button>
  );
}

export function SegmentLinks({ onNavigate }) {
  const { data, loading, error } = useShellData();
  if (!data) {
    return loading ? (
      <div className="nav-skeleton" aria-busy="true" aria-label="Loading segments">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} height={24} />
        ))}
      </div>
    ) : (
      <p className="rd-t-secondary rd-quiet nav-note">{error ? 'Segments didn’t load.' : ''}</p>
    );
  }
  return data.segments.map((s) => (
    <NavLink key={s.id} to={`/segments/${s.id}`} className="rd-nav" onClick={onNavigate}>
      <i className={`rd-dot rd-dot--lg rd-seg-${s.color}`} aria-hidden="true" />
      <span className="rd-fill rd-ell">{s.name}</span>
      <span className="nav-count" aria-label={`${s.activeCount} active`}>
        {s.activeCount}
      </span>
    </NavLink>
  ));
}

export default function Sidebar() {
  const { data } = useShellData();
  const quickAdd = useQuickAdd();
  const initial = data?.user?.displayName?.[0] ?? '';

  return (
    <nav className="rd-sidebar shell__sidebar" aria-label="Main">
      <div className="brand">
        <Logo />
        <div className="brand__text">
          <span className="brand__word">RADAR</span>
          <span className="rd-t-secondary rd-quiet rd-ell">{data?.household?.name ?? ' '}</span>
        </div>
      </div>

      <button type="button" className="rd-btn rd-btn--primary add-button" onClick={quickAdd}>
        <Icon name="plus" size={18} />
        <span className="rd-fill">Add</span>
        <kbd className="rd-kbd kbd-on-primary">N</kbd>
      </button>

      <NavItem to="/" end icon="home" label="Home" />
      <NavItem to="/inbox" icon="inbox" label="Inbox" count={data?.inboxCount ?? 0} />
      <NavItem to="/search" icon="search" label="Search" hint="/" />
      <SoonItem icon="refresh" label="Trackers" />
      <SoonItem icon="cal" label="Calendar" />

      <div className="rd-overline nav-overline">Segments</div>
      <SegmentLinks />

      <div className="rd-fill" />
      <NavItem to="/settings" icon="gear" label="Settings" />
      {initial && (
        <div className="sidebar-user">
          <i className="rd-avatar" aria-hidden="true">
            {initial}
          </i>
          <span className="rd-t-secondary rd-muted rd-ell">{data.user.displayName}</span>
        </div>
      )}
    </nav>
  );
}
