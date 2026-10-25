import { Navigate, Route, Routes } from 'react-router-dom';
import { ShellDataProvider } from './hooks/useShellData.jsx';
import { ToastProvider } from './components/ui/Toast.jsx';
import AppShell from './components/shell/AppShell.jsx';
import Home from './pages/Home.jsx';
import Inbox from './pages/Inbox.jsx';
import Search from './pages/Search.jsx';
import Settings from './pages/Settings.jsx';
import SegmentPage from './pages/SegmentPage.jsx';
import DevStates from './pages/DevStates.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <ToastProvider>
      <ShellDataProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Home />} />
            <Route path="inbox" element={<Inbox />} />
            <Route path="search" element={<Search />} />
            <Route path="settings" element={<Settings />} />
            <Route path="segments/:segmentId" element={<SegmentPage />} />
            <Route path="dev/states" element={<DevStates />} />
            <Route path="home" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </ShellDataProvider>
    </ToastProvider>
  );
}
