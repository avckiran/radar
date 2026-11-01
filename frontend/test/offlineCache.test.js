import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

function fakeStorage({ limit = Infinity, broken = false } = {}) {
  const data = new Map();
  return {
    data,
    getItem: (k) => {
      if (broken) throw new Error('blocked');
      return data.has(k) ? data.get(k) : null;
    },
    setItem: (k, v) => {
      if (broken) throw new Error('blocked');
      if ([...data.values()].join('').length + v.length > limit) throw new Error('full');
      data.set(k, v);
    },
    removeItem: (k) => data.delete(k),
  };
}

async function load(local) {
  globalThis.window = { localStorage: local, sessionStorage: fakeStorage() };
  return import(`../src/lib/offlineCache.js?${Math.random()}`);
}

beforeEach(() => {
  delete globalThis.window;
});

test('a viewed screen is kept and can be read back with the time it was saved', async () => {
  const c = await load(fakeStorage());
  c.saveCached('/api/home', { hello: 'world' }, new Date('2026-10-26T14:42:00Z'));
  const got = c.readCached('/api/home');
  assert.deepEqual(got.data, { hello: 'world' });
  assert.equal(got.savedAt.toISOString(), '2026-10-26T14:42:00.000Z');
  assert.equal(c.readCached('/api/inbox'), null);
});

test('sign-in calls, exports and searches are never kept', async () => {
  const s = fakeStorage();
  const c = await load(s);
  for (const p of ['/api/auth/login', '/api/auth/me', '/api/export', '/api/export/csv', '/api/search?q=passport', '/health', 'https://evil.example/x']) {
    c.saveCached(p, { secret: 1 });
    assert.equal(c.readCached(p), null, p);
  }
  assert.equal(s.data.size, 0);
  assert.equal(c.cacheable('/api/items/abc'), true);
  assert.equal(c.cacheable('/api/searching'), true, 'only the real /api/search path is excluded');
});

test('clearing removes every saved screen, and nothing else', async () => {
  const s = fakeStorage();
  s.setItem('radar.capture.type', 'note');
  const c = await load(s);
  c.saveCached('/api/home', { a: 1 });
  c.saveCached('/api/items/1', { b: 2 });
  c.clearCache();
  assert.equal(c.readCached('/api/home'), null);
  assert.equal(c.readCached('/api/items/1'), null);
  assert.equal(s.getItem('radar.capture.type'), 'note');
  assert.deepEqual([...s.data.keys()], ['radar.capture.type']);
});

test('only the 60 most recently viewed screens are kept', async () => {
  const s = fakeStorage();
  const c = await load(s);
  for (let i = 0; i < 75; i++) c.saveCached(`/api/items/${i}`, { i });
  assert.equal(c.readCached('/api/items/0'), null);
  assert.equal(c.readCached('/api/items/14'), null);
  assert.deepEqual(c.readCached('/api/items/15').data, { i: 15 });
  assert.deepEqual(c.readCached('/api/items/74').data, { i: 74 });
  assert.equal([...s.data.keys()].filter((k) => k.startsWith('radar.cache.') && k !== 'radar.cache.index').length, 60);
});

test('very large, full or blocked storage never breaks anything', async () => {
  const c1 = await load(fakeStorage());
  c1.saveCached('/api/big', { text: 'x'.repeat(500_000) });
  assert.equal(c1.readCached('/api/big'), null);
  const c2 = await load(fakeStorage({ limit: 50 }));
  assert.doesNotThrow(() => c2.saveCached('/api/home', { a: 1 }));
  const c3 = await load(fakeStorage({ broken: true }));
  assert.doesNotThrow(() => c3.saveCached('/api/home', { a: 1 }));
  assert.equal(c3.readCached('/api/home'), null);
  assert.doesNotThrow(() => c3.clearCache());
});

test('data from a saved copy says so; fresh data does not', async () => {
  const c = await load(fakeStorage());
  const saved = c.markSaved({ a: 1 }, new Date('2026-10-26T14:42:00Z'));
  assert.equal(c.savedAtOf(saved).toISOString(), '2026-10-26T14:42:00.000Z');
  assert.equal(c.savedAtOf({ a: 1 }), null);
  assert.deepEqual(JSON.parse(JSON.stringify(saved)), { a: 1 }, 'the marker does not show up when the data is copied');
});

test('signing out or signing in wipes the saved screens', async () => {
  const local = fakeStorage();
  globalThis.window = { localStorage: local, sessionStorage: fakeStorage() };
  const cache = await import(`../src/lib/offlineCache.js`);
  const session = await import(`../src/lib/session.js?${Math.random()}`);
  cache.saveCached('/api/home', { private: true });
  assert.ok(cache.readCached('/api/home'));
  session.clearSession();
  assert.equal(cache.readCached('/api/home'), null);
  cache.saveCached('/api/home', { private: true });
  session.saveSession({ token: 'a', expiresAt: new Date(Date.now() + 3600_000).toISOString() }, true);
  assert.equal(cache.readCached('/api/home'), null, 'a new sign-in starts with nothing saved');
});
