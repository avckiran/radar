import { useState } from 'react';
import Logo from '../components/Logo.jsx';
import Icon from '../components/Icon.jsx';
import { useAuth } from '../hooks/useAuth.jsx';
import { useOnline } from '../hooks/useOnline.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

export function Brand() {
  return (
    <div className="signin__brand">
      <Logo size={32} />
      <span className="signin__name">RADAR</span>
    </div>
  );
}

export default function SignIn() {
  useDocumentTitle('Sign in');
  const { signIn, notice } = useAuth();
  const online = useOnline();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn({ username: username.trim(), password, keepSignedIn: keep });
    } catch (err) {
      setError(err.network ? 'Couldn’t reach the server. Check your connection and try again.' : err.message);
      setBusy(false);
    }
  }

  const message = error ?? (online ? null : 'You’re offline. Connect to the internet to sign in.');

  return (
    <main className="signin">
      <form className="signin__card" onSubmit={submit} noValidate>
        <Brand />
        <h1 className="signin__title">Sign in</h1>
        {notice && !error && <p className="rd-t-secondary rd-muted signin__notice">{notice}</p>}

        <div className="signin__field">
          <label className="rd-t-meta rd-muted" htmlFor="signin-username">
            Username
          </label>
          <input
            id="signin-username"
            className={`rd-input ${error ? 'rd-input--error' : ''}`}
            type="text"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div className="signin__field">
          <label className="rd-t-meta rd-muted" htmlFor="signin-password">
            Password
          </label>
          <div className="signin__password">
            <input
              id="signin-password"
              className={`rd-input ${error ? 'rd-input--error' : ''}`}
              type={show ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" className="rd-btn rd-btn--ghost rd-btn--sm signin__show" aria-pressed={show} onClick={() => setShow((v) => !v)}>
              {show ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <label className="signin__keep rd-t-ui">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
          <span>Keep me signed in on this device</span>
        </label>

        {message && (
          <p className="waiting-form__error" role="alert">
            <Icon name={online ? 'alert' : 'offline'} size={16} /> {message}
          </p>
        )}

        <button type="submit" className="rd-btn rd-btn--primary signin__submit" disabled={busy || !online}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="rd-t-secondary rd-muted signin__foot">RADAR is invite-only. Ask the household owner for access.</p>
      </form>
    </main>
  );
}
