import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  completionOf,
  dayOutcome,
  dayState,
  dayStreak,
  nextMilestone,
  occurrences,
  quotaWeek,
  scheduleOn,
  scheduleText,
  slotOn,
  startOfWeek,
  streakOf,
  trackerWeek,
  weekOutcome,
  weekStreak,
} from '../src/rules/trackers.js';
import { buildDayView, buildProgress, buildWeekView, insightsOf, prepare, trackerStatus } from '../src/rules/trackerViews.js';

// "Today" is Tuesday 2026-11-17. Weeks run Sunday to Saturday, so this week is 11-15 to 11-21.
const TODAY = '2026-11-17';
const tr = (over = {}) => ({ id: 't', title: 'Thing', scope: 'personal', part: 'anytime', startDate: '2026-11-01', endDate: null, ...over });
const days = (list, from = '2026-11-01') => [{ effectiveFrom: from, kind: 'days', days: list }];
const interval = (n, anchor, from = anchor) => [{ effectiveFrom: from, kind: 'interval', intervalDays: n, anchorDate: anchor }];
const weekly = (n, from = '2026-11-01') => [{ effectiveFrom: from, kind: 'weekly', perWeek: n }];
const marks = (map) => new Map(Object.entries(map).map(([d, status]) => [d, typeof status === 'string' ? { status } : status]));
const ALL = [0, 1, 2, 3, 4, 5, 6];

test('schedule wording', () => {
  assert.equal(scheduleText({ kind: 'days', days: ALL }), 'Every day');
  assert.equal(scheduleText({ kind: 'days', days: [1, 2, 3, 4, 5] }), 'Weekdays');
  assert.equal(scheduleText({ kind: 'days', days: [6, 0] }), 'Weekends');
  assert.equal(scheduleText({ kind: 'days', days: [2] }), 'Tuesdays');
  assert.equal(scheduleText({ kind: 'days', days: [5, 1, 3] }), 'Mon, Wed, Fri');
  assert.equal(scheduleText({ kind: 'interval', intervalDays: 2 }), 'Every other day');
  assert.equal(scheduleText({ kind: 'interval', intervalDays: 3 }), 'Every 3 days');
  assert.equal(scheduleText({ kind: 'weekly', perWeek: 4 }), '4 days a week');
  assert.equal(scheduleText({ kind: 'weekly', perWeek: 1 }), '1 day a week');
  assert.equal(scheduleText({ kind: 'paused' }), 'Paused');
});

test('weeks start on Sunday', () => {
  assert.equal(startOfWeek('2026-11-17'), '2026-11-15');
  assert.equal(startOfWeek('2026-11-15'), '2026-11-15');
  assert.equal(startOfWeek('2026-11-21'), '2026-11-15');
  assert.equal(startOfWeek('2026-11-22'), '2026-11-22');
});

test('fixed days: Tuesdays only', () => {
  const t = tr();
  const s = days([2]);
  assert.equal(slotOn(t, s, '2026-11-17'), 'due');
  assert.equal(slotOn(t, s, '2026-11-18'), null);
  assert.equal(slotOn(t, s, '2026-11-24'), 'due');
});

test('every other day follows the first day, also across month ends', () => {
  const t = tr({ startDate: '2026-11-17' });
  const s = interval(2, '2026-11-17');
  const due = [];
  for (let d = 17; d <= 30; d++) if (slotOn(t, s, `2026-11-${d}`)) due.push(d);
  assert.deepEqual(due, [17, 19, 21, 23, 25, 27, 29]);
  assert.equal(slotOn(t, s, '2026-12-01'), 'due');
  assert.equal(slotOn(t, s, '2026-12-02'), null);
  assert.equal(slotOn(tr({ startDate: '2026-11-01' }), interval(3, '2026-11-17', '2026-11-01'), '2026-11-14'), 'due'); // counts backwards too
});

test('a tracker is only scheduled between its start and end dates', () => {
  const t = tr({ startDate: '2026-11-10', endDate: '2026-11-20' });
  const s = days(ALL, '2026-11-10');
  assert.equal(slotOn(t, s, '2026-11-09'), null);
  assert.equal(slotOn(t, s, '2026-11-10'), 'due');
  assert.equal(slotOn(t, s, '2026-11-20'), 'due');
  assert.equal(slotOn(t, s, '2026-11-21'), null);
});

