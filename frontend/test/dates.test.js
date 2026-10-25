import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayHint, followUpOptions, longDate, shortDate, snoozeOptions } from '../src/lib/dates.js';
import { removeAttentionRow } from '../src/lib/homeState.js';
import { plural } from '../src/lib/text.js';

test('headers read like the design', () => {
  assert.equal(shortDate('2026-10-20'), 'Tue, Oct 20');
  assert.equal(longDate('2026-10-20'), 'Tuesday, October 20');
});

test('snooze options on a Tuesday', () => {
  assert.deepEqual(
    snoozeOptions('2026-10-20').map((o) => [o.label, o.date]),
    [['Tomorrow', '2026-10-21'], ['In 2 days', '2026-10-22'], ['Next week', '2026-10-26']]
  );
});

test('next week is the Monday of the next Sunday to Saturday week, even on a Sunday or Saturday', () => {
  assert.equal(snoozeOptions('2026-10-25')[2].date, '2026-11-02');
  assert.equal(snoozeOptions('2026-10-31')[2].date, '2026-11-02');
  assert.equal(snoozeOptions('2026-12-30')[2].date, '2027-01-04');
});

test('follow-up options', () => {
  assert.deepEqual(
    followUpOptions('2026-10-20').map((o) => [o.label, o.date]),
    [['In 3 days', '2026-10-23'], ['In a week', '2026-10-27']]
  );
});

test('day hints use the weekday close by and the date further out', () => {
  assert.equal(dayHint('2026-10-23', '2026-10-20'), 'Fri');
  assert.equal(dayHint('2026-10-27', '2026-10-20'), 'Tue, Oct 27');
});

test('removing a row leaves the rest alone', () => {
  const home = { needsAttention: [{ id: 'a' }, { id: 'b' }], other: 1 };
  assert.deepEqual(removeAttentionRow(home, 'a'), { needsAttention: [{ id: 'b' }], other: 1 });
  assert.equal(removeAttentionRow(null, 'a'), null);
});

test('plural', () => {
  assert.equal(plural(1, 'item'), '1 item');
  assert.equal(plural(3, 'item'), '3 items');
});
