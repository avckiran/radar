import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsAttention, dueTag } from '../src/rules/needsAttention.js';

const TZ = 'America/Chicago';
const opts = (iso) => ({ now: new Date(iso), timeZone: TZ, nudgeDays: 5 });

let n = 0;
function item(over = {}) {
  n += 1;
  return {
    id: `i${n}`,
    kind: 'action',
    state: 'active',
    title: `Item ${n}`,
    segment_id: 's1',
    segment_name: 'Finances',
    segment_color: 'emerald',
    creator: 'Chandra',
    due_date: null,
    snoozed_until: null,
    follow_up_date: null,
    waiting_since: null,
    created_at: new Date('2026-10-01T15:00:00Z'),
    ...over,
  };
}
const ids = (rows) => rows.map((r) => r.title);

test('Sunday: the whole week through Saturday counts, next Sunday does not', () => {
  const rows = needsAttention(
    [item({ title: 'Sat', due_date: '2026-10-31' }), item({ title: 'Next Sun', due_date: '2026-11-01' })],
    opts('2026-10-25T17:00:00Z')
  );
  assert.deepEqual(ids(rows), ['Sat']);
});

test('Saturday: only today is left of the week', () => {
  const rows = needsAttention(
    [item({ title: 'Today', due_date: '2026-10-31' }), item({ title: 'Tomorrow', due_date: '2026-11-01' })],
    opts('2026-10-31T17:00:00Z')
  );
  assert.deepEqual(ids(rows), ['Today']);
  assert.equal(rows[0].tag.label, 'Due today');
});

test('Monday: something due Sunday is overdue and still shown', () => {
  const rows = needsAttention([item({ title: 'Missed', due_date: '2026-10-25' })], opts('2026-10-26T15:00:00Z'));
  assert.deepEqual(rows[0].tag, { kind: 'overdue', label: 'Overdue 1 day' });
});

test('late evening local time still counts as that local day', () => {
  const rows = needsAttention([item({ title: 'Due', due_date: '2026-10-31' })], opts('2026-11-01T04:30:00Z'));
  assert.equal(rows[0].tag.label, 'Due today');
});

test('daylight-saving change does not shift days (Nov 1 2026)', () => {
  const rows = needsAttention(
    [item({ title: 'Wait', state: 'waiting', waiting_since: new Date('2026-10-31T12:00:00Z') })],
    opts('2026-11-05T18:00:00Z')
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tag.label, 'Waiting 5 days');
});

test('daylight-saving change in March does not shift days (Mar 14 2027)', () => {
  const rows = needsAttention(
    [item({ title: 'Due', due_date: '2027-03-15' })],
    opts('2027-03-14T06:30:00Z')
  );
  assert.equal(rows[0].tag.label, 'Due tomorrow');
});

test('dated items sort by due date, then title; rows carry tags and actions', () => {
  const rows = needsAttention(
    [
      item({ title: 'B', due_date: '2026-10-28' }),
      item({ title: 'A', due_date: '2026-10-28' }),
      item({ title: 'Late', due_date: '2026-10-22' }),
    ],
    opts('2026-10-26T15:00:00Z')
  );
  assert.deepEqual(ids(rows), ['Late', 'A', 'B']);
  assert.deepEqual(rows[0].actions, ['done', 'snooze', 'waiting']);
  assert.equal(rows[0].tag.kind, 'overdue');
  assert.equal(rows[1].tag.kind, 'soon');
});

test('waiting items nudge at the threshold or after the follow-up date', () => {
  const now = opts('2026-10-26T15:00:00Z');
  const rows = needsAttention(
    [
      item({ title: 'Four days', state: 'waiting', waiting_since: new Date('2026-10-22T15:00:00Z') }),
      item({ title: 'Five days', state: 'waiting', waiting_since: new Date('2026-10-21T15:00:00Z') }),
      item({
        title: 'Follow-up',
        state: 'waiting',
        waiting_since: new Date('2026-10-25T15:00:00Z'),
        follow_up_date: '2026-10-26',
      }),
    ],
    now
  );
  assert.deepEqual(ids(rows), ['Five days', 'Follow-up']);
  assert.deepEqual(rows[0].actions, ['done', 'back']);
  assert.match(rows[1].tag.label, /follow up today/);
});

