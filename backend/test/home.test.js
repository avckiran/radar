import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openContext } from './helpers.js';
import { buildHome } from '../src/rules/home.js';

const now = new Date('2026-10-26T15:00:00Z'); // Monday; the week ends Saturday 2026-10-31
const TZ = 'America/Chicago';
const row = (id, over) => ({
  id, kind: 'action', state: 'active', title: id, body: null, segment_id: 's1', segment_name: 'Finances', segment_color: 'emerald',
  creator: 'Komal', due_date: null, snoozed_until: null, follow_up_date: null, waiting_since: null, waiting_on: null,
  created_at: new Date('2026-10-20T15:00:00Z'), ...over,
});
const home = (openItems, extra = {}, at = now) => buildHome({ openItems, now: at, timeZone: TZ, ...extra });
const ids = (rows) => rows.map((r) => r.id);

test('Needs attention has four date sections: overdue, today, tomorrow, rest of the week', () => {
  const h = home([
    row('late', { due_date: '2026-10-24' }),
    row('later-late', { due_date: '2026-10-25' }),
    row('today-b', { title: 'B today', due_date: '2026-10-26' }),
    row('today-a', { title: 'A today', due_date: '2026-10-26' }),
    row('tomorrow', { due_date: '2026-10-27' }),
    row('wed', { due_date: '2026-10-28' }),
    row('sat', { due_date: '2026-10-31' }),
    row('nextweek', { due_date: '2026-11-02' }),
    row('nodate'),
  ]);
  assert.equal(h.today, '2026-10-26');
  assert.equal(h.weekEnd, '2026-10-31');
  assert.deepEqual(ids(h.attention.overdue), ['late', 'later-late']);
  assert.deepEqual(ids(h.attention.today), ['today-a', 'today-b']);
  assert.deepEqual(ids(h.attention.tomorrow), ['tomorrow']);
  assert.deepEqual(ids(h.attention.restOfWeek), ['wed', 'sat']);
  assert.equal(h.attentionCount, 7);
  assert.deepEqual(h.attention.overdue.map((r) => [r.label, r.tone]), [['2 days late', 'late'], ['1 day late', 'late']]);
  assert.deepEqual(h.attention.restOfWeek.map((r) => r.label), ['Wed', 'Sat']);
  assert.equal(h.attention.tomorrow[0].label, null);
  assert.deepEqual(h.attention.today[0].actions, ['done', 'snooze']);
  assert.deepEqual(h.attention.today[0].segment, { id: 's1', name: 'Finances', color: 'emerald' });
});

test('snoozed tasks that came back are yours today; follow-ups, the Inbox, notes and links are not in these sections', () => {
  const h = home([
    row('back', { state: 'snoozed', snoozed_until: '2026-10-26' }),
    row('back-dated', { state: 'snoozed', snoozed_until: '2026-10-25', due_date: '2026-10-30' }),
    row('back-overdue', { state: 'snoozed', snoozed_until: '2026-10-25', due_date: '2026-10-20' }),
    row('back-far', { state: 'snoozed', snoozed_until: '2026-10-26', due_date: '2026-12-01' }),
    row('still-snoozed', { state: 'snoozed', snoozed_until: '2026-10-28', due_date: '2026-10-27' }),
    row('fu', { state: 'waiting', due_date: '2026-10-26', waiting_since: new Date('2026-10-25T15:00:00Z') }),
    row('inbox', { state: 'inbox', segment_id: null, due_date: '2026-10-26' }),
    row('note', { kind: 'note' }),
    row('link', { kind: 'link', due_date: '2026-10-26' }),
  ]);
  assert.deepEqual(ids(h.attention.today), ['back-far', 'back']); // dated rows first, undated last
  assert.deepEqual(h.attention.today.map((r) => r.label), ['Back from snooze', 'Back from snooze']);
  assert.deepEqual(ids(h.attention.restOfWeek), ['back-dated']);
  assert.deepEqual(ids(h.attention.overdue), ['back-overdue']);
  assert.deepEqual(ids(h.attention.tomorrow), []);
  assert.equal(h.attentionCount, 4);
  assert.equal(h.inboxCount, 1);
});

test('on a Saturday, Tomorrow is Sunday and the rest of the week is empty', () => {
  const sat = new Date('2026-10-31T15:00:00Z');
  const h = home([row('sun', { due_date: '2026-11-01' }), row('mon', { due_date: '2026-11-02' }), row('today', { due_date: '2026-10-31' })], {}, sat);
  assert.deepEqual(ids(h.attention.today), ['today']);
  assert.deepEqual(ids(h.attention.tomorrow), ['sun']);
  assert.deepEqual(ids(h.attention.restOfWeek), []);
});