test('changing the schedule never rewrites the past', () => {
  const t = tr();
  const s = [
    { effectiveFrom: '2026-11-01', kind: 'days', days: ALL },
    { effectiveFrom: '2026-11-10', kind: 'days', days: [2] },
  ];
  assert.equal(scheduleOn(s, '2026-11-09').days.length, 7);
  assert.equal(slotOn(t, s, '2026-11-04'), 'due'); // Wednesday before the change: still a due day
  assert.equal(slotOn(t, s, '2026-11-11'), null); // Wednesday after the change
  assert.equal(slotOn(t, s, '2026-11-17'), 'due');
  // two versions on the same day: the later one wins
  const same = [...s, { effectiveFrom: '2026-11-10', kind: 'paused' }];
  assert.equal(slotOn(t, same, '2026-11-17'), null);
});

test('paused days are not scheduled and resume restores the old schedule', () => {
  const t = tr();
  const s = [...days(ALL), { effectiveFrom: '2026-11-08', kind: 'paused' }, { effectiveFrom: '2026-11-15', kind: 'days', days: ALL }];
  assert.equal(slotOn(t, s, '2026-11-10'), null);
  assert.equal(slotOn(t, s, '2026-11-16'), 'due');
});

test('day states: done, skipped, missed, open, upcoming, off', () => {
  const t = tr();
  const s = days([1, 2, 3]);
  const m = marks({ '2026-11-16': 'done', '2026-11-11': 'skipped' });
  assert.equal(dayState(t, s, '2026-11-16', m.get('2026-11-16'), TODAY).state, 'done');
  assert.equal(dayState(t, s, '2026-11-11', m.get('2026-11-11'), TODAY).state, 'skipped');
  assert.equal(dayState(t, s, '2026-11-10', undefined, TODAY).state, 'missed');
  assert.equal(dayState(t, s, '2026-11-17', undefined, TODAY).state, 'open');
  assert.equal(dayState(t, s, '2026-11-18', undefined, TODAY).state, 'upcoming');
  assert.equal(dayState(t, s, '2026-11-19', undefined, TODAY).state, 'off');
  // a check-in on a day that is no longer scheduled is ignored
  assert.equal(dayState(t, s, '2026-11-19', { status: 'done' }, TODAY).state, 'off');
});

test('N days a week: met, in progress, missed, and skipped days lower the target', () => {
  const t = tr();
  const s = weekly(4);
  const last = '2026-11-08'; // the week 11-08 to 11-14 is over
  let q = quotaWeek(t, s, last, marks({ '2026-11-09': 'done', '2026-11-10': 'done', '2026-11-12': 'done' }), TODAY);
  assert.deepEqual([q.done, q.required, q.status], [3, 4, 'missed']);
  q = quotaWeek(t, s, last, marks({ '2026-11-09': 'done', '2026-11-10': 'done', '2026-11-12': 'done', '2026-11-13': 'done' }), TODAY);
  assert.equal(q.status, 'met');
  // skip 4 days: only 3 days remain available, so 3 are enough
  q = quotaWeek(t, s, last, marks({ '2026-11-08': 'skipped', '2026-11-09': 'skipped', '2026-11-10': 'skipped', '2026-11-11': 'skipped', '2026-11-12': 'done', '2026-11-13': 'done', '2026-11-14': 'done' }), TODAY);
  assert.deepEqual([q.required, q.status], [3, 'met']);
  // skip every day: nothing is required
  q = quotaWeek(t, s, last, marks(Object.fromEntries(ALL.map((i) => [`2026-11-${String(8 + i).padStart(2, '0')}`, 'skipped']))), TODAY);
  assert.equal(q.status, 'skipped');
  // the current week: in progress, and "at risk" once the days left cannot reach the target
  q = quotaWeek(t, s, '2026-11-15', marks({ '2026-11-15': 'done' }), TODAY);
  assert.deepEqual([q.status, q.done, q.daysLeft, q.atRisk], ['inProgress', 1, 5, false]);
  q = quotaWeek(t, s, '2026-11-15', marks({ '2026-11-15': 'done' }), '2026-11-20');
  assert.deepEqual([q.status, q.daysLeft, q.atRisk], ['inProgress', 2, true]);
  assert.equal(quotaWeek(t, days(ALL), '2026-11-08', new Map(), TODAY), null);
});

