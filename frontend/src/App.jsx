import { useCallback, useEffect, useState } from 'react';

// The only setting the browser needs: where the API lives. It is public, not a secret.
const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:3001' : '');

// Calls GET /health and turns the answer into a status for each layer.
async function checkHealth(signal) {
  if (!API_URL) {
    return { api: { state: 'fail', detail: 'No API address is set for this build.' }, db: { state: 'unknown', detail: 'Not checked.' } };
  }
  try {
    const res = await fetch(`${API_URL}/health`, { signal });
    const body = await res.json();
    const db = body.database || {};
    return {
      api: { state: 'ok', detail: `Answered at ${API_URL}` },
      db: db.ok
        ? { state: 'ok', detail: `“${db.message}” (read in ${db.latencyMs} ms)` }
        : { state: 'fail', detail: db.error || 'The database did not answer.' },
    };
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    return {
      api: { state: 'fail', detail: `Couldn’t reach ${API_URL}. Is the API running?` },
      db: { state: 'unknown', detail: 'Not checked, because the API didn’t answer.' },
    };
  }
}

// Words and symbols, not just color, so the state is always readable.
const LABELS = { checking: '… Checking', ok: '✓ Working', fail: '✕ Problem', unknown: '– Unknown' };

function Row({ name, state, detail }) {
  return (
    <li className={`row row-${state}`}>
      <span className="row-name">{name}</span>
      <span className="row-state">{LABELS[state]}</span>
      <span className="row-detail">{detail}</span>
    </li>
  );
}

export default function App() {
  const [online, setOnline] = useState(navigator.onLine);
  const [result, setResult] = useState(null); // null while loading
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000); // don't wait forever
    setResult(null);
    checkHealth(controller.signal)
      .then(setResult)
      .catch(() =>
        setResult({
          api: { state: 'fail', detail: 'The API took too long to answer.' },
          db: { state: 'unknown', detail: 'Not checked.' },
        })
      )
      .finally(() => clearTimeout(timer));
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const loading = result === null;

  return (
    <main className="page">
      <h1>RADAR</h1>
      <p className="lede">Hello, world. This page checks that each part of the app can talk to the next.</p>

      {!online && (
        <p className="strip" role="status">
          You’re offline. The checks below can’t run until you’re back online.
        </p>
      )}

      <ul className="rows" aria-live="polite" aria-busy={loading}>
        <Row
          name="Page"
          state="ok"
          detail={`Running from ${window.location.pathname} (${import.meta.env.MODE} build)`}
        />
        <Row name="API" state={loading ? 'checking' : result.api.state} detail={loading ? 'Asking the API…' : result.api.detail} />
        <Row
          name="Database"
          state={loading ? 'checking' : result.db.state}
          detail={loading ? 'Waiting for the API…' : result.db.detail}
        />
      </ul>

      <button type="button" onClick={retry} disabled={loading}>
        Check again
      </button>
    </main>
  );
}
