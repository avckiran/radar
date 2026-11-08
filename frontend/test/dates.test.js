import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayHint, dueShortcuts, followUpOptions, longDate, shortDate, snoozeOptions } from '../src/lib/dates.js';
import { ATTENTION_SECTIONS, columnCount, removeAttentionRow } from '../src/lib/homeState.js';
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

test('removing a row takes it out of every Home list and keeps the count honest', () => {
  const home = {
    attention: { overdue: [{ id: 'a' }], today: [{ id: 'b' }, { id: 'c' }], tomorrow: [], restOfWeek: [{ id: 'd' }] },
    attentionCount: 4,
    followUps: [{ id: 'b' }, { id: 'e' }],
    other: 1,
  };
  assert.deepEqual(removeAttentionRow(home, 'b'), {
    attention: { overdue: [{ id: 'a' }], today: [{ id: 'c' }], tomorrow: [], restOfWeek: [{ id: 'd' }] },
    attentionCount: 3,
    followUps: [{ id: 'e' }],
    other: 1,
  });
  assert.equal(removeAttentionRow(null, 'a'), null);
});

test('Home shows three columns when wide, two when medium, one on a phone', () => {
  assert.equal(columnCount(1300, false), 3);
  assert.equal(columnCount(1040, false), 3);
  assert.equal(columnCount(900, false), 2);
  assert.equal(columnCount(700, false), 2);
  assert.equal(columnCount(390, true), 1);
  assert.equal(columnCount(0, true), 3);
  assert.equal(columnCount(0, false), 1);
});

test('the four Needs attention sections keep their order', () => {
  assert.deepEqual(ATTENTION_SECTIONS.map((s) => s.title), ['Overdue', 'Today', 'Tomorrow', 'Rest of the week']);
});

test('plural', () => {
  assert.equal(plural(1, 'item'), '1 item');
  assert.equal(plural(3, 'item'), '3 items');
});

test('due shortcuts offer Today, Tomorrow and the next Friday at least two days away', () => {
  assert.deepEqual(
    dueShortcuts('2026-10-20').map((o) => [o.label, o.date]),
    [['Today', '2026-10-20'], ['Tomorrow', '2026-10-21'], ['Fri', '2026-10-23']]
  );
  assert.equal(dueShortcuts('2026-10-23')[2].date, '2026-10-30');
  assert.equal(dueShortcuts('2026-10-25')[2].date, '2026-10-30');
});
