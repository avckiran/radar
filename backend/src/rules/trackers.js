import { addDays, daysBetween, weekdayOf } from '../dates.js';

// The rules for trackers, with no database in them. Everything here works on plain objects:
//   tracker    { id, startDate, endDate, ... }                     (dates are 'YYYY-MM-DD' strings)
//   schedules  [{ effectiveFrom, kind, days, intervalDays, anchorDate, perWeek }]  oldest first
//   byDate     Map of 'YYYY-MM-DD' -> { status: 'done' | 'skipped', ... }  (the check-ins)
// A day is judged by the schedule that was in force on that day, so editing a schedule never rewrites the past.

export const PARTS = ['morning', 'afternoon', 'evening', 'anytime'];
export const KINDS = ['days', 'interval', 'weekly'];

const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PLURAL = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

// Weeks run Sunday to Saturday, like the rest of RADAR
export function startOfWeek(ymd) {
  return addDays(ymd, -weekdayOf(ymd));
}

// The schedule version in force on a date (versions are sorted oldest first; later ones win)
export function scheduleOn(schedules, date) {
  let found = null;
  for (const s of schedules) {
    if (s.effectiveFrom <= date) found = s;
    else break;
  }
  return found;
}

// The schedule to show in lists: the one in force today, or the first one if the tracker has not started yet
export function currentSchedule(schedules, today) {
  return scheduleOn(schedules, today) ?? schedules[0] ?? null;
}

// The last schedule that was not a pause, used when a paused tracker is resumed
export function lastActiveSchedule(schedules) {
  for (let i = schedules.length - 1; i >= 0; i--) if (schedules[i].kind !== 'paused') return schedules[i];
  return null;
}

export function scheduleText(s) {
  if (!s) return '';
  if (s.kind === 'paused') return 'Paused';
  if (s.kind === 'interval') return s.intervalDays === 2 ? 'Every other day' : `Every ${s.intervalDays} days`;
  if (s.kind === 'weekly') return `${s.perWeek} day${s.perWeek === 1 ? '' : 's'} a week`;
  const d = [...s.days].sort((a, b) => a - b);
  const key = d.join(',');
  if (d.length === 7) return 'Every day';
  if (key === '1,2,3,4,5') return 'Weekdays';
  if (key === '0,6') return 'Weekends';
  if (d.length === 1) return PLURAL[d[0]];
  return d.map((x) => SHORT[x]).join(', ');
}

export function isActiveOn(t, date) {
  return date >= t.startDate && (!t.endDate || date <= t.endDate);
}

// 'due'  = a fixed day for this tracker (every Tuesday, every other day)
// 'flex' = a day on which a "N days a week" tracker may be ticked
// null   = not scheduled that day (or paused, or outside the start and end dates)
export function slotOn(t, schedules, date) {
  if (!isActiveOn(t, date)) return null;
  const s = scheduleOn(schedules, date);
  if (!s) return null;
  if (s.kind === 'days') return s.days.includes(weekdayOf(date)) ? 'due' : null;
  if (s.kind === 'interval') {
    const n = s.intervalDays;
    return (((daysBetween(s.anchorDate, date) % n) + n) % n) === 0 ? 'due' : null;
  }
  if (s.kind === 'weekly') return 'flex';
  return null;
}

// What one day looks like for one tracker.
// done | skipped (from the check-in), missed (a fixed day in the past with no check-in), open (a fixed day today),
// upcoming (a future day), idle (a flexible day with nothing ticked), off (not scheduled)
export function dayState(t, schedules, date, checkin, today) {
  const slot = slotOn(t, schedules, date);
  if (!slot) return { slot: null, state: 'off' };
  if (checkin) return { slot, state: checkin.status };
  if (date > today) return { slot, state: 'upcoming' };
  if (slot === 'flex') return { slot, state: 'idle' };
  return { slot, state: date < today ? 'missed' : 'open' };
}

