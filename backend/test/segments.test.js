import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

async function start(db) {
  const app = createApp({ db, corsOrigins: ['http://localhost:5173'] });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  return { base: `http://localhost:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

function fakeDb({ household = true } = {}) {
  return {
    query: async (sql) => {
      if (sql.includes('from households')) return { rows: household ? [{ id: 'h1', name: 'Our household', time_zone: 'America/Chicago', nudge_days: 5 }] : [] };
      if (sql.includes('display_name')) return { rows: [{ display_name: 'Chandra' }] };
      if (sql.includes('from segments')) {
        return { rows: [
          { id: 's1', name: 'Finances', color: 'emerald', sortOrder: 0, protected: false, activeCount: 7 },
          { id: 's2', name: 'General / Administrative', color: 'slate', sortOrder: 1, protected: true, activeCount: 2 },
        ] };
      }
      if (sql.includes("state = 'inbox'")) return { rows: [{ n: 3 }] };
      throw new Error(`unexpected query: ${sql}`);
    },
  };
}

test('GET /api/segments returns what the navigation needs', async () => {
  const { base, close } = await start(fakeDb());
  const res = await fetch(`${base}/api/segments`);
  const body = await res.json();
  await close();
  assert.equal(res.status, 200);
  assert.equal(body.household.name, 'Our household');
  assert.equal(body.user.displayName, 'Chandra');
  assert.equal(body.inboxCount, 3);
  assert.match(body.today, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(body.segments.map((s) => [s.name, s.color, s.activeCount]), [
    ['Finances', 'emerald', 7],
    ['General / Administrative', 'slate', 2],
  ]);
});

test('GET /api/segments explains an empty database in plain words', async () => {
  const { base, close } = await start(fakeDb({ household: false }));
  const res = await fetch(`${base}/api/segments`);
  const body = await res.json();
  await close();
  assert.equal(res.status, 503);
  assert.match(body.error, /db:seed/);
});

test('GET /api/segments without a database says so, not a crash', async () => {
  const { base, close } = await start(null);
  const res = await fetch(`${base}/api/segments`);
  await close();
  assert.equal(res.status, 503);
});

test('a database failure on /api/segments returns a safe 500', async (t) => {
  t.mock.method(console, 'error', () => {});
  const db = { query: async () => { throw new Error('boom postgres://user:secret@host'); } };
  const { base, close } = await start(db);
  const res = await fetch(`${base}/api/segments`);
  const text = await res.text();
  await close();
  assert.equal(res.status, 500);
  assert.doesNotMatch(text, /secret/);
});