test('a snooze that has come back shows up, one still sleeping does not', () => {
  const rows = needsAttention(
    [
      item({ title: 'Back', state: 'snoozed', snoozed_until: '2026-10-26' }),
      item({ title: 'Asleep', state: 'snoozed', snoozed_until: '2026-10-28' }),
      item({ title: 'Back with due', state: 'snoozed', snoozed_until: '2026-10-24', due_date: '2026-10-27' }),
    ],
    opts('2026-10-26T15:00:00Z')
  );
  assert.deepEqual(ids(rows), ['Back with due', 'Back']);
  assert.equal(rows[1].tag.label, 'Back from snooze');
});

test('inbox items wait two days before they are flagged; notes only offer Sort', () => {
  const rows = needsAttention(
    [
      item({ title: 'Fresh', state: 'inbox', segment_id: null, created_at: new Date('2026-10-25T20:00:00Z') }),
      item({ title: 'Old action', state: 'inbox', segment_id: null, created_at: new Date('2026-10-24T15:00:00Z') }),
      item({ title: 'Old note', kind: 'note', state: 'inbox', segment_id: null, created_at: new Date('2026-10-20T15:00:00Z') }),
    ],
    opts('2026-10-26T15:00:00Z')
  );
  assert.deepEqual(ids(rows), ['Old note', 'Old action']);
  assert.deepEqual(rows[0].actions, ['sort']);
  assert.deepEqual(rows[1].actions, ['done', 'sort']);
  assert.equal(rows[1].tag.label, 'Unsorted 2 days');
});

test('overall order: dated, undated returns, waiting nudges, then inbox', () => {
  const rows = needsAttention(
    [
      item({ title: 'Inbox', state: 'inbox', segment_id: null, created_at: new Date('2026-10-01T15:00:00Z') }),
      item({ title: 'Nudge', state: 'waiting', waiting_since: new Date('2026-10-01T15:00:00Z') }),
      item({ title: 'Return', state: 'snoozed', snoozed_until: '2026-10-20' }),
      item({ title: 'Due', due_date: '2026-10-30' }),
      item({ title: 'Done', state: 'done' }),
      item({ title: 'Note', kind: 'note' }),
    ],
    opts('2026-10-26T15:00:00Z')
  );
  assert.deepEqual(ids(rows), ['Due', 'Return', 'Nudge', 'Inbox']);
});

test('dueTag labels', () => {
  assert.equal(dueTag('2026-10-24', '2026-10-26').label, 'Overdue 2 days');
  assert.equal(dueTag('2026-10-27', '2026-10-26').label, 'Due tomorrow');
  assert.equal(dueTag('2026-10-30', '2026-10-26').label, 'Due Fri');
  assert.equal(dueTag('2026-10-29', '2026-10-26').kind, 'later');
  assert.equal(dueTag('2026-10-28', '2026-10-26').kind, 'soon');
});

test('a waiting item due this week keeps its waiting tag and carries the due date for urgency', () => {
  const rows = needsAttention(
    [item({ title: 'Claim', state: 'waiting', waiting_since: new Date('2026-10-25T15:00:00Z'), due_date: '2026-10-27', follow_up_date: '2026-10-29' })],
    opts('2026-10-26T15:00:00Z')
  );
  assert.equal(rows[0].reason, 'due');
  assert.deepEqual(rows[0].tag, { kind: 'waiting', label: 'Waiting 1 day · follow up Thu' });
  assert.deepEqual(rows[0].due, { kind: 'soon', label: 'Due tomorrow' });
  assert.deepEqual(rows[0].actions, ['done', 'back']);
});