// A "N days a week" tracker, for the week that starts on weekStart (null when none of its days are flexible).
// A skipped day does not count as available, so skipping days you cannot train lowers the target (never below zero).
export function quotaWeek(t, schedules, weekStart, byDate, today) {
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    if (slotOn(t, schedules, date) === 'flex') dates.push(date);
  }
  if (!dates.length) return null;
  const perWeek = scheduleOn(schedules, dates[dates.length - 1]).perWeek;
  let done = 0;
  let skipped = 0;
  let daysLeft = 0;
  for (const date of dates) {
    const c = byDate.get(date);
    if (c?.status === 'done') done += 1;
    else if (c?.status === 'skipped') skipped += 1;
    else if (date >= today) daysLeft += 1;
  }
  const required = Math.min(perWeek, dates.length - skipped);
  const weekOver = addDays(weekStart, 6) < today;
  let status;
  if (required <= 0) status = 'skipped';
  else if (done >= required) status = 'met';
  else status = weekOver ? 'missed' : 'inProgress';
  return { weekStart, perWeek, required: Math.max(required, 0), done, skipped, daysLeft, status, atRisk: status === 'inProgress' && done + daysLeft < required };
}

// One tracker for one week: each day, plus a status for the whole week
export function trackerWeek(t, schedules, weekStart, byDate, today) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    days.push({ date, ...dayState(t, schedules, date, byDate.get(date), today) });
  }
  const due = days.filter((d) => d.slot === 'due');
  const quota = quotaWeek(t, schedules, weekStart, byDate, today);
  if (!due.length && !quota) return { weekStart, days, status: 'none', quota: null, due: 0, done: 0 };
  const missed = due.some((d) => d.state === 'missed') || quota?.status === 'missed';
  const pending = due.some((d) => d.state === 'open' || d.state === 'upcoming') || quota?.status === 'inProgress';
  const done = due.filter((d) => d.state === 'done').length;
  const anyDone = done > 0 || (quota?.status === 'met' && quota.done > 0);
  let status;
  if (missed) status = 'missed';
  else if (pending) status = 'inProgress';
  else status = anyDone ? 'met' : 'skipped';
  return { weekStart, days, status, quota, due: due.length, done };
}

// Everything that counts toward a streak, oldest first: one entry per fixed day, and one per "N days a week" week.
// result: done | skipped | missed | open
export function occurrences(t, schedules, byDate, today) {
  const last = t.endDate && t.endDate < today ? t.endDate : today;
  const out = [];
  for (let date = t.startDate; date <= last; date = addDays(date, 1)) {
    if (slotOn(t, schedules, date) === 'due') {
      const c = byDate.get(date);
      out.push({ date, kind: 'day', result: c ? c.status : date < today ? 'missed' : 'open' });
    }
    // A week closes on Saturday, or on the last day we look at
    if (weekdayOf(date) === 6 || date === last) {
      const q = quotaWeek(t, schedules, startOfWeek(date), byDate, today);
      if (q) {
        const result = { met: 'done', skipped: 'skipped', missed: 'missed', inProgress: 'open' }[q.status];
        out.push({ date, kind: 'week', weekStart: q.weekStart, result });
      }
    }
  }
  return out;
}

// Current and best run. Skipped and still-open entries neither add to a run nor break it; a missed one breaks it.
export function streakOf(entries) {
  let run = 0;
  let best = 0;
  for (const e of entries) {
    if (e.result === 'done') {
      run += 1;
      if (run > best) best = run;
    } else if (e.result === 'missed') {
      run = 0;
    }
  }
  return { current: run, best };
}

// Share of done out of done + missed, in whole percent. Skipped and still-open entries are left out. null when nothing counts yet.
export function completionOf(entries, from, to) {
  let done = 0;
  let missed = 0;
  let skipped = 0;
  for (const e of entries) {
    if (e.date < from || e.date > to) continue;
    if (e.result === 'done') done += 1;
    else if (e.result === 'missed') missed += 1;
    else if (e.result === 'skipped') skipped += 1;
  }
  return { done, missed, skipped, pct: done + missed ? Math.round((100 * done) / (done + missed)) : null };
}

