import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import SignIn from './pages/SignIn.jsx';
import { CheckingScreen, UnreachableScreen } from './pages/AuthStates.jsx';
import { ShellDataProvider } from './hooks/useShellData.jsx';
import { ToastProvider } from './components/ui/Toast.jsx';
import { CaptureProvider } from './components/capture/CaptureProvider.jsx';
import AppShell from './components/shell/AppShell.jsx';
import Home from './pages/Home.jsx';
import Inbox from './pages/Inbox.jsx';
import Search from './pages/Search.jsx';
import Settings from './pages/Settings.jsx';
import SegmentPage from './pages/SegmentPage.jsx';
import DevStates from './pages/DevStates.jsx';
import NotFound from './pages/NotFound.jsx';

// Nothing below the gate loads any data until someone is signed in
function Gate({ children }) {
  const { status } = useAuth();
  if (status === 'checking') return <CheckingScreen />;
  if (status === 'unreachable') return <UnreachableScreen />;
  if (status === 'out') return <SignIn />;
  return children;
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Gate>
          <ShellDataProvider>
            <CaptureProvider>
              <Routes>
                <Route element={<AppShell />}>
                  <Route index element={<Home />} />
                  <Route path="inbox" element={<Inbox />} />
                  <Route path="search" element={<Search />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="settings/:section" element={<Settings />} />
                  <Route path="segments/:segmentId" element={<SegmentPage />} />
                  <Route path="dev/states" element={<DevStates />} />
                  <Route path="home" element={<Navigate to="/" replace />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </CaptureProvider>
          </ShellDataProvider>
        </Gate>
      </AuthProvider>
    </ToastProvider>
  );
}
