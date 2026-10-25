import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { buildSegmentView } from '../src/rules/segmentView.js';

const NOW = new Date('2026-10-20T15:00:00Z');
const TZ = 'America/Chicago';
const SEG = '22222222-2222-4222-8222-222222222222';
const segment = { id: SEG, name: 'Health', color: 'rose' };
let n = 0;
const item = (over = {}) => ({
  id: `i${++n}`, kind: 'action', state: 'active', title: `Item ${n}`, body: null, url: null, due_date: null,
  snoozed_until: null, follow_up_date: null, waiting_since: null, created_at: new Date('2026-10-01T15:00:00Z'),
  updated_at: new Date('2026-10-01T15:00:00Z'), segment_id: SEG, creator: 'Komal', ...over,
});
const view = (items, extra = {}) => buildSegmentView({ segment, items, doneCount: 0, doneItems: [], now: NOW, timeZone: TZ, ...extra });

test('actions are grouped by state, soonest due first, undated last', () => {
  const v = view([
    item({ title: 'Undated' }),
    item({ title: 'Fri', due_date: '2026-10-23' }),
    item({ title: 'Tomorrow', due_date: '2026-10-21' }),
    item({ title: 'Waiting', state: 'waiting', waiting_since: new Date('2026-10-14T15:00:00Z') }),
    item({ title: 'Asleep', state: 'snoozed', snoozed_until: '2026-10-24' }),
  ]);
  assert.deepEqual(v.active.map((r) => [r.title, r.tag.label]), [['Tomorrow', 'Due tomorrow'], ['Fri', 'Due Fri'], ['Undated', 'No date']]);
  assert.deepEqual(v.waiting.map((r) => r.tag.label), ['Waiting 6 days']);
  assert.deepEqual(v.snoozed.map((r) => r.tag.label), ['Snoozed until Sat']);
  assert.deepEqual(v.stats, { active: 3, waiting: 1, nextDue: 'tomorrow' });
});

test('a snooze that has come back shows under Active with its tag', () => {
  const v = view([item({ title: 'Back', state: 'snoozed', snoozed_until: '2026-10-19', due_date: '2026-10-22' })]);
  assert.deepEqual(v.active.map((r) => r.tag.label), ['Back from snooze']);
  assert.equal(v.snoozed.length, 0);
});

test('notes show an excerpt and links show their domain', () => {
  const long = 'word '.repeat(60);
  const v = view([
    item({ kind: 'note', title: 'Allergies', body: 'Daily antihistamine.\n\nRefill every 90 days.' }),
    item({ kind: 'note', title: 'Long', body: long }),
    item({ kind: 'link', title: 'Portal', url: 'https://www.mychart.example/login' }),
  ]);
  assert.equal(v.notes.find((x) => x.title === 'Allergies').excerpt, 'Daily antihistamine. Refill every 90 days.');
  assert.ok(v.notes.find((x) => x.title === 'Long').excerpt.length <= 110);
  assert.deepEqual(v.links[0], { id: v.links[0].id, title: 'Portal', url: 'https://www.mychart.example/login', domain: 'mychart.example' });
  assert.equal(v.active.length, 0);
});

test('done keeps a count and the latest few', () => {
  const v = view([], { doneCount: 12, doneItems: [item({ title: 'Flu shot', completed_at: new Date('2026-10-19T15:00:00Z'), completed_by: 'Chandra' })] });
  assert.deepEqual(v.done, { count: 12, items: [{ id: v.done.items[0].id, title: 'Flu shot', by: 'Chandra', dayLabel: 'Mon' }] });
});

function fakeDb({ found = true } = {}) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push([sql, params]);
      if (sql.includes('from households')) return { rows: [{ id: 'h1', name: 'Home', time_zone: TZ, nudge_days: 5 }] };
      if (sql.includes('from users where')) return { rows: [{ id: 'u1', display_name: 'Chandra', is_owner: true }] };
      if (sql.includes('from segments')) return { rows: found ? [segment] : [] };
      if (sql.includes('count(*)')) return { rows: [{ n: 1 }] };
      if (sql.includes("i.state = 'done'")) return { rows: [item({ title: 'Done one', completed_at: NOW, completed_by: 'Komal' })] };
      if (sql.includes("not in ('done', 'inbox')")) return { rows: [item({ title: 'Open one', due_date: '2026-10-21' })] };
      throw new Error(`unexpected query: ${sql}`);
    },
  };
}

async function get(db, path) {
  const app = createApp({ db, corsOrigins: [], now: () => NOW });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const res = await fetch(`http://localhost:${server.address().port}${path}`);
  const json = await res.json();
  await new Promise((r) => server.close(r));
  return { status: res.status, json };
}

test('GET /api/segments/:id returns the whole dashboard', async () => {
  const { status, json } = await get(fakeDb(), `/api/segments/${SEG}`);
  assert.equal(status, 200);
  assert.equal(json.segment.name, 'Health');
  assert.equal(json.active[0].title, 'Open one');
  assert.equal(json.done.count, 1);
  assert.equal(json.done.items[0].by, 'Komal');
});

test('an unknown or malformed segment is a plain 404', async () => {
  assert.equal((await get(fakeDb({ found: false }), `/api/segments/${SEG}`)).status, 404);
  assert.equal((await get(fakeDb(), '/api/segments/nope')).status, 404);
});

test('GET /api/segments/:id/done pages through finished actions', async () => {
  const db = fakeDb();
  const { status, json } = await get(db, `/api/segments/${SEG}/done?offset=25`);
  assert.equal(status, 200);
  assert.equal(json.items.length, 1);
  assert.match(db.calls.at(-1)[0], /offset 25/);
});
