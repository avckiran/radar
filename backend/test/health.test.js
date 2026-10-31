import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openContext } from './helpers.js';

async function start(db) {
  const app = createApp({ authenticate: openContext(db), db, corsOrigins: ['http://localhost:5173'] });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://localhost:${server.address().port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

test('/health is ok when the database answers', async () => {
  const db = {
    query: async (sql) =>
      sql.includes('households')
        ? { rows: [{ n: 1 }] }
        : { rows: [{ server_time: new Date().toISOString() }] },
  };
  const { base, close } = await start(db);
  const res = await fetch(`${base}/health`);
  const body = await res.json();
  await close();
  assert.equal(res.status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.database.households, 1);
});

test('/health says degraded (503) when the database is unreachable, without leaking details', async (t) => {
  t.mock.method(console, 'error', () => {});
  const db = {
    query: async () => {
      const e = new Error('connect ECONNREFUSED postgres://user:secret@host');
      e.code = 'ECONNREFUSED';
      throw e;
    },
  };
  const { base, close } = await start(db);
  const res = await fetch(`${base}/health`);
  const text = await res.text();
  await close();
  assert.equal(res.status, 503);
  assert.match(text, /Cannot reach the database host/);
  assert.doesNotMatch(text, /secret/);
});

test('/health explains missing tables', async (t) => {
  t.mock.method(console, 'error', () => {});
  let calls = 0;
  const db = {
    query: async () => {
      if (calls++ === 0) return { rows: [{ server_time: 'now' }] };
      const e = new Error('relation "households" does not exist');
      e.code = '42P01';
      throw e;
    },
  };
  const { base, close } = await start(db);
  const body = await (await fetch(`${base}/health`)).json();
  await close();
  assert.match(body.database.error, /npm run db:migrate/);
});

test('/health works without a database configured', async () => {
  const { base, close } = await start(null);
  const res = await fetch(`${base}/health`);
  const body = await res.json();
  await close();
  assert.equal(res.status, 503);
  assert.match(body.database.error, /DATABASE_URL/);
});

test('only the allowed browser origin gets CORS headers', async () => {
  const { base, close } = await start(null);
  const allowed = await fetch(`${base}/health`, { headers: { Origin: 'http://localhost:5173' } });
  const other = await fetch(`${base}/health`, { headers: { Origin: 'https://evil.example' } });
  await close();
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal(other.headers.get('access-control-allow-origin'), null);
});
