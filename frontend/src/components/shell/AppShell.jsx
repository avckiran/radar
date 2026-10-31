import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import BottomBar from './BottomBar.jsx';
import MenuSheet from './MenuSheet.jsx';
import DetailHost from '../detail/DetailHost.jsx';
import { ErrorBanner, OfflineStrip } from '../ui/Banners.jsx';
import { useShellData } from '../../hooks/useShellData.jsx';
import { useOnline } from '../../hooks/useOnline.js';

export default function AppShell() {
  const { error, updatedAt, refresh } = useShellData();
  const online = useOnline();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    function onKey(e) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const target = e.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      if (location.pathname === '/search') document.getElementById('search-input')?.focus();
      else navigate('/search');
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navigate, location.pathname]);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    menuButton.current?.focus();
  }, []);

  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Sidebar />
      <div className="shell__main">
        {!online && <OfflineStrip updatedAt={updatedAt} />}
        {online && error && <ErrorBanner message={`${error}`} onRetry={refresh} />}
        <main id="main" className="shell__content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      <DetailHost />
      <BottomBar onMenu={() => setMenuOpen(true)} menuOpen={menuOpen} menuButtonRef={menuButton} />
      {menuOpen && <MenuSheet onClose={closeMenu} />}
    </div>
  );
}
