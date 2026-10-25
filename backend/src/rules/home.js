import { addDays, daysBetween, endOfWeek, monthDay, todayInZone, weekdayShort } from '../dates.js';
import { effectiveState, needsAttention } from './needsAttention.js';

function nextDueLabel(dueDate, today) {
  const diff = daysBetween(today, dueDate);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  return diff <= 6 ? weekdayShort(dueDate) : monthDay(dueDate);
}

function segmentRef(item) {
  return item.segment_id ? { id: item.segment_id, name: item.segment_name, color: item.segment_color } : null;
}

export function segmentCards(segments, items, today) {
  return segments.map((segment) => {
    const mine = items.filter((i) => i.segment_id === segment.id && i.kind === 'action');
    const active = mine.filter((i) => effectiveState(i, today) === 'active');
    const waiting = mine.filter((i) => i.state === 'waiting');
    const nextDue = active
      .filter((i) => i.due_date)
      .map((i) => i.due_date)
      .sort()[0];
    return {
      id: segment.id,
      name: segment.name,
      color: segment.color,
      activeCount: active.length,
      waitingCount: waiting.length,
      nextDue: nextDue ? nextDueLabel(nextDue, today) : null,
    };
  });
}

export function nextUp(items, today) {
  const weekEnd = endOfWeek(today);
  const nextWeekEnd = addDays(weekEnd, 7);
  return items
    .filter((i) => i.kind === 'action' && ['active', 'waiting'].includes(i.state) && i.due_date > weekEnd && i.due_date <= nextWeekEnd)
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.title.localeCompare(b.title))
    .map((i) => ({ id: i.id, title: i.title, dueDate: i.due_date, dayLabel: weekdayShort(i.due_date), segment: segmentRef(i) }));
}

export function recentlyCompleted(done, timeZone) {
  return done.map((i) => ({
    id: i.id,
    title: i.title,
    by: i.completed_by ?? i.creator ?? '',
    dayLabel: weekdayShort(todayInZone(i.completed_at, timeZone)),
  }));
}

export function buildHome({ openItems, doneItems, segments, now, timeZone, nudgeDays }) {
  const today = todayInZone(now, timeZone);
  const attention = needsAttention(openItems, { now, timeZone, nudgeDays });
  return {
    today,
    weekEnd: endOfWeek(today),
    needsAttention: attention,
    nextUp: nextUp(openItems, today),
    segments: segmentCards(segments, openItems, today),
    inboxCount: openItems.filter((i) => i.state === 'inbox').length,
    recentlyCompleted: recentlyCompleted(doneItems, timeZone),
  };
}
