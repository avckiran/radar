import { useCallback, useEffect, useState } from 'react';
import PlaceholderPage from './PlaceholderPage.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { ErrorBanner, OfflineStrip } from '../components/ui/Banners.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { API_URL, apiGet } from '../lib/api.js';

function Section({ title, children }) {
  return (
    <section className="dev-section">
      <h2 className="rd-t-item-title">{title}</h2>
      {children}
    </section>
  );
}

function ThemeSwitch() {
  const [theme, setTheme] = useState('device');
  const apply = (value) => {
    setTheme(value);
    if (value === 'device') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', value);
  };
  useEffect(() => () => document.documentElement.removeAttribute('data-theme'), []);
  return (
    <div className="rd-segmented" role="group" aria-label="Theme">
      {['device', 'light', 'dark'].map((t) => (
        <button key={t} type="button" aria-pressed={theme === t} onClick={() => apply(t)}>
          {t === 'device' ? 'Follow device' : t === 'light' ? 'Light' : 'Dark'}
        </button>
      ))}
    </div>
  );
}

function ConnectionCheck() {
  const [result, setResult] = useState({ state: 'checking' });
  const run = useCallback(() => {
    setResult({ state: 'checking' });
    apiGet('/health')
      .then((b) => setResult({ state: 'ok', detail: `API ok. Database ok (${b.database.latencyMs} ms, ${b.database.households} household).` }))
      .catch((e) => setResult({ state: 'fail', detail: e.message }));
  }, []);
  useEffect(run, [run]);
  return (
    <div className="rd-card dev-card">
      <p className="rd-t-ui">
        API address: <code>{API_URL || '(none in this build)'}</code>
      </p>
      <p className="rd-t-ui">
        {result.state === 'checking' && '… Checking'}
        {result.state === 'ok' && `✓ ${result.detail}`}
        {result.state === 'fail' && `✕ ${result.detail}`}
      </p>
      <button type="button" className="rd-btn rd-btn--sm" onClick={run}>
        Check again
      </button>
    </div>
  );
}

export default function DevStates() {
  const toast = useToast();
  return (
    <PlaceholderPage title="States" subtitle="Developer page: shared states, themes and the connection check">
      <Section title="Theme">
        <ThemeSwitch />
      </Section>
      <Section title="Loading skeleton">
        <div className="rd-card dev-card dev-stack" aria-busy="true">
          <Skeleton width="60%" height={22} />
          <Skeleton height={16} />
          <Skeleton width="80%" height={16} />
        </div>
      </Section>
      <Section title="Error banner">
        <div className="rd-card dev-card dev-card--flush">
          <ErrorBanner message="Couldn’t load Home. Something went wrong on our side. Your items are safe." onRetry={() => toast.show('Trying again…')} />
        </div>
      </Section>
      <Section title="Offline strip">
        <div className="rd-card dev-card dev-card--flush">
          <OfflineStrip updatedAt={new Date(2026, 9, 20, 9, 42)} />
        </div>
      </Section>
      <Section title="Toast">
        <div className="dev-row">
          <button type="button" className="rd-btn" onClick={() => toast.show('Marked done')}>
            Show a toast
          </button>
          <button type="button" className="rd-btn" onClick={() => toast.show('Saved. Will sync when you’re back online.')}>
            Show the offline-save toast
          </button>
        </div>
      </Section>
      <Section title="Connection check">
        <ConnectionCheck />
      </Section>
    </PlaceholderPage>
  );
}
