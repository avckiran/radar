import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openContext } from './helpers.js';
import { planEdit } from '../src/itemEdit.js';
import { HttpError } from '../src/errors.js';
import { buildDetail } from '../src/rules/itemView.js';
import { describeEvent, formatStamp } from '../src/history.js';

const NOW = new Date('2026-10-20T15:00:00Z');
const TZ = 'America/Chicago';
const ID = '11111111-1111-4111-8111-111111111111';
const SEG = '22222222-2222-4222-8222-222222222222';
const action = { id: ID, kind: 'action', state: 'active', segment_id: SEG, title: 'Pay card', body: null, url: null, description: null, due_date: '2026-10-22' };
const fails = (fn, status = 400) => assert.throws(fn, (e) => e instanceof HttpError && e.status === status);

test('history stamps read like “Oct 18 · 10:12 AM”', () => {
  assert.equal(formatStamp(new Date('2026-10-18T15:12:00Z'), TZ), 'Oct 18 · 10:12 AM');
  assert.equal(formatStamp(new Date('2026-10-19T02:05:00Z'), TZ), 'Oct 18 · 9:05 PM');
});

test('each changed field becomes one readable history line; unchanged fields are skipped', () => {
  const plan = planEdit(action, { title: 'Pay credit card', dueDate: '2026-10-21', body: 'Use the points', url: 'example.com/pay' });
  assert.deepEqual(plan.notes.map((n) => n.text), [
    'Changed title to “Pay credit card”',
    'Edited notes',
    'Changed link to example.com',
    'Changed due date to Wed Oct 21',
  ]);
  assert.deepEqual(planEdit(action, { title: 'Pay card', dueDate: '2026-10-22' }).notes, []);
  assert.equal(planEdit(action, { dueDate: null }).notes[0].text, 'Removed the due date');
  assert.equal(planEdit({ ...action, url: 'https://a.example/' }, { url: '' }).notes[0].text, 'Removed the link');
});

test('edits are checked for the kind of item', () => {
  fails(() => planEdit(action, { title: '  ' }));
  fails(() => planEdit(action, { dueDate: '2026-13-01' }));
  fails(() => planEdit(action, { url: 'javascript:alert(1)' }));
  fails(() => planEdit({ ...action, kind: 'note' }, { dueDate: '2026-10-22' }));
  fails(() => planEdit({ ...action, kind: 'note' }, { url: 'example.com' }));
  fails(() => planEdit({ ...action, kind: 'link', url: 'https://a.example/' }, { url: '' }));
  fails(() => planEdit(action, { description: 'x' }));
  fails(() => planEdit(action, { title: 'x'.repeat(301) }));
});

test('an emptied link title falls back to the domain', () => {
  const link = { ...action, kind: 'link', url: 'https://www.bank.example/x', title: 'Old' };
  assert.equal(planEdit(link, { title: '' }).changes.title, 'bank.example');
});

const ev = (type, over = {}) => ({ id: `e${Math.random()}`, type, from_state: null, to_state: null, note: null, data: {}, created_at: new Date('2026-10-14T15:00:00Z'), actor: 'Maya', ...over });

test('events are described the same way for seed data and live data', () => {
  const ctx = { item: action, segmentName: 'Finances' };
  assert.equal(describeEvent(ev('created', { to_state: 'inbox' }), ctx).text, 'Captured to Inbox');
  assert.equal(describeEvent(ev('state_change', { from_state: 'inbox', to_state: 'active' }), ctx).text, 'Moved to Active in Finances');
  assert.equal(describeEvent(ev('state_change', { from_state: 'inbox', to_state: 'active' }), { item: { kind: 'note' }, segmentName: 'Health' }).text, 'Filed in Health');
  assert.equal(describeEvent(ev('state_change', { from_state: 'active', to_state: 'snoozed', data: { until: '2026-10-28' } }), ctx).text, 'Snoozed until Wed Oct 28');
  assert.deepEqual(describeEvent(ev('completed', { note: 'Paid online' }), ctx), { text: 'Marked done', detail: 'Paid online' });
  assert.equal(describeEvent(ev('state_change', { from_state: 'waiting', to_state: 'active' }), ctx).text, 'Back to Active');
});

