// The sign-in token lives in this browser only. "Keep me signed in" uses long-lived storage;
// otherwise it lasts until the tab is closed. Storage can be blocked, so every call is guarded.
const KEY = 'radar.session';
let memory = null;

function read(store) {
  try {
    const raw = store.getItem(KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (session && typeof session.token === 'string' && Date.parse(session.expiresAt) > Date.now()) return session;
    store.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
  return null;
}

export function readSession() {
  return read(window.localStorage) ?? read(window.sessionStorage) ?? memory;
}

export function saveSession(session, keep) {
  clearSession();
  memory = session;
  try {
    (keep ? window.localStorage : window.sessionStorage).setItem(KEY, JSON.stringify(session));
  } catch {
    /* kept in memory for this visit */
  }
}

export function clearSession() {
  memory = null;
  for (const store of [window.localStorage, window.sessionStorage]) {
    try {
      store.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }
}
