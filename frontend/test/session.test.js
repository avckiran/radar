import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

function fakeStorage(broken = false) {
  const data = new Map();
  return {
    getItem: (k) => {
      if (broken) throw new Error('blocked');
      return data.has(k) ? data.get(k) : null;
    },
    setItem: (k, v) => {
      if (broken) throw new Error('blocked');
      data.set(k, v);
    },
    removeItem: (k) => data.delete(k),
  };
}

const future = () => new Date(Date.now() + 3600_000).toISOString();
const past = () => new Date(Date.now() - 1000).toISOString();

async function load(local, session) {
  globalThis.window = { localStorage: local, sessionStorage: session };
  return import(`../src/lib/session.js?${Math.random()}`);
}

beforeEach(() => {
  delete globalThis.window;
});

test('keep me signed in uses long-lived storage, otherwise the tab only', async () => {
  const local = fakeStorage();
  const session = fakeStorage();
  const s = await load(local, session);
  s.saveSession({ token: 'a', expiresAt: future() }, true);
  assert.ok(local.getItem('radar.session'));
  assert.equal(session.getItem('radar.session'), null);
  s.saveSession({ token: 'b', expiresAt: future() }, false);
  assert.equal(local.getItem('radar.session'), null);
  assert.ok(session.getItem('radar.session'));
  assert.equal(s.readSession().token, 'b');
});

test('an expired session is dropped', async () => {
  const local = fakeStorage();
  const s = await load(local, fakeStorage());
  local.setItem('radar.session', JSON.stringify({ token: 'old', expiresAt: past() }));
  assert.equal(s.readSession(), null);
  assert.equal(local.getItem('radar.session'), null);
});

test('clearing removes it everywhere', async () => {
  const s = await load(fakeStorage(), fakeStorage());
  s.saveSession({ token: 'a', expiresAt: future() }, true);
  s.clearSession();
  assert.equal(s.readSession(), null);
});

test('blocked storage still works for this visit', async () => {
  const s = await load(fakeStorage(true), fakeStorage(true));
  s.saveSession({ token: 'mem', expiresAt: future() }, true);
  assert.equal(s.readSession().token, 'mem');
  s.clearSession();
  assert.equal(s.readSession(), null);
});
