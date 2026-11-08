import { addDays, daysBetween, endOfWeek, monthDay, todayInZone, weekdayShort } from '../dates.js';
import { isReturnedSnooze, plural, waitingAgeDays } from './needsAttention.js';

// The boxes on the Home screen. The email keeps using needsAttention.js; these rules are for Home only.
const NOTES_SHOWN = 5;
const NOTE_EXCERPT = 110;

function segmentOf(item) {
  return item.segment_id ? { id: item.segment_id, name: item.segment_name, color: item.segment_color } : null;
}

function byDueThenTitle(a, b) {
  return (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31') || a.title.localeCompare(b.title);
}

function attentionRow(item, label, tone) {
  return {
    id: item.id,
    kind: 'action',
    title: item.title,
    segment: segmentOf(item),
    creator: item.creator ?? '',
    dueDate: item.due_date ?? null,
    label,
    tone,
    actions: ['done', 'snooze'],
  };
}

// Overdue, Today, Tomorrow and Rest of the week (the day after tomorrow through Saturday).
// Only tasks you can act on: active tasks and snoozed tasks that have come back. Follow-ups and the Inbox are shown elsewhere.
export function attentionSections(items, { now, timeZone }) {
  const today = todayInZone(now, timeZone);
  const tomorrow = addDays(today, 1);
  const weekEnd = endOfWeek(today);
  const sections = { overdue: [], today: [], tomorrow: [], restOfWeek: [] };

  for (const item of items) {
    if (item.kind !== 'action') continue;
    const returned = isReturnedSnooze(item, today);
    if (item.state !== 'active' && !returned) continue;
    const due = item.due_date ?? null;

    if (due && due < today) {
      sections.overdue.push(attentionRow(item, `${plural(daysBetween(due, today), 'day')} late`, 'late'));
    } else if (due === today) {
      sections.today.push(attentionRow(item, returned ? 'Back from snooze' : null, 'soon'));
    } else if (due === tomorrow) {
      sections.tomorrow.push(attentionRow(item, null, 'plain'));
    } else if (due && due > tomorrow && due <= weekEnd) {
      sections.restOfWeek.push(attentionRow(item, weekdayShort(due), 'plain'));
    } else if (returned) {
      // came back from snooze with no date this week: it is yours today
      sections.today.push(attentionRow(item, 'Back from snooze', 'soon'));
    }
  }

  for (const key of Object.keys(sections)) sections[key].sort(byDueThenTitle);
  return sections;
}

function checkBack(date, today) {
  const diff = daysBetween(today, date);
  if (diff < 0) return { text: 'check back now', tone: 'late' };
  if (diff === 0) return { text: 'check back today', tone: 'soon' };
  return { text: `check back ${diff > 6 ? monthDay(date) : weekdayShort(date)}`, tone: 'plain' };
}

// Every open follow-up: the ones whose check-back date has come first, then the longest open
export function followUpRows(items, { now, timeZone }) {
  const today = todayInZone(now, timeZone);
  const rank = { late: 0, soon: 1, plain: 2 };
  return items
    .filter((i) => i.kind === 'action' && i.state === 'waiting')
    .map((i) => {
      const days = waitingAgeDays(i, today, timeZone);
      const back = i.follow_up_date ? checkBack(i.follow_up_date, today) : null;
      return {
        id: i.id,
        kind: 'action',
        title: i.title,
        segment: segmentOf(i),
        creator: i.creator ?? '',
        label: days === 0 ? 'New today' : `${plural(days, 'day')} open`,
        tone: back?.tone ?? 'plain',
        sub: [i.waiting_on && `with ${i.waiting_on}`, back?.text].filter(Boolean).join(' · ') || null,
        actions: ['done'],
        waitingSince: i.waiting_since,
      };
    })
    .sort((a, b) => rank[a.tone] - rank[b.tone] || a.waitingSince - b.waitingSince || a.title.localeCompare(b.title))
    .map(({ waitingSince, ...row }) => row);
}

function excerpt(body, title) {
  let text = (body ?? '').replace(/\s+/g, ' ').trim();
  if (text.startsWith(title)) text = text.slice(title.length).trim(); // a note titled from its first line would repeat it
  return text.length > NOTE_EXCERPT ? `${text.slice(0, NOTE_EXCERPT - 1).trimEnd()}…` : text;
}

// The newest notes from every segment (and unsorted ones)
export function notesPreview(items) {
  const notes = items.filter((i) => i.kind === 'note').sort((a, b) => b.created_at - a.created_at || a.title.localeCompare(b.title));
  return {
    count: notes.length,
    items: notes.slice(0, NOTES_SHOWN).map((i) => ({ id: i.id, title: i.title, excerpt: excerpt(i.body, i.title), segment: segmentOf(i) })),
  };
}
