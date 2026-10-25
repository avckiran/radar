import { NavLink } from 'react-router-dom';
import Icon from '../Icon.jsx';
import { useShellData } from '../../hooks/useShellData.jsx';
import { useQuickAdd } from '../../hooks/useQuickAdd.js';

export default function BottomBar({ onMenu, menuOpen, menuButtonRef }) {
  const { data } = useShellData();
  const quickAdd = useQuickAdd();
  const inbox = data?.inboxCount ?? 0;

  return (
    <nav className="shell__bottom" aria-label="Main">
      <div className="rd-bottombar">
        <NavLink to="/" end className="rd-tab">
          <Icon name="home" />
          <span>Home</span>
        </NavLink>
        <NavLink to="/inbox" className="rd-tab">
          <Icon name="inbox" />
          {inbox > 0 && (
            <span className="rd-tab__count">
              {inbox}
              <span className="sr-only"> to sort</span>
            </span>
          )}
          <span>Inbox</span>
        </NavLink>
        <button type="button" className="rd-tab" aria-label="Add" onClick={quickAdd}>
          <span className="rd-add">
            <Icon name="plus" size={24} />
          </span>
        </button>
        <NavLink to="/search" className="rd-tab">
          <Icon name="search" />
          <span>Search</span>
        </NavLink>
        <button
          type="button"
          ref={menuButtonRef}
          className="rd-tab"
          onClick={onMenu}
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
        >
          <Icon name="menu" />
          <span>Menu</span>
        </button>
      </div>
    </nav>
  );
}
