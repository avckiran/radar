import { daysBetween, endOfWeek, monthDay, todayInZone, weekdayShort } from '../dates.js';

const SOON_DAYS = 2;
const AGED_INBOX_DAYS = 2;

export function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function dueTag(dueDate, today) {
  const diff = daysBetween(today, dueDate);
  if (diff < 0) return { kind: 'overdue', label: `Overdue ${plural(-diff, 'day')}` };
  if (diff === 0) return { kind: 'soon', label: 'Due today' };
  if (diff === 1) return { kind: 'soon', label: 'Due tomorrow' };
  return { kind: diff <= SOON_DAYS ? 'soon' : 'later', label: `Due ${weekdayShort(dueDate)}` };
}

function followUpText(followUp, today) {
  const diff = daysBetween(today, followUp);
  if (diff < 0) return 'follow up due';
  if (diff === 0) return 'follow up today';
  return `follow up ${diff > 6 ? monthDay(followUp) : weekdayShort(followUp)}`;
}

export function waitingAgeDays(item, today, timeZone) {
  return daysBetween(todayInZone(item.waiting_since, timeZone), today);
}

export function waitingTag(item, today, timeZone) {
  const days = waitingAgeDays(item, today, timeZone);
  let label = days === 0 ? 'Waiting since today' : `Waiting ${plural(days, 'day')}`;
  if (item.follow_up_date) label += ` · ${followUpText(item.follow_up_date, today)}`;
  return { kind: 'waiting', label };
}

export function isReturnedSnooze(item, today) {
  return item.state === 'snoozed' && item.snoozed_until <= today;
}

// A returned snooze is treated as Active: that is what the lifecycle says happens on the snooze date.
export function effectiveState(item, today) {
  return isReturnedSnooze(item, today) ? 'active' : item.state;
}

function actionsFor(item, reason) {
  if (reason === 'inbox') return item.kind === 'action' ? ['done', 'sort'] : ['sort'];
  if (item.state === 'waiting') return ['done', 'back'];
  return ['done', 'snooze', 'waiting'];
}

function toRow(item, reason, tag, today) {
  return {
    id: item.id,
    kind: item.kind,
    state: item.state,
    title: item.title,
    segment: item.segment_id ? { id: item.segment_id, name: item.segment_name, color: item.segment_color } : null,
    creator: item.creator ?? '',
    dueDate: item.due_date ?? null,
    due: item.due_date ? dueTag(item.due_date, today) : null,
    reason,
    tag,
    actions: actionsFor(item, reason),
  };
}

export function needsAttention(items, { now, timeZone, nudgeDays }) {
  const today = todayInZone(now, timeZone);
  const weekEnd = endOfWeek(today);
  const dated = [];
  const undatedReturns = [];
  const nudges = [];
  const agedInbox = [];

  for (const item of items) {
    if (item.state === 'done') continue;

    if (item.state === 'inbox') {
      const age = daysBetween(todayInZone(item.created_at, timeZone), today);
      if (age >= AGED_INBOX_DAYS) agedInbox.push({ item, age });
      continue;
    }
    if (item.kind !== 'action') continue;

    if (isReturnedSnooze(item, today)) {
      const row = toRow(item, 'returned', { kind: 'snoozed', label: 'Back from snooze' }, today);
      (item.due_date ? dated : undatedReturns).push({ item, row });
      continue;
    }
    if ((item.state === 'active' || item.state === 'waiting') && item.due_date && item.due_date <= weekEnd) {
      const tag = item.state === 'waiting' ? waitingTag(item, today, timeZone) : dueTag(item.due_date, today);
      dated.push({ item, row: toRow(item, 'due', tag, today) });
      continue;
    }
    if (item.state === 'waiting') {
      const pastFollowUp = item.follow_up_date && item.follow_up_date <= today;
      const waitedTooLong = waitingAgeDays(item, today, timeZone) >= nudgeDays;
      if (pastFollowUp || waitedTooLong) nudges.push({ item, row: toRow(item, 'waiting', waitingTag(item, today, timeZone), today) });
    }
  }

  const byDue = (a, b) => a.item.due_date.localeCompare(b.item.due_date) || a.item.title.localeCompare(b.item.title);
  const byDate = (key) => (a, b) => a.item[key] - b.item[key] || a.item.title.localeCompare(b.item.title);

  return [
    ...dated.sort(byDue),
    ...undatedReturns.sort((a, b) => a.item.snoozed_until.localeCompare(b.item.snoozed_until)),
    ...nudges.sort(byDate('waiting_since')),
    ...agedInbox
      .sort((a, b) => a.item.created_at - b.item.created_at)
      .map(({ item, age }) => ({ item, row: toRow(item, 'inbox', { kind: 'inbox', label: `Unsorted ${plural(age, 'day')}` }, today) })),
  ].map((entry) => entry.row);
}