test('a tracker that starts mid-week only counts the days it was active', () => {
  const t = tr({ startDate: '2026-11-12' });
  const q = quotaWeek(t, weekly(4, '2026-11-12'), '2026-11-08', marks({ '2026-11-12': 'done', '2026-11-13': 'done', '2026-11-14': 'done' }), TODAY);
  assert.deepEqual([q.required, q.status], [3, 'met']);
});

test('streaks: a miss breaks the run, skipped days and today (open) do not', () => {
  const t = tr();
  const s = days(ALL);
  const done = {};
  for (let d = 1; d <= 16; d++) done[`2026-11-${String(d).padStart(2, '0')}`] = 'done';
  delete done['2026-11-10']; // missed
  done['2026-11-13'] = 'skipped';
  const events = occurrences(t, s, marks(done), TODAY);
  assert.equal(events.at(-1).result, 'open'); // today
  const st = streakOf(events);
  assert.equal(st.best, 9); // 11-01 to 11-09
  assert.equal(st.current, 5); // 11-11, 11-12, 11-14, 11-15, 11-16 (11-13 was skipped, so it adds nothing and breaks nothing)
});

test('streak counts only done days, so a skipped day in the middle adds nothing', () => {
  const t = tr();
  const m = marks({ '2026-11-14': 'done', '2026-11-15': 'skipped', '2026-11-16': 'done', '2026-11-13': 'done', '2026-11-12': 'done', '2026-11-11': 'done', '2026-11-10': 'done', '2026-11-09': 'done', '2026-11-08': 'done', '2026-11-07': 'done', '2026-11-06': 'done', '2026-11-05': 'done', '2026-11-04': 'done', '2026-11-03': 'done', '2026-11-02': 'done', '2026-11-01': 'done' });
  assert.equal(streakOf(occurrences(t, days(ALL), m, TODAY)).current, 15);
});

test('quota trackers streak in weeks', () => {
  const t = tr({ startDate: '2026-10-25' });
  const s = weekly(2, '2026-10-25');
  const m = marks({ '2026-10-26': 'done', '2026-10-28': 'done', '2026-11-02': 'done', '2026-11-04': 'done', '2026-11-09': 'done', '2026-11-16': 'done', '2026-11-17': 'done' });
  const events = occurrences(t, s, m, TODAY);
  // weeks: 10-25 met, 11-01 met, 11-08 missed (1 of 2), 11-15 met already (2 of 2, week still running)
  assert.deepEqual(events.map((e) => e.result), ['done', 'done', 'missed', 'done']);
  assert.deepEqual(streakOf(events), { current: 1, best: 2 });
});

test('completion leaves out skipped and still-open days', () => {
  const t = tr();
  const m = marks({ '2026-11-14': 'done', '2026-11-15': 'skipped', '2026-11-16': 'done' });
  const events = occurrences(t, days(ALL), m, TODAY);
  const c = completionOf(events, '2026-11-14', TODAY);
  assert.deepEqual(c, { done: 2, missed: 0, skipped: 1, pct: 100 });
  assert.equal(completionOf(events, '2026-11-01', '2026-11-13').pct, 0);
  assert.equal(completionOf([], '2026-11-01', TODAY).pct, null);
});

test('a day is a win, a miss, open, rest or upcoming', () => {
  const pill = { t: tr({ id: 'pill' }), schedules: days(ALL), byDate: marks({ '2026-11-16': 'done' }) };
  const med = { t: tr({ id: 'med' }), schedules: days(ALL), byDate: marks({ '2026-11-16': 'done', '2026-11-15': 'done' }) };
  assert.equal(dayOutcome([pill, med], '2026-11-16', TODAY).state, 'win');
  assert.equal(dayOutcome([pill, med], '2026-11-15', TODAY).state, 'miss'); // the pill was missed
  assert.equal(dayOutcome([pill, med], TODAY, TODAY).state, 'open');
  assert.equal(dayOutcome([pill, med], '2026-11-18', TODAY).state, 'upcoming');
  assert.equal(dayOutcome([], TODAY, TODAY).state, 'rest');
  const skipper = { t: tr(), schedules: days(ALL), byDate: marks({ '2026-11-16': 'skipped' }) };
  assert.equal(dayOutcome([skipper], '2026-11-16', TODAY).state, 'rest');
});

