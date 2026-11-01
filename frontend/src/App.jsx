import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import SignIn from './pages/SignIn.jsx';
import { CheckingScreen, UnreachableScreen } from './pages/AuthStates.jsx';
import { ShellDataProvider } from './hooks/useShellData.jsx';
import { ToastProvider } from './components/ui/Toast.jsx';
import { CaptureProvider } from './components/capture/CaptureProvider.jsx';
import AppShell from './components/shell/AppShell.jsx';
import InstallPrompt from './components/ui/InstallPrompt.jsx';
import Home from './pages/Home.jsx';
import Inbox from './pages/Inbox.jsx';
import Search from './pages/Search.jsx';
import Settings from './pages/Settings.jsx';
import SegmentPage from './pages/SegmentPage.jsx';
import DevStates from './pages/DevStates.jsx';
import NotFound from './pages/NotFound.jsx';

// Email links point at /items/<id>; send them to Home with that item open
function ItemRedirect() {
  const { id } = useParams();
  return <Navigate to={`/?item=${encodeURIComponent(id)}`} replace />;
}

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
              <InstallPrompt />
              <Routes>
                <Route element={<AppShell />}>
                  <Route index element={<Home />} />
                  <Route path="inbox" element={<Inbox />} />
                  <Route path="search" element={<Search />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="settings/:section" element={<Settings />} />
                  <Route path="segments/:segmentId" element={<SegmentPage />} />
                  <Route path="dev/states" element={<DevStates />} />
                  <Route path="items/:id" element={<ItemRedirect />} />
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
