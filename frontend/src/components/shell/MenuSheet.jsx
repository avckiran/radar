import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import Icon from '../Icon.jsx';
import { SegmentLinks, SoonItem } from './Sidebar.jsx';

export default function MenuSheet({ onClose }) {
  const sheet = useRef(null);

  useEffect(() => {
    sheet.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="menu-scrim" onClick={onClose}>
      <div
        ref={sheet}
        tabIndex={-1}
        className="rd-sheet menu-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rd-grab" aria-hidden="true" />
        <div className="menu-sheet__list">
          <div className="rd-overline nav-overline">Segments</div>
          <SegmentLinks onNavigate={onClose} />
          <div className="rd-overline nav-overline">Coming later</div>
          <SoonItem icon="refresh" label="Trackers" />
          <SoonItem icon="cal" label="Calendar" />
          <NavLink to="/settings" className="rd-nav" onClick={onClose}>
            <Icon name="gear" />
            <span className="rd-fill">Settings</span>
          </NavLink>
        </div>
      </div>
    </div>
  );
}
