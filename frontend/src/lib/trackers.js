import { addDays, daysBetween, monthDay, shortDate } from './dates.js';

// Words and small rules for the Trackers screens. No screens in here, so it can be tested on its own.

export const LIMITS = { title: 80, note: 500, skipNote: 200 };
export const BACKFILL_DAYS = 7; // today and the six days before it can be changed

export const PARTS = [
  { key: 'morning', label: 'Morning' },
  { key: 'afternoon', label: 'Afternoon' },
  { key: 'evening', label: 'Evening' },
  { key: 'anytime', label: 'Anytime' },
];
export const PART_LABEL = Object.fromEntries(PARTS.map((p) => [p.key, p.label]));

// Weeks run Sunday to Saturday, like everywhere else in RADAR
export const DAY_CHIPS = [
  { value: 0, letter: 'S', short: 'Sun', name: 'Sunday' },
  { value: 1, letter: 'M', short: 'Mon', name: 'Monday' },
  { value: 2, letter: 'T', short: 'Tue', name: 'Tuesday' },
  { value: 3, letter: 'W', short: 'Wed', name: 'Wednesday' },
  { value: 4, letter: 'T', short: 'Thu', name: 'Thursday' },
  { value: 5, letter: 'F', short: 'Fri', name: 'Friday' },
  { value: 6, letter: 'S', short: 'Sat', name: 'Saturday' },
];
export const DAY_PRESETS = [
  { key: 'every', label: 'Every day', days: [0, 1, 2, 3, 4, 5, 6] },
  { key: 'weekdays', label: 'Weekdays', days: [1, 2, 3, 4, 5] },
  { key: 'weekends', label: 'Weekends', days: [0, 6] },
];

export const MODES = [
  { key: 'days', label: 'Certain days' },
  { key: 'interval', label: 'Every few days' },
  { key: 'weekly', label: 'Days a week' },
];

export function emptyForm(today) {
  return {
    title: '',
    note: '',
    part: 'anytime',
    scope: 'personal',
    startDate: today,
    hasEnd: false,
    endDate: '',
    mode: 'days',
    days: [0, 1, 2, 3, 4, 5, 6],
    intervalDays: 2,
    perWeek: 4,
  };
}

// The form for an existing tracker. A paused tracker has no schedule to show, so it gets the defaults (and the schedule fields are locked).
export function formFromTracker(t, today) {
  const form = emptyForm(today);
  form.title = t.title;
  form.note = t.note ?? '';
  form.part = t.part;
  form.scope = t.scope;
  form.startDate = t.startDate;
  form.hasEnd = Boolean(t.endDate);
  form.endDate = t.endDate ?? '';
  const s = t.schedule;
  if (s?.kind === 'interval') Object.assign(form, { mode: 'interval', intervalDays: s.intervalDays });
  else if (s?.kind === 'weekly') Object.assign(form, { mode: 'weekly', perWeek: s.perWeek });
  else if (s?.kind === 'days') Object.assign(form, { mode: 'days', days: [...s.days] });
  return form;
}

export function scheduleBody(form) {
  if (form.mode === 'interval') return { kind: 'interval', intervalDays: Number(form.intervalDays) };
  if (form.mode === 'weekly') return { kind: 'weekly', perWeek: Number(form.perWeek) };
  return { kind: 'days', days: [...form.days].sort((a, b) => a - b) };
}

// Did the person change how often it happens? (Only then is a new schedule saved.)
export function scheduleChanged(form, current) {
  if (!current || current.kind === 'paused') return false;
  const next = scheduleBody(form);
  if (next.kind !== current.kind) return true;
  if (next.kind === 'interval') return next.intervalDays !== current.intervalDays;
  if (next.kind === 'weekly') return next.perWeek !== current.perWeek;
  return next.days.join(',') !== [...current.days].sort((a, b) => a - b).join(',');
}

export function formProblem(form, { isNew, today }) {
  if (!form.title.trim()) return 'Give the tracker a name, like “Take vitamins”.';
  if (form.mode === 'days' && form.days.length === 0) return 'Pick at least one day.';
  if (isNew && form.startDate < today) return 'A tracker starts today or later.';
  if (form.hasEnd) {
    if (!form.endDate) return 'Choose an end date, or turn the end date off.';
    if (form.endDate < (isNew ? form.startDate : today)) return isNew ? 'The end date can’t be before the start date.' : 'The end date has to be today or later.';
  }
  return null;
}

export function toggleDay(days, value) {
  return days.includes(value) ? days.filter((d) => d !== value) : [...days, value].sort((a, b) => a - b);
}

export function samePreset(days, preset) {
  return days.length === preset.days.length && preset.days.every((d) => days.includes(d));
}

export function canEditDay(date, today) {
  const ago = daysBetween(date, today);
  return ago >= 0 && ago < BACKFILL_DAYS;
}

export function dayHeading(date, today) {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  if (date === addDays(today, 1)) return 'Tomorrow';
  return shortDate(date);
}

export function weekLabel(weekStart) {
  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.slice(0, 7) === end.slice(0, 7);
  return `${monthDay(weekStart)} – ${sameMonth ? Number(end.slice(8)) : monthDay(end)}`;
}

export function weekHeading(weekStart, currentWeek) {
  if (weekStart === currentWeek) return 'This week';
  if (weekStart === addDays(currentWeek, -7)) return 'Last week';
  if (weekStart === addDays(currentWeek, 7)) return 'Next week';
  return weekLabel(weekStart);
}

export function streakText(streak) {
  if (!streak || streak.current < 1) return null;
  const unit = streak.unit === 'weeks' ? 'week' : 'day';
  return `${streak.current}-${unit} streak`;
}

export function quotaText(q) {
  if (!q) return null;
  if (q.status === 'skipped') return 'Skipped this week';
  return `${q.done} of ${q.required} this week`;
}

export function daySummary(summary) {
  if (summary.total === 0 && summary.bonus === 0) return 'Nothing scheduled';
  if (summary.state === 'win') return summary.total ? 'Day won. Everything is done.' : 'Day won. Nice work.';
  if (summary.total === 0) return 'Nothing fixed for this day';
  return `${summary.done} of ${summary.total} done`;
}

export const WEEK_STATUS = {
  met: 'Week won',
  inProgress: 'On track',
  missed: 'A day was missed',
  skipped: 'Skipped',
  none: 'Nothing scheduled',
};

export const STATE_LABEL = {
  done: 'Done',
  skipped: 'Skipped',
  missed: 'Missed',
  open: 'To do',
  upcoming: 'Coming up',
  idle: 'Not yet',
  off: 'Not scheduled',
};

export const RANGES = [
  { key: '7', label: '7 days' },
  { key: '30', label: '30 days' },
  { key: '90', label: '90 days' },
  { key: 'all', label: 'All time' },
];

export const STATUS_LABEL = { active: 'Active', paused: 'Paused', upcoming: 'Starts soon', finished: 'Finished' };
