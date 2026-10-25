import { useCallback, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import BottomBar from './BottomBar.jsx';
import MenuSheet from './MenuSheet.jsx';
import { ErrorBanner, OfflineStrip } from '../ui/Banners.jsx';
import { useShellData } from '../../hooks/useShellData.jsx';
import { useOnline } from '../../hooks/useOnline.js';

export default function AppShell() {
  const { error, updatedAt, refresh } = useShellData();
  const online = useOnline();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef(null);

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
      <BottomBar onMenu={() => setMenuOpen(true)} menuOpen={menuOpen} menuButtonRef={menuButton} />
      {menuOpen && <MenuSheet onClose={closeMenu} />}
    </div>
  );
}