test('follow-ups: every open one, check-back dates that have come first, then the longest open', () => {
  const h = home([
    row('new', { state: 'waiting', waiting_since: new Date('2026-10-26T14:00:00Z') }),
    row('old', { state: 'waiting', waiting_since: new Date('2026-10-20T15:00:00Z'), waiting_on: 'Mike' }),
    row('due', { state: 'waiting', waiting_since: new Date('2026-10-24T15:00:00Z'), follow_up_date: '2026-10-25', waiting_on: 'The bank' }),
    row('soon', { state: 'waiting', waiting_since: new Date('2026-10-23T15:00:00Z'), follow_up_date: '2026-10-28' }),
    row('active', {}),
  ]);
  assert.deepEqual(ids(h.followUps), ['due', 'old', 'soon', 'new']);
  const due = h.followUps[0];
  assert.deepEqual([due.label, due.tone, due.sub, due.actions], ['2 days open', 'late', 'with The bank · check back now', ['done']]);
  assert.equal(h.followUps[1].sub, 'with Mike');
  assert.equal(h.followUps[2].sub, 'check back Wed');
  assert.equal(h.followUps[3].label, 'New today');
  assert.equal(h.followUps[3].sub, null);
  assert.ok(!('waitingSince' in due));
});

test('notes: the newest from every segment, a short preview, and how many there are', () => {
  const notes = Array.from({ length: 7 }, (_, i) =>
    row(`n${i}`, { kind: 'note', title: `Note ${i}`, body: `Note ${i} and then some words`, created_at: new Date(`2026-10-0${i + 1}T12:00:00Z`), segment_id: i === 6 ? null : 's1' }));
  const h = home([...notes, row('task', {}), row('long', { kind: 'note', title: 'Long', body: 'x'.repeat(300), created_at: new Date('2026-09-01T12:00:00Z') })]);
  assert.equal(h.notes.count, 8);
  assert.deepEqual(ids(h.notes.items), ['n6', 'n5', 'n4', 'n3', 'n2']);
  assert.equal(h.notes.items[0].excerpt, 'and then some words');
  assert.equal(h.notes.items[0].segment, null);
  assert.equal(h.notes.items[1].segment.name, 'Finances');
  const long = home([row('long', { kind: 'note', title: 'Long', body: 'x'.repeat(300) })]).notes.items[0].excerpt;
  assert.ok(long.length <= 110 && long.endsWith('…'));
});

test('shopping preview: how many lists are open and the first four with their progress', () => {
  const lists = Array.from({ length: 6 }, (_, i) => ({ id: `l${i}`, title: `List ${i}`, total: 4, checked: i, note: 'ignored', createdOn: '2026-10-01' }));
  const h = home([], { shoppingOpen: lists });
  assert.equal(h.shopping.count, 6);
  assert.deepEqual(h.shopping.lists[1], { id: 'l1', title: 'List 1', total: 4, checked: 1 });
  assert.equal(h.shopping.lists.length, 4);
  assert.deepEqual(home([]).shopping, { count: 0, lists: [] });
  assert.equal(home([]).attentionCount, 0);
});

test('GET /api/home returns the page in one call', async () => {
  const db = {
    query: async (sql) => {
      if (sql.includes('from households')) return { rows: [{ id: 'h1', name: 'Home', time_zone: TZ, nudge_days: 5 }] };
      if (sql.includes('from users where')) return { rows: [{ id: 'u1', display_name: 'Chandra', is_owner: true }] };
      if (sql.includes("i.state <> 'done'")) return { rows: [row('a', { title: 'Pay rent', due_date: '2026-10-27' })] };
      if (sql.includes('from shopping_lists')) return { rows: [{ id: 'l1', title: 'Whole Foods', note: null, created_at: now, archived_at: null, created_by: 'Chandra', total: 3, checked: 1 }] };
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
  assert.equal(body.attention.tomorrow[0].title, 'Pay rent');
  assert.equal(body.attentionCount, 1);
  assert.deepEqual(body.shopping, { count: 1, lists: [{ id: 'l1', title: 'Whole Foods', total: 3, checked: 1 }] });
  assert.ok(!('segments' in body) && !('nextUp' in body) && !('recentlyCompleted' in body));
});
