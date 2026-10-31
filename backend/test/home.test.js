import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openContext } from './helpers.js';
import { buildHome } from '../src/rules/home.js';

const now = new Date('2026-10-26T15:00:00Z');
const TZ = 'America/Chicago';
const seg = (id, name) => ({ id, name, color: 'emerald' });
const row = (id, over) => ({
  id, kind: 'action', state: 'active', title: id, segment_id: 's1', segment_name: 'Finances', segment_color: 'emerald',
  creator: 'Komal', due_date: null, snoozed_until: null, follow_up_date: null, waiting_since: null,
  created_at: new Date('2026-10-20T15:00:00Z'), ...over,
});

test('buildHome sums up segments, next up and recently completed', () => {
  const home = buildHome({
    openItems: [
      row('a', { due_date: '2026-10-27' }),
      row('b', { due_date: '2026-11-04' }),
      row('c', { state: 'waiting', waiting_since: new Date('2026-10-25T15:00:00Z') }),
      row('d', { state: 'snoozed', snoozed_until: '2026-10-26' }),
      row('e', { state: 'inbox', segment_id: null }),
      row('f', { kind: 'note' }),
    ],
    doneItems: [row('g', { state: 'done', completed_at: new Date('2026-10-25T15:00:00Z'), completed_by: 'Chandra' })],
    segments: [seg('s1', 'Finances'), seg('s2', 'Health')],
    now, timeZone: TZ, nudgeDays: 5,
  });
  assert.equal(home.today, '2026-10-26');
  assert.equal(home.weekEnd, '2026-10-31');
  assert.deepEqual(home.segments[0], { id: 's1', name: 'Finances', color: 'emerald', activeCount: 3, waitingCount: 1, nextDue: 'tomorrow' });
  assert.deepEqual(home.segments[1], { id: 's2', name: 'Health', color: 'emerald', activeCount: 0, waitingCount: 0, nextDue: null });
  assert.deepEqual(home.nextUp.map((x) => [x.id, x.dayLabel]), [['b', 'Wed']]);
  assert.equal(home.inboxCount, 1);
  assert.deepEqual(home.recentlyCompleted, [{ id: 'g', title: 'g', by: 'Chandra', dayLabel: 'Sun' }]);
});

test('GET /api/home returns the page in one call', async () => {
  const db = {
    query: async (sql) => {
      if (sql.includes('from households')) return { rows: [{ id: 'h1', name: 'Home', time_zone: TZ, nudge_days: 5 }] };
      if (sql.includes('from users where')) return { rows: [{ id: 'u1', display_name: 'Chandra', is_owner: true }] };
      if (sql.includes('from segments')) return { rows: [seg('s1', 'Finances')] };
      if (sql.includes("i.state = 'done'")) return { rows: [] };
      if (sql.includes("i.state <> 'done'")) return { rows: [row('a', { title: 'Pay rent', due_date: '2026-10-27' })] };
      throw new Error(`unexpected query: ${sql}`);
    },
  };
  const app = createApp({ authenticate: openContext(db), db, corsOrigins: [], now: () => now });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const res = await fetch(`http://localhost:${server.address().port}/api/home`);
  const body = await res.json();
  await new Promise((r) => server.close(r));
  assert.equal(res.status, 200);
  assert.equal(body.user.displayName, 'Chandra');
  assert.equal(body.needsAttention[0].title, 'Pay rent');
  assert.equal(body.needsAttention[0].tag.label, 'Due tomorrow');
  assert.equal(body.segments[0].activeCount, 1);
});
