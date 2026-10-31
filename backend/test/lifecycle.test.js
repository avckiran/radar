import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTransition, HttpError } from '../src/lifecycle.js';
import { createApp } from '../src/app.js';
import { openContext } from './helpers.js';

const ctx = { now: new Date('2026-10-26T15:00:00Z'), timeZone: 'America/Chicago' };
const base = { kind: 'action', segment_id: 's1' };
const plan = (action, state, body, extra = {}) => planTransition(action, { ...base, state, ...extra }, body, ctx);
const fails = (fn, status) => assert.throws(fn, (e) => e instanceof HttpError && e.status === status);

test('done clears snooze and waiting details and stamps completion', () => {
  const { patch, event } = plan('done', 'waiting');
  assert.equal(patch.state, 'done');
  assert.equal(patch.completed_at, ctx.now);
  assert.equal(patch.waiting_since, null);
  assert.deepEqual([event.type, event.from, event.to], ['completed', 'waiting', 'done']);
});

test('done works for an unsorted action but not for notes or finished items', () => {
  assert.equal(plan('done', 'inbox', {}, { segment_id: null }).patch.state, 'done');
  fails(() => plan('done', 'active', {}, { kind: 'note' }), 409);
  fails(() => plan('done', 'done'), 409);
});

test('snooze needs a future, valid date', () => {
  assert.deepEqual(
    [plan('snooze', 'active', { until: '2026-10-27' }).patch.state, plan('snooze', 'active', { until: '2026-10-27' }).patch.snoozed_until],
    ['snoozed', '2026-10-27']
  );
  fails(() => plan('snooze', 'active', {}), 400);
  fails(() => plan('snooze', 'active', { until: '2026-02-30' }), 400);
  fails(() => plan('snooze', 'active', { until: '2026-10-26' }), 400);
  fails(() => plan('snooze', 'inbox', { until: '2026-10-30' }), 409);
});

test('waiting stores who and when to follow up; follow-up is optional', () => {
  const { patch } = plan('waiting', 'active', { waitingOn: '  Dr. Rao  ', followUp: '2026-10-29' });
  assert.equal(patch.state, 'waiting');
  assert.equal(patch.waiting_on, 'Dr. Rao');
  assert.equal(patch.follow_up_date, '2026-10-29');
  assert.equal(patch.waiting_since, ctx.now);
  assert.equal(plan('waiting', 'active', {}).patch.follow_up_date, null);
  fails(() => plan('waiting', 'active', { followUp: '2026-10-20' }), 400);
  fails(() => plan('waiting', 'active', { waitingOn: 'x'.repeat(201) }), 400);
  fails(() => plan('waiting', 'waiting', {}), 409);
});

test('reopen returns work to Active, or to the Inbox if it never had a segment', () => {
  assert.equal(plan('reopen', 'waiting').patch.state, 'active');
  assert.equal(plan('reopen', 'done').patch.completed_at, null);
  assert.equal(plan('reopen', 'done', {}, { segment_id: null }).patch.state, 'inbox');
  fails(() => plan('reopen', 'active'), 409);
});

function fakeDb(item) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push([sql, params]);
      if (sql.includes('from households')) return { rows: [{ id: 'h1', name: 'Home', time_zone: 'America/Chicago', nudge_days: 5 }] };
      if (sql.includes('from users')) return { rows: [{ id: 'u1', display_name: 'Chandra', is_owner: true }] };
      if (sql.includes('for update')) return { rows: item ? [item] : [] };
      return { rows: [] };
    },
  };
}

async function post(db, path, body) {
  const app = createApp({ authenticate: openContext(db), db, corsOrigins: [], now: () => ctx.now });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const res = await fetch(`http://localhost:${server.address().port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body ?? {}),
  });
  const json = await res.json();
  await new Promise((r) => server.close(r));
  return { status: res.status, json };
}

const ID = '11111111-1111-4111-8111-111111111111';

test('POST /api/items/:id/done updates the item and records who did it', async () => {
  const db = fakeDb({ id: ID, kind: 'action', state: 'active', segment_id: 's1' });
  const { status, json } = await post(db, `/api/items/${ID}/done`);
  assert.equal(status, 200);
  assert.deepEqual(json, { id: ID, state: 'done' });
  const insert = db.calls.find(([sql]) => sql.includes('insert into item_events'));
  assert.equal(insert[1][2], 'completed');
  assert.equal(insert[1][7], 'u1');
});

test('lifecycle endpoints give plain errors', async () => {
  assert.equal((await post(fakeDb(null), `/api/items/${ID}/done`)).status, 404);
  assert.equal((await post(fakeDb(null), '/api/items/not-an-id/done')).status, 404);
  const done = fakeDb({ id: ID, kind: 'action', state: 'done', segment_id: 's1' });
  assert.equal((await post(done, `/api/items/${ID}/done`)).status, 409);
  const active = fakeDb({ id: ID, kind: 'action', state: 'active', segment_id: 's1' });
  const bad = await post(active, `/api/items/${ID}/snooze`, { until: 'tomorrow' });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error, /date/);
  const broken = await post(active, `/api/items/${ID}/snooze`, '{nope');
  assert.equal(broken.status, 400);
});

test('a completion note is kept on the history entry, and waiting records who or what', () => {
  assert.equal(plan('done', 'active', { note: '  Paid online  ' }).event.note, 'Paid online');
  fails(() => plan('done', 'active', { note: 'x'.repeat(1001) }), 400);
  assert.equal(plan('waiting', 'active', { waitingOn: 'Dr. Rao' }).event.note, 'Marked Waiting on Dr. Rao');
  assert.equal(plan('waiting', 'active', {}).event.note, 'Marked Waiting');
});
