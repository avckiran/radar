import { useEffect, useState } from 'react';
import Overlay from './Overlay.jsx';
import { markInstallSeen, shouldShowInstallPrompt } from '../../lib/install.js';

// Shown once, a moment after the first sign-in, on phones and tablets that have not installed RADAR yet
export default function InstallPrompt() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!shouldShowInstallPrompt()) return undefined;
    const timer = setTimeout(() => setOpen(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  function close() {
    markInstallSeen();
    setOpen(false);
  }

  if (!open) return null;
  return (
    <Overlay label="Add RADAR to your Home Screen" onClose={close}>
      <div className="install">
        <h2 className="rd-t-item-title install__title">Add RADAR to your Home Screen</h2>
        <p className="rd-muted install__lead">Open it like an app: full screen, with its own icon.</p>
        <ol className="install__steps">
          <li>Tap <strong>Share</strong> in your browser toolbar.</li>
          <li>Choose <strong>“Add to Home Screen”</strong>.</li>
          <li>Tap <strong>Add</strong>, then open RADAR from your Home Screen.</li>
        </ol>
        <div className="install__actions">
          <button type="button" className="rd-btn" onClick={close}>
            Not now
          </button>
          <button type="button" className="rd-btn rd-btn--primary" data-autofocus onClick={close}>
            Got it
          </button>
        </div>
      </div>
    </Overlay>
  );
}
