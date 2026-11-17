import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canEditDay,
  daySummary,
  dayHeading,
  emptyForm,
  formFromTracker,
  formProblem,
  quotaText,
  samePreset,
  DAY_PRESETS,
  scheduleBody,
  scheduleChanged,
  streakText,
  toggleDay,
  weekHeading,
  weekLabel,
} from '../src/lib/trackers.js';

const TODAY = '2026-11-17';

test('days can be picked and unpicked in order', () => {
  assert.deepEqual(toggleDay([1, 3], 2), [1, 2, 3]);
  assert.deepEqual(toggleDay([1, 2, 3], 2), [1, 3]);
  assert.equal(samePreset([1, 2, 3, 4, 5], DAY_PRESETS[1]), true);
  assert.equal(samePreset([1, 2, 3, 4], DAY_PRESETS[1]), false);
});

test('a new form starts as an everyday tracker for anytime, just for me', () => {
  const f = emptyForm(TODAY);
  assert.deepEqual([f.mode, f.part, f.scope, f.startDate, f.hasEnd], ['days', 'anytime', 'personal', TODAY, false]);
  assert.deepEqual(scheduleBody(f), { kind: 'days', days: [0, 1, 2, 3, 4, 5, 6] });
});

test('the three schedule kinds become the request the server expects', () => {
  assert.deepEqual(scheduleBody({ ...emptyForm(TODAY), mode: 'interval', intervalDays: '2' }), { kind: 'interval', intervalDays: 2 });
  assert.deepEqual(scheduleBody({ ...emptyForm(TODAY), mode: 'weekly', perWeek: '4' }), { kind: 'weekly', perWeek: 4 });
  assert.deepEqual(scheduleBody({ ...emptyForm(TODAY), days: [5, 1] }), { kind: 'days', days: [1, 5] });
});

test('editing: the form is filled from the tracker and a schedule is saved only when it changed', () => {
  const t = { title: 'Pill', note: null, part: 'morning', scope: 'personal', startDate: TODAY, endDate: null, schedule: { kind: 'interval', intervalDays: 2, anchorDate: TODAY } };
  const f = formFromTracker(t, TODAY);
  assert.deepEqual([f.title, f.mode, f.intervalDays, f.note], ['Pill', 'interval', 2, '']);
  assert.equal(scheduleChanged(f, t.schedule), false);
  assert.equal(scheduleChanged({ ...f, intervalDays: 3 }, t.schedule), true);
  assert.equal(scheduleChanged({ ...f, mode: 'weekly' }, t.schedule), true);
  const days = { kind: 'days', days: [2, 4] };
  const g = formFromTracker({ ...t, schedule: days }, TODAY);
  assert.equal(scheduleChanged(g, days), false);
  assert.equal(scheduleChanged({ ...g, days: [2, 4, 6] }, days), true);
  assert.equal(scheduleChanged(g, { kind: 'paused' }), false);
});

test('the form says what is wrong in plain words', () => {
  const ok = { ...emptyForm(TODAY), title: 'Stretch' };
  assert.equal(formProblem(ok, { isNew: true, today: TODAY }), null);
  assert.match(formProblem({ ...ok, title: '  ' }, { isNew: true, today: TODAY }), /name/);
  assert.match(formProblem({ ...ok, days: [] }, { isNew: true, today: TODAY }), /day/);
  assert.match(formProblem({ ...ok, startDate: '2026-11-16' }, { isNew: true, today: TODAY }), /today or later/);
  assert.match(formProblem({ ...ok, hasEnd: true, endDate: '' }, { isNew: true, today: TODAY }), /end date/);
  assert.match(formProblem({ ...ok, hasEnd: true, endDate: '2026-11-10' }, { isNew: true, today: TODAY }), /before the start/);
  assert.match(formProblem({ ...ok, hasEnd: true, endDate: '2026-11-10' }, { isNew: false, today: TODAY }), /today or later/);
  assert.equal(formProblem({ ...ok, mode: 'weekly', days: [] }, { isNew: true, today: TODAY }), null);
});

test('the last 7 days can be changed', () => {
  assert.equal(canEditDay(TODAY, TODAY), true);
  assert.equal(canEditDay('2026-11-11', TODAY), true);
  assert.equal(canEditDay('2026-11-10', TODAY), false);
  assert.equal(canEditDay('2026-11-18', TODAY), false);
});

test('headings and labels', () => {
  assert.equal(dayHeading(TODAY, TODAY), 'Today');
  assert.equal(dayHeading('2026-11-16', TODAY), 'Yesterday');
  assert.equal(dayHeading('2026-11-18', TODAY), 'Tomorrow');
  assert.equal(dayHeading('2026-11-12', TODAY), 'Thu, Nov 12');
  assert.equal(weekLabel('2026-11-15'), 'Nov 15 – 21');
  assert.equal(weekLabel('2026-11-29'), 'Nov 29 – Dec 5');
  assert.equal(weekHeading('2026-11-15', '2026-11-15'), 'This week');
  assert.equal(weekHeading('2026-11-08', '2026-11-15'), 'Last week');
  assert.equal(weekHeading('2026-11-22', '2026-11-15'), 'Next week');
  assert.equal(weekHeading('2026-11-01', '2026-11-15'), 'Nov 1 – 7');
  assert.equal(streakText({ current: 6, unit: 'days' }), '6-day streak');
  assert.equal(streakText({ current: 2, unit: 'weeks' }), '2-week streak');
  assert.equal(streakText({ current: 0, unit: 'days' }), null);
  assert.equal(quotaText({ done: 2, required: 4, status: 'inProgress' }), '2 of 4 this week');
  assert.equal(quotaText({ done: 0, required: 0, status: 'skipped' }), 'Skipped this week');
  assert.equal(quotaText(null), null);
  assert.equal(daySummary({ state: 'open', done: 1, total: 3, bonus: 0 }), '1 of 3 done');
  assert.equal(daySummary({ state: 'win', done: 3, total: 3, bonus: 0 }), 'Day won. Everything is done.');
  assert.equal(daySummary({ state: 'rest', done: 0, total: 0, bonus: 0 }), 'Nothing scheduled');
});
