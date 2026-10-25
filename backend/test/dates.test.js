import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, endOfWeek, nextWeekday, todayInZone, weekdayOf } from '../src/dates.js';

test('todayInZone uses the household time zone, not UTC', () => {

  assert.equal(todayInZone(new Date('2026-10-26T02:30:00Z'), 'America/New_York'), '2026-10-25');
  assert.equal(todayInZone(new Date('2026-10-26T02:30:00Z'), 'UTC'), '2026-10-26');
});

test('todayInZone handles the daylight-saving change (Nov 1, 2026 in New York)', () => {
  assert.equal(todayInZone(new Date('2026-11-01T03:30:00Z'), 'America/New_York'), '2026-10-31');
  assert.equal(todayInZone(new Date('2026-11-01T06:30:00Z'), 'America/New_York'), '2026-11-01');
  assert.equal(todayInZone(new Date('2026-11-01T12:30:00Z'), 'America/New_York'), '2026-11-01');
});

test('addDays crosses month and year ends', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('weeks run Sunday to Saturday', () => {
  assert.equal(weekdayOf('2026-10-25'), 0);
  assert.equal(endOfWeek('2026-10-25'), '2026-10-31');
  assert.equal(endOfWeek('2026-10-31'), '2026-10-31');
  assert.equal(nextWeekday('2026-10-25', 5), '2026-10-30');
  assert.equal(nextWeekday('2026-10-30', 5), '2026-10-30');
});
