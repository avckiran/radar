import { daysBetween, monthDay, todayInZone, weekdayShort } from '../dates.js';
import { domainOf } from '../capture.js';
import { dueTag, effectiveState, isReturnedSnooze, waitingTag } from './needsAttention.js';
import { segmentCards } from './home.js';

export const DONE_PAGE = 25;
const EXCERPT = 110;

function dayHint(ymd, today) {
  return daysBetween(today, ymd) > 6 ? monthDay(ymd) : weekdayShort(ymd);
}

function actionRow(item, today, timeZone) {
  let tag;
  if (item.state === 'snoozed' && !isReturnedSnooze(item, today)) {
    tag = { kind: 'snoozed', label: `Snoozed until ${dayHint(item.snoozed_until, today)}` };
  } else if (isReturnedSnooze(item, today)) {
    tag = { kind: 'snoozed', label: 'Back from snooze' };
  } else if (item.state === 'waiting') {
    tag = waitingTag(item, today, timeZone);
  } else if (item.due_date) {
    tag = dueTag(item.due_date, today);
  } else {
    tag = { kind: 'none', label: 'No date' };
  }
  return {
    id: item.id,
    state: effectiveState(item, today),
    title: item.title,
    dueDate: item.due_date ?? null,
    creator: item.creator ?? '',
    tag,
  };
}

function excerpt(body) {
  const text = (body ?? '').replace(/\s+/g, ' ').trim();
  return text.length > EXCERPT ? `${text.slice(0, EXCERPT - 1).trimEnd()}…` : text;
}

export function doneRows(rows, timeZone) {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    by: row.completed_by ?? row.creator ?? '',
    dayLabel: weekdayShort(todayInZone(row.completed_at, timeZone)),
  }));
}

export function buildSegmentView({ segment, items, doneCount, doneItems, now, timeZone }) {
  const today = todayInZone(now, timeZone);
  const actions = items.filter((i) => i.kind === 'action');
  const byTitle = (a, b) => a.title.localeCompare(b.title);

  const active = actions
    .filter((i) => effectiveState(i, today) === 'active')
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || byTitle(a, b));
  const waiting = actions.filter((i) => i.state === 'waiting').sort((a, b) => a.waiting_since - b.waiting_since || byTitle(a, b));
  const snoozed = actions
    .filter((i) => i.state === 'snoozed' && !isReturnedSnooze(i, today))
    .sort((a, b) => a.snoozed_until.localeCompare(b.snoozed_until) || byTitle(a, b));
  const newest = (a, b) => b.updated_at - a.updated_at || byTitle(a, b);

  const stats = segmentCards([segment], items, today)[0];
  return {
    today,
    segment: { id: segment.id, name: segment.name, color: segment.color },
    stats: { active: stats.activeCount, waiting: stats.waitingCount, nextDue: stats.nextDue },
    active: active.map((i) => actionRow(i, today, timeZone)),
    waiting: waiting.map((i) => actionRow(i, today, timeZone)),
    snoozed: snoozed.map((i) => actionRow(i, today, timeZone)),
    notes: items
      .filter((i) => i.kind === 'note')
      .sort(newest)
      .map((i) => ({ id: i.id, title: i.title, excerpt: excerpt(i.body) })),
    links: items
      .filter((i) => i.kind === 'link')
      .sort(newest)
      .map((i) => ({ id: i.id, title: i.title, url: i.url, domain: i.url ? domainOf(i.url) : '' })),
    done: { count: doneCount, items: doneRows(doneItems, timeZone) },
  };
}
