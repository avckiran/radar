// "Last viewed" data, kept in this browser so RADAR can open with no connection.
// It holds copies of screens you looked at (Home, Inbox, segments, items). It never holds sign-in details.
// Signing out (or any sign-in) wipes it. Everything is guarded: storage can be blocked or full.
const PREFIX = 'radar.cache.';
const INDEX_KEY = `${PREFIX}index`;
const MAX_ENTRIES = 60;
const MAX_BYTES = 400_000;

// Screens that must never be kept: sign-in calls, exports (everything in one file) and searches (typed text)
export function cacheable(path) {
  if (typeof path !== 'string' || !path.startsWith('/api/')) return false;
  return !/^\/api\/(auth|export|search)(\/|\?|$)/.test(path);
}

function store() {
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function readIndex(s) {
  try {
    const list = JSON.parse(s.getItem(INDEX_KEY) || '[]');
    return Array.isArray(list) ? list.filter((p) => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

export function saveCached(path, data, now = new Date()) {
  const s = store();
  if (!s || !cacheable(path)) return;
  try {
    const raw = JSON.stringify({ savedAt: now.toISOString(), data });
    if (raw.length > MAX_BYTES) return;
    s.setItem(PREFIX + path, raw);
    const index = readIndex(s).filter((p) => p !== path);
    index.push(path);
    while (index.length > MAX_ENTRIES) s.removeItem(PREFIX + index.shift());
    s.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    /* storage full or blocked: carry on without it */
  }
}

export function readCached(path) {
  const s = store();
  if (!s || !cacheable(path)) return null;
  try {
    const raw = s.getItem(PREFIX + path);
    if (!raw) return null;
    const { savedAt, data } = JSON.parse(raw);
    const when = new Date(savedAt);
    if (Number.isNaN(when.getTime())) return null;
    return { data, savedAt: when };
  } catch {
    return null;
  }
}

export function clearCache() {
  const s = store();
  if (!s) return;
  try {
    for (const p of readIndex(s)) s.removeItem(PREFIX + p);
    s.removeItem(INDEX_KEY);
  } catch {
    /* ignore */
  }
}

// When data came from the saved copy, this says when it was saved (otherwise null)
const SAVED_AT = Symbol('radar.savedAt');
export function markSaved(data, savedAt) {
  if (data && typeof data === 'object') Object.defineProperty(data, SAVED_AT, { value: savedAt, enumerable: false });
  return data;
}
export function savedAtOf(data) {
  return (data && typeof data === 'object' && data[SAVED_AT]) || null;
}
