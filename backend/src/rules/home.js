import { addDays, daysBetween, endOfWeek, monthDay, todayInZone, weekdayShort } from '../dates.js';
import { effectiveState } from './needsAttention.js';
import { attentionSections, followUpRows, notesPreview } from './homeBoxes.js';

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

const SHOPPING_SHOWN = 4;

// Home: the four date sections, open follow-ups, and small previews of Shopping Lists and Notes
export function buildHome({ openItems, shoppingOpen = [], now, timeZone }) {
  const today = todayInZone(now, timeZone);
  const attention = attentionSections(openItems, { now, timeZone });
  return {
    today,
    weekEnd: endOfWeek(today),
    attention,
    attentionCount: Object.values(attention).reduce((n, rows) => n + rows.length, 0),
    followUps: followUpRows(openItems, { now, timeZone }),
    inboxCount: openItems.filter((i) => i.state === 'inbox').length,
    notes: notesPreview(openItems),
    shopping: {
      count: shoppingOpen.length,
      lists: shoppingOpen.slice(0, SHOPPING_SHOWN).map((l) => ({ id: l.id, title: l.title, total: l.total, checked: l.checked })),
    },
  };
}