test('a workout on a day with nothing else due is a win; a workout never causes a miss', () => {
  const trash = { t: tr({ id: 'trash' }), schedules: days([2]), byDate: new Map() };
  const gym = { t: tr({ id: 'gym' }), schedules: weekly(4), byDate: marks({ '2026-11-16': 'done' }) };
  assert.equal(dayOutcome([trash, gym], '2026-11-16', TODAY).state, 'win'); // Monday: trash not due, workout done
  assert.equal(dayOutcome([trash, gym], '2026-11-14', TODAY).state, 'rest'); // Saturday: nothing due, no workout ticked
});

test('day streak: rest days and today do not break it', () => {
  const trash = { t: tr({ startDate: '2026-11-03' }), schedules: days([2], '2026-11-03'), byDate: marks({ '2026-11-03': 'done', '2026-11-10': 'done' }) };
  // Tuesday 11-17 is today and still open
  assert.deepEqual(dayStreak([trash], TODAY), { current: 2, best: 2, wins: 2 });
  const miss = { ...trash, byDate: marks({ '2026-11-03': 'done' }) };
  assert.deepEqual(dayStreak([miss], TODAY), { current: 0, best: 1, wins: 1 });
});

test('week outcome and week streak', () => {
  const daily = { t: tr(), schedules: days(ALL), byDate: marks({ '2026-11-01': 'done', '2026-11-02': 'done', '2026-11-03': 'done', '2026-11-04': 'done', '2026-11-05': 'done', '2026-11-06': 'done', '2026-11-07': 'done', '2026-11-08': 'done', '2026-11-09': 'done', '2026-11-10': 'done', '2026-11-11': 'done', '2026-11-12': 'done', '2026-11-13': 'done', '2026-11-14': 'done', '2026-11-15': 'done', '2026-11-16': 'done' }) };
  assert.equal(weekOutcome([daily], '2026-11-08', TODAY).status, 'met');
  assert.equal(weekOutcome([daily], '2026-11-15', TODAY).status, 'inProgress');
  assert.equal(weekOutcome([], '2026-11-08', TODAY).status, 'none');
  const ws = weekStreak([daily], TODAY);
  assert.equal(ws.current, 2); // 11-01 week (starts Sunday 11-01) and 11-08 week; this week is still running
});

test('a week with one missed tracker is missed', () => {
  const a = { t: tr({ id: 'a' }), schedules: days([1]), byDate: marks({ '2026-11-09': 'done' }) };
  const b = { t: tr({ id: 'b' }), schedules: days([3]), byDate: new Map() };
  const w = weekOutcome([a, b], '2026-11-08', TODAY);
  assert.equal(w.status, 'missed');
  assert.deepEqual([w.met, w.total], [1, 2]);
  assert.equal(trackerWeek(b.t, b.schedules, '2026-11-08', b.byDate, TODAY).status, 'missed');
});

test('milestones', () => {
  assert.deepEqual(nextMilestone(0), { target: 3, toGo: 3 });
  assert.deepEqual(nextMilestone(7), { target: 14, toGo: 7 });
  assert.equal(nextMilestone(400), null);
});

const build = (entries) => prepare(entries, TODAY);

