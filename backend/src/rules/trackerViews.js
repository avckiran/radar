import { addDays, weekdayOf } from '../dates.js';
import {
  PARTS,
  completionOf,
  currentSchedule,
  dayOutcome,
  dayStreak,
  earliestStart,
  nextMilestone,
  occurrences,
  quotaWeek,
  scheduleOn,
  scheduleText,
  startOfWeek,
  streakOf,
  trackerWeek,
  weekOutcome,
  weekStreak,
  dayState,
} from './trackers.js';


export function prepare(list, today) {
  return list.map((e) => ({ ...e, events: occurrences(e.t, e.schedules, e.byDate, today) }));
}

export function trackerStatus(e, today) {
  if (e.t.startDate > today) return 'upcoming';
  if (e.t.endDate && e.t.endDate < today) return 'finished';
  return currentSchedule(e.schedules, today)?.kind === 'paused' ? 'paused' : 'active';
}

function unitOf(e, today) {
  const s = currentSchedule(e.schedules.filter((x) => x.kind !== 'paused'), today);
  return s?.kind === 'weekly' ? 'weeks' : 'days';
}

export function scheduleShape(s) {
  if (!s) return null;
  return { kind: s.kind, days: s.days ?? null, intervalDays: s.intervalDays ?? null, anchorDate: s.anchorDate ?? null, perWeek: s.perWeek ?? null };
}

function who(c) {
  return c?.userName ?? null;
}

function rowFor(e, date, today) {
  const { t, schedules, byDate } = e;
  const c = byDate.get(date);
  const ds = dayState(t, schedules, date, c, today);
  if (!ds.slot) return null;
  const quota = ds.slot === 'flex' ? quotaWeek(t, schedules, startOfWeek(date), byDate, today) : null;
  return {
    id: t.id,
    title: t.title,
    note: t.note,
    scope: t.scope,
    part: t.part,
    kind: ds.slot === 'flex' ? 'quota' : 'fixed',
    state: ds.state,
    checkedBy: c ? who(c) : null,
    skipNote: c?.status === 'skipped' ? c.note ?? null : null,
    quota: quota ? { done: quota.done, required: quota.required, perWeek: quota.perWeek, daysLeft: quota.daysLeft, status: quota.status, atRisk: quota.atRisk } : null,
    scheduleText: scheduleText(scheduleOn(schedules, date)),
    streak: { current: streakOf(e.events).current, unit: unitOf(e, today) },
  };
}

export function buildDayView(list, date, today) {
  const rows = list.map((e) => rowFor(e, date, today)).filter(Boolean);
  const groups = PARTS.map((part) => ({ part, rows: rows.filter((r) => r.part === part) })).filter((g) => g.rows.length);
  const outcome = dayOutcome(list, date, today);
  const week = weekOutcome(list, startOfWeek(date), today);
  return {
    date,
    today,
    isToday: date === today,
    summary: { state: outcome.state, done: outcome.done, total: outcome.due, skipped: outcome.skipped, bonus: outcome.bonus },
    week: { weekStart: week.weekStart, status: week.status },
    dayStreak: dayStreak(list, today),
    groups,
  };
}

export function buildWeekView(list, weekStart, today) {
  const rows = list
    .map((e) => {
      const w = trackerWeek(e.t, e.schedules, weekStart, e.byDate, today);
      if (w.status === 'none') return null;
      return {
        id: e.t.id,
        title: e.t.title,
        part: e.t.part,
        scope: e.t.scope,
        scheduleText: scheduleText(currentSchedule(e.schedules, today)),
        days: w.days.map((d) => ({ date: d.date, state: d.state })),
        status: w.status,
        quota: w.quota ? { done: w.quota.done, required: w.quota.required, perWeek: w.quota.perWeek, daysLeft: w.quota.daysLeft, status: w.quota.status, atRisk: w.quota.atRisk } : null,
      };
    })
    .filter(Boolean);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const o = dayOutcome(list, date, today);
    days.push({ date, state: o.state, done: o.done, total: o.due });
  }
  const week = weekOutcome(list, weekStart, today);
  return {
    weekStart,
    weekEnd: addDays(weekStart, 6),
    currentWeek: startOfWeek(today),
    today,
    status: week.status,
    days,
    rows,
  };
}

export function buildTrackerList(list, today) {
  const rows = list.map((e) => {
    const cur = currentSchedule(e.schedules, today);
    const streak = streakOf(e.events);
    return {
      id: e.t.id,
      title: e.t.title,
      note: e.t.note,
      scope: e.t.scope,
      owner: e.t.ownerName,
      mine: Boolean(e.t.mine),
      part: e.t.part,
      startDate: e.t.startDate,
      endDate: e.t.endDate,
      status: trackerStatus(e, today),
      schedule: scheduleShape(cur),
      scheduleText: scheduleText(cur),
      streak: { current: streak.current, best: streak.best, unit: unitOf(e, today) },
    };
  });
  const order = { active: 0, upcoming: 1, paused: 2, finished: 3 };
  return { today, trackers: rows.sort((a, b) => order[a.status] - order[b.status]) };
}