test('a waiting item shows its block and a follow-up log, newest first, starting from the latest wait', () => {
  const item = { ...action, state: 'waiting', waiting_on: 'Insurer', waiting_since: new Date('2026-10-14T15:00:00Z'), follow_up_date: '2026-10-22', created_at: new Date('2026-10-08T15:00:00Z'), creator: 'Dev', segment_name: 'Health', segment_color: 'rose' };
  const events = [
    ev('created', { to_state: 'active', created_at: new Date('2026-10-08T15:00:00Z') }),
    ev('state_change', { from_state: 'active', to_state: 'waiting', note: 'Marked Waiting on Insurer', created_at: new Date('2026-10-14T15:00:00Z') }),
    ev('follow_up', { note: 'Emailed. No reply.', created_at: new Date('2026-10-16T19:40:00Z'), actor: 'Dev' }),
    ev('follow_up', { note: 'Called claims line.', created_at: new Date('2026-10-18T15:12:00Z') }),
  ];
  const d = buildDetail({ item, events, now: NOW, timeZone: TZ });
  assert.deepEqual(d.actions, ['done', 'back']);
  assert.deepEqual(d.waiting, { on: 'Insurer', since: 'Oct 14 · 6 days', followUp: 'Thu Oct 22', followUpDate: '2026-10-22' });
  assert.deepEqual(d.followUps.map((f) => f.text), ['Called claims line.', 'Emailed. No reply.', 'Marked Waiting on Insurer']);
  assert.equal(d.followUps[0].stamp, 'Oct 18 · 10:12 AM');
  assert.equal(d.history.length, 4);
  assert.equal(d.history[0].text, 'Called claims line.');
  assert.equal(d.item.tag.kind, 'waiting');
});

test('actions offered depend on state and kind', () => {
  const view = (over) => buildDetail({ item: { ...action, created_at: NOW, ...over }, events: [], now: NOW, timeZone: TZ }).actions;
  assert.deepEqual(view({}), ['done', 'snooze', 'waiting']);
  assert.deepEqual(view({ state: 'inbox', segment_id: null }), ['done']);
  assert.deepEqual(view({ state: 'done' }), ['reopen']);
  assert.deepEqual(view({ kind: 'note' }), []);
  assert.deepEqual(view({ state: 'snoozed', snoozed_until: '2026-10-19' }), ['done', 'snooze', 'waiting']);
});

function fakeDb({ item = { ...action }, segment = { id: SEG, name: 'Finances', color: 'emerald', allowed_kinds: ['action', 'note', 'link'] } } = {}) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push([sql, params]);
      if (sql.includes('from households')) return { rows: [{ id: 'h1', name: 'Home', time_zone: TZ, nudge_days: 5 }] };
      if (sql.includes('from users where')) return { rows: [{ id: 'u1', display_name: 'Chandra', is_owner: true }] };
      if (sql.includes('for update')) return { rows: item ? [item] : [] };
      if (sql.includes('from segments')) return { rows: segment ? [segment] : [] };
      if (sql.includes('from item_events')) return { rows: [] };
      if (sql.includes('from items i')) return { rows: item ? [{ ...item, created_at: NOW, creator: 'Komal', segment_name: 'Finances', segment_color: 'emerald' }] : [] };
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

test('GET /api/items/:id returns the item with its history', async () => {
  const { status, json } = await call(fakeDb(), 'GET', `/api/items/${ID}`);
  assert.equal(status, 200);
  assert.equal(json.item.title, 'Pay card');
  assert.deepEqual(json.actions, ['done', 'snooze', 'waiting']);
  assert.equal((await call(fakeDb({ item: null }), 'GET', `/api/items/${ID}`)).status, 404);
  assert.equal((await call(fakeDb(), 'GET', '/api/items/nope')).status, 404);
});