test('the day view groups trackers by time of day and counts what is done', () => {
  const list = build([
    { t: tr({ id: 'm', title: 'Meditate', part: 'morning' }), schedules: days(ALL), byDate: marks({ [TODAY]: 'done' }) },
    { t: tr({ id: 'p', title: 'Pill', part: 'morning', startDate: '2026-11-17' }), schedules: interval(2, '2026-11-17'), byDate: new Map() },
    { t: tr({ id: 'tr', title: 'Trash', part: 'evening' }), schedules: days([2]), byDate: new Map() },
    { t: tr({ id: 'w', title: 'Workout', part: 'anytime' }), schedules: weekly(4), byDate: marks({ '2026-11-16': 'done' }) },
    { t: tr({ id: 'x', title: 'Wednesdays only' }), schedules: days([3]), byDate: new Map() },
  ]);
  const view = buildDayView(list, TODAY, TODAY);
  assert.deepEqual(view.groups.map((g) => g.part), ['morning', 'evening', 'anytime']);
  assert.deepEqual(view.groups[0].rows.map((r) => [r.title, r.state]), [['Meditate', 'done'], ['Pill', 'open']]);
  assert.equal(view.groups[2].rows[0].kind, 'quota');
  assert.deepEqual([view.groups[2].rows[0].quota.done, view.groups[2].rows[0].quota.required], [1, 4]);
  assert.deepEqual(view.summary, { state: 'open', done: 1, total: 3, skipped: 0, bonus: 0 });
  assert.equal(view.isToday, true);
});

test('the week view lists only trackers that have something that week', () => {
  const list = build([
    { t: tr({ id: 'a', title: 'Trash' }), schedules: days([2]), byDate: marks({ '2026-11-10': 'done' }) },
    { t: tr({ id: 'b', title: 'Later', startDate: '2026-12-01' }), schedules: days(ALL, '2026-12-01'), byDate: new Map() },
  ]);
  const w = buildWeekView(list, '2026-11-08', TODAY);
  assert.deepEqual(w.rows.map((r) => r.title), ['Trash']);
  assert.equal(w.rows[0].days[2].state, 'done');
  assert.equal(w.status, 'met');
  assert.equal(w.currentWeek, '2026-11-15');
  assert.equal(w.days.length, 7);
});

test('progress: summary, heatmap of 12 weeks, a card per tracker', () => {
  const done = {};
  for (let d = 1; d <= 16; d++) done[`2026-11-${String(d).padStart(2, '0')}`] = 'done';
  const list = build([{ t: tr({ id: 'a', title: 'Meditate' }), schedules: days(ALL), byDate: marks(done) }]);
  const p = buildProgress(list, { today: TODAY, range: '30' });
  assert.equal(p.summary.dayStreak, 16);
  assert.equal(p.summary.completion, 100);
  assert.equal(p.summary.nextMilestone.target, 30);
  assert.equal(p.heatmap.length, 12);
  assert.equal(p.heatmap[11].weekStart, '2026-11-15');
  assert.equal(p.heatmap[11].days[2].state, 'open'); // today
  assert.equal(p.heatmap[11].days[3].state, 'upcoming');
  assert.equal(p.cards.length, 1);
  assert.equal(p.cards[0].streak.current, 16);
  assert.equal(p.cards[0].trend.length, 8);
  assert.equal(buildProgress(list, { today: TODAY, range: 'all', trackerId: 'nope' }).hasTrackers, false);
  assert.equal(buildProgress([], { today: TODAY }).summary.completion, null);
});

test('insights name the weekday or time of day that slips', () => {
  const ev = (date, part) => ({ date, kind: 'day', result: 'missed', part });
  assert.deepEqual(insightsOf([ev('2026-11-06', 'evening')], TODAY), []);
  const out = insightsOf([ev('2026-11-06', 'evening'), ev('2026-10-30', 'evening'), ev('2026-11-13', 'evening'), ev('2026-11-10', 'morning')], TODAY);
  assert.deepEqual(out, ['Most often missed: Fridays.', 'Evening trackers slip the most.']);
});

test('tracker status', () => {
  const entry = (t, schedules) => ({ t, schedules, byDate: new Map() });
  assert.equal(trackerStatus(entry(tr(), days(ALL)), TODAY), 'active');
  assert.equal(trackerStatus(entry(tr({ startDate: '2026-12-01' }), days(ALL, '2026-12-01')), TODAY), 'upcoming');
  assert.equal(trackerStatus(entry(tr({ endDate: '2026-11-10' }), days(ALL)), TODAY), 'finished');
  assert.equal(trackerStatus(entry(tr(), [...days(ALL), { effectiveFrom: '2026-11-10', kind: 'paused' }]), TODAY), 'paused');
});