function pooled(list) {
  return list.flatMap((e) => e.events.map((ev) => ({ ...ev, part: e.t.part })));
}

export const RANGES = { 7: 7, 30: 30, 90: 90 };

export function buildProgress(list, { today, range = '30', trackerId = null }) {
  const chosen = trackerId ? list.filter((e) => e.t.id === trackerId) : list;
  const earliest = earliestStart(chosen);
  const rangeDays = RANGES[range];
  let from = rangeDays ? addDays(today, -(rangeDays - 1)) : earliest ?? today;
  if (earliest && from < earliest) from = earliest;

  const events = pooled(chosen);
  const completion = completionOf(events, from, today);
  const days = dayStreak(chosen, today);
  const weeks = weekStreak(chosen, today);

  let wins = 0;
  let misses = 0;
  for (let date = from; date <= today; date = addDays(date, 1)) {
    const { state } = dayOutcome(chosen, date, today);
    if (state === 'win') wins += 1;
    else if (state === 'miss') misses += 1;
  }

  const thisWeek = startOfWeek(today);
  const heatStart = addDays(thisWeek, -7 * 11);
  const heatmap = [];
  for (let w = 0; w < 12; w++) {
    const weekStart = addDays(heatStart, w * 7);
    const row = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(weekStart, i);
      const o = dayOutcome(chosen, date, today);
      row.push({ date, state: o.state, done: o.done + o.bonus, total: o.due });
    }
    heatmap.push({ weekStart, days: row });
  }

  const cards = chosen.map((e) => {
    const streak = streakOf(e.events);
    const c = completionOf(e.events, from, today);
    const trend = [];
    for (let k = 7; k >= 0; k--) {
      const ws = addDays(thisWeek, -7 * k);
      trend.push({ weekStart: ws, pct: completionOf(e.events, ws, addDays(ws, 6)).pct });
    }
    return {
      id: e.t.id,
      title: e.t.title,
      part: e.t.part,
      scope: e.t.scope,
      status: trackerStatus(e, today),
      scheduleText: scheduleText(currentSchedule(e.schedules, today)),
      streak: { current: streak.current, best: streak.best, unit: unitOf(e, today) },
      completion: c.pct,
      done: c.done,
      missed: c.missed,
      skipped: c.skipped,
      trend,
    };
  });

  return {
    today,
    range,
    from,
    trackerId,
    hasTrackers: chosen.length > 0,
    summary: {
      dayStreak: days.current,
      bestDayStreak: days.best,
      weekStreak: weeks.current,
      bestWeekStreak: weeks.best,
      completion: completion.pct,
      done: completion.done,
      missed: completion.missed,
      skipped: completion.skipped,
      winDays: wins,
      missDays: misses,
      nextMilestone: nextMilestone(days.current),
    },
    heatmap,
    cards,
    insights: insightsOf(events, today),
  };
}

const WEEKDAY_NAMES = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const PART_NAMES = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', anytime: 'Anytime' };

export function insightsOf(events, today) {
  const from = addDays(today, -89);
  const missed = events.filter((e) => e.kind === 'day' && e.result === 'missed' && e.date >= from);
  if (missed.length < 3) return [];
  const out = [];
  const byWeekday = new Array(7).fill(0);
  const byPart = {};
  for (const e of missed) {
    byWeekday[weekdayOf(e.date)] += 1;
    byPart[e.part] = (byPart[e.part] ?? 0) + 1;
  }
  const topDay = byWeekday.indexOf(Math.max(...byWeekday));
  if (byWeekday[topDay] >= 3 && byWeekday[topDay] / missed.length >= 0.4) out.push(`Most often missed: ${WEEKDAY_NAMES[topDay]}.`);
  const topPart = Object.keys(byPart).sort((a, b) => byPart[b] - byPart[a])[0];
  if (byPart[topPart] >= 3 && byPart[topPart] / missed.length >= 0.5 && topPart !== 'anytime') out.push(`${PART_NAMES[topPart]} trackers slip the most.`);
  return out;
}

export function buildHomeTrackers(list, today) {
  const day = buildDayView(list, today, today);
  const rows = day.groups.flatMap((g) => g.rows);
  const rank = { open: 0, idle: 1, done: 2, skipped: 3 };
  const shown = [...rows].sort((a, b) => (rank[a.state] ?? 4) - (rank[b.state] ?? 4));
  return {
    count: rows.length,
    summary: day.summary,
    dayStreak: day.dayStreak.current,
    rows: shown.slice(0, 8).map((r) => ({ id: r.id, title: r.title, part: r.part, kind: r.kind, state: r.state, quota: r.quota })),
    more: Math.max(0, shown.length - 8),
  };
}