test('PATCH writes the change and one history row per edit', async () => {
  const db = fakeDb();
  const { status } = await call(db, 'PATCH', `/api/items/${ID}`, { title: 'Pay the card', dueDate: null });
  assert.equal(status, 200);
  const update = db.calls.find(([sql]) => sql.startsWith('update items set title'));
  assert.ok(update);
  const events = db.calls.filter(([sql]) => sql.includes('insert into item_events'));
  assert.deepEqual(events.map((e) => e[1][5]), ['Changed title to “Pay the card”', 'Removed the due date']);
  assert.equal(events[0][1][7], 'u1');
});

test('PATCH with nothing to change writes nothing', async () => {
  const db = fakeDb();
  assert.equal((await call(db, 'PATCH', `/api/items/${ID}`, { title: 'Pay card' })).status, 200);
  assert.equal(db.calls.some(([sql]) => sql.includes('update items') || sql.includes('insert into item_events')), false);
});

test('choosing a segment for an Inbox item sorts it; an Active item cannot lose its segment', async () => {
  const inbox = fakeDb({ item: { ...action, state: 'inbox', segment_id: null } });
  assert.equal((await call(inbox, 'PATCH', `/api/items/${ID}`, { segmentId: SEG })).status, 200);
  const event = inbox.calls.find(([sql]) => sql.includes('insert into item_events'));
  assert.deepEqual([event[1][2], event[1][3], event[1][4]], ['state_change', 'inbox', 'active']);
  assert.match(inbox.calls.find(([sql]) => sql.startsWith('update items set'))[0], /state = /);
  assert.equal((await call(fakeDb(), 'PATCH', `/api/items/${ID}`, { segmentId: null })).status, 400);
});

test('follow-ups need text and a waiting item; resetting the date logs it', async () => {
  const waiting = { ...action, state: 'waiting', waiting_since: NOW };
  const db = fakeDb({ item: waiting });
  assert.equal((await call(db, 'POST', `/api/items/${ID}/follow-ups`, { note: '  ' })).status, 400);
  assert.equal((await call(db, 'POST', `/api/items/${ID}/follow-ups`, { note: 'Called, told 3 days' })).status, 201);
  const log = db.calls.filter(([sql]) => sql.includes('insert into item_events')).at(-1);
  assert.deepEqual([log[1][2], log[1][5]], ['follow_up', 'Called, told 3 days']);
  assert.equal((await call(fakeDb(), 'POST', `/api/items/${ID}/follow-ups`, { note: 'x' })).status, 409);
  const reset = fakeDb({ item: waiting });
  assert.equal((await call(reset, 'POST', `/api/items/${ID}/follow-up-date`, { followUp: '2026-10-27' })).status, 200);
  assert.equal(reset.calls.filter(([sql]) => sql.includes('insert into item_events')).at(-1)[1][5], 'Follow-up date set to Tue Oct 27');
  assert.equal((await call(fakeDb({ item: waiting }), 'POST', `/api/items/${ID}/follow-up-date`, { followUp: '2026-10-01' })).status, 400);
});

test('DELETE hides the item and keeps a history row', async () => {
  const db = fakeDb();
  const { status, json } = await call(db, 'DELETE', `/api/items/${ID}`);
  assert.equal(status, 200);
  assert.equal(json.id, ID);
  assert.ok(db.calls.some(([sql]) => sql.includes('set deleted_at = now()')));
  const event = db.calls.find(([sql]) => sql.includes('insert into item_events'));
  assert.deepEqual([event[1][2], event[1][3]], ['deleted', 'active']);
  assert.equal((await call(fakeDb({ item: null }), 'DELETE', `/api/items/${ID}`)).status, 404);
});