// One day across a set of trackers (each { t, schedules, byDate }).
// win  = something was done and nothing was missed or is still open
// miss = a fixed day in the past was not done
// open = fixed things are still to do today
// rest = nothing scheduled, or everything was skipped
// "N days a week" trackers never make a day a miss, but ticking one counts as a win on an otherwise empty day.
export function dayOutcome(list, date, today) {
  let done = 0;
  let due = 0;
  let skipped = 0;
  let missed = 0;
  let open = 0;
  let bonus = 0;
  for (const { t, schedules, byDate } of list) {
    const { slot, state } = dayState(t, schedules, date, byDate.get(date), today);
    if (slot === 'due') {
      due += 1;
      if (state === 'done') done += 1;
      else if (state === 'skipped') skipped += 1;
      else if (state === 'missed') missed += 1;
      else if (state === 'open') open += 1;
    } else if (slot === 'flex' && state === 'done') {
      bonus += 1;
    }
  }
  let state;
  if (date > today) state = 'upcoming';
  else if (missed) state = 'miss';
  else if (open) state = 'open';
  else if (done + bonus > 0) state = 'win';
  else state = 'rest';
  return { state, done, due, skipped, missed, open, bonus };
}

export function earliestStart(list) {
  return list.reduce((min, { t }) => (min === null || t.startDate < min ? t.startDate : min), null);
}

// Win days in a row. Rest days and today (while still open) neither add nor break.
export function dayStreak(list, today) {
  const from = earliestStart(list);
  if (!from) return { current: 0, best: 0, wins: 0 };
  let run = 0;
  let best = 0;
  let wins = 0;
  for (let date = from; date <= today; date = addDays(date, 1)) {
    const { state } = dayOutcome(list, date, today);
    if (state === 'win') {
      run += 1;
      wins += 1;
      if (run > best) best = run;
    } else if (state === 'miss') {
      run = 0;
    }
  }
  return { current: run, best, wins };
}

// One week across a set of trackers: missed if any tracker missed, in progress while anything is still to come, met otherwise
export function weekOutcome(list, weekStart, today) {
  const weeks = list.map(({ t, schedules, byDate }) => trackerWeek(t, schedules, weekStart, byDate, today));
  const counted = weeks.filter((w) => w.status !== 'none');
  let status;
  if (!counted.length) status = 'none';
  else if (counted.some((w) => w.status === 'missed')) status = 'missed';
  else if (counted.some((w) => w.status === 'inProgress')) status = 'inProgress';
  else status = counted.some((w) => w.status === 'met') ? 'met' : 'skipped';
  return { weekStart, status, met: counted.filter((w) => w.status === 'met').length, total: counted.length };
}

// Weeks won in a row. The current week counts once it is met, and never breaks a streak while it is still running.
export function weekStreak(list, today) {
  const from = earliestStart(list);
  if (!from) return { current: 0, best: 0, wins: 0 };
  let run = 0;
  let best = 0;
  let wins = 0;
  const thisWeek = startOfWeek(today);
  for (let ws = startOfWeek(from); ws <= thisWeek; ws = addDays(ws, 7)) {
    const { status } = weekOutcome(list, ws, today);
    if (status === 'met') {
      run += 1;
      wins += 1;
      if (run > best) best = run;
    } else if (status === 'missed' && ws < thisWeek) {
      run = 0;
    }
  }
  return { current: run, best, wins };
}

export const MILESTONES = [3, 7, 14, 30, 60, 100, 200, 365];

export function nextMilestone(current) {
  const next = MILESTONES.find((m) => m > current);
  return next ? { target: next, toGo: next - current } : null;
}
