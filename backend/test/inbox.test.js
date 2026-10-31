import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openContext } from './helpers.js';
import { buildInbox, capturedLabel } from '../src/rules/inbox.js';

const NOW = new Date('2026-10-20T15:00:00Z');
const TZ = 'America/Chicago';
const ID = '11111111-1111-4111-8111-111111111111';
const SEG = '22222222-2222-4222-8222-222222222222';

test('captured labels are today, yesterday, then days ago', () => {
  assert.equal(capturedLabel(new Date('2026-10-20T13:00:00Z'), '2026-10-20', TZ), 'today');
  assert.equal(capturedLabel(new Date('2026-10-19T15:00:00Z'), '2026-10-20', TZ), 'yesterday');
  assert.equal(capturedLabel(new Date('2026-10-17T15:00:00Z'), '2026-10-20', TZ), '3 days ago');
});

test('late evening local time counts as that local day, not the UTC day', () => {
  assert.equal(capturedLabel(new Date('2026-10-20T03:30:00Z'), '2026-10-20', TZ), 'yesterday');
});

test('the inbox view marks items unsorted for two days as aged', () => {
  const view = buildInbox(
    [
      { id: 'a', kind: 'action', title: 'Roof', url: null, creator: 'Komal', created_at: new Date('2026-10-17T15:00:00Z') },
      { id: 'b', kind: 'link', title: 'Rates', url: 'https://www.bankrate.example/x', creator: 'Chandra', created_at: new Date('2026-10-19T15:00:00Z') },
    ],
    { now: NOW, timeZone: TZ }
  );
  assert.deepEqual(view.items.map((i) => [i.aged, i.capturedLabel, i.domain]), [[true, '3 days ago', null], [false, 'yesterday', 'bankrate.example']]);
});

function fakeDb({ item = { id: ID, kind: 'action', state: 'inbox' }, segment = { id: SEG, name: 'Finances', allowed_kinds: ['action', 'note', 'link'] } } = {}) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push([sql, params]);
      if (sql.includes('from households')) return { rows: [{ id: 'h1', name: 'Home', time_zone: TZ, nudge_days: 5 }] };
      if (sql.includes('from users where')) return { rows: [{ id: 'u1', display_name: 'Chandra', is_owner: true }] };
      if (sql.includes('from segments')) return { rows: segment ? [segment] : [] };
      if (sql.includes('for update')) return { rows: item ? [item] : [] };
      if (sql.includes("i.state = 'inbox'")) return { rows: [{ id: ID, kind: 'note', title: 'Patio', url: null, creator: 'Komal', created_at: new Date('2026-10-18T15:00:00Z') }] };
      return { rows: [] };
    },
  };
}

async function call(db, method, path, body) {
  const app = createApp({ authenticate: openContext(db), db, corsOrigins: [], now: () => NOW });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const res = await fetch(`http://localhost:${server.address().port}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  await new Promise((r) => server.close(r));
  return { status: res.status, json };
}

test('GET /api/inbox lists unsorted items oldest first with labels', async () => {
  const { status, json } = await call(fakeDb(), 'GET', '/api/inbox');
  assert.equal(status, 200);
  assert.equal(json.items[0].capturedLabel, '2 days ago');
  assert.equal(json.items[0].aged, true);
});

test('sorting an action makes it Active in the segment and records who did it', async () => {
  const db = fakeDb();
  const { status, json } = await call(db, 'POST', `/api/items/${ID}/sort`, { segmentId: SEG, dueDate: '2026-10-23' });
  assert.equal(status, 200);
  assert.deepEqual([json.state, json.segmentName], ['active', 'Finances']);
  const update = db.calls.find(([sql]) => sql.includes('update items'));
  assert.deepEqual(update[1], [ID, SEG, '2026-10-23']);
  const event = db.calls.find(([sql]) => sql.includes('insert into item_events'));
  assert.equal(event[1][3], 'u1');
});

test('a note ignores a due date; sorting needs a segment and an item still in the Inbox', async () => {
  const note = fakeDb({ item: { id: ID, kind: 'note', state: 'inbox' } });
  await call(note, 'POST', `/api/items/${ID}/sort`, { segmentId: SEG, dueDate: '2026-10-23' });
  assert.equal(note.calls.find(([sql]) => sql.includes('update items'))[1][2], null);
  assert.equal((await call(fakeDb(), 'POST', `/api/items/${ID}/sort`, {})).status, 400);
  assert.equal((await call(fakeDb(), 'POST', `/api/items/${ID}/sort`, { segmentId: SEG, dueDate: 'soon' })).status, 400);
  assert.equal((await call(fakeDb({ item: { id: ID, kind: 'action', state: 'active' } }), 'POST', `/api/items/${ID}/sort`, { segmentId: SEG })).status, 409);
  assert.equal((await call(fakeDb({ item: null }), 'POST', `/api/items/${ID}/sort`, { segmentId: SEG })).status, 404);
  assert.equal((await call(fakeDb({ segment: null }), 'POST', `/api/items/${ID}/sort`, { segmentId: SEG })).status, 400);
});
