import { monthDay, weekdayShort } from './dates.js';

const stampFormats = new Map();

function stampFormat(timeZone) {
  if (!stampFormats.has(timeZone)) {
    stampFormats.set(
      timeZone,
      new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    );
  }
  return stampFormats.get(timeZone);
}

export function formatStamp(date, timeZone) {
  const p = Object.fromEntries(stampFormat(timeZone).formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.month} ${p.day} · ${p.hour}:${p.minute} ${p.dayPeriod}`;
}

export function dayWithDate(ymd) {
  return `${weekdayShort(ymd)} ${monthDay(ymd)}`;
}

function sortedText(e, item, segmentName) {
  const name = e.data?.segmentName ?? segmentName ?? 'a segment';
  return item.kind === 'action' ? `Moved to Active in ${name}` : `Filed in ${name}`;
}

export function describeEvent(e, { item, segmentName }) {
  const data = e.data ?? {};
  switch (e.type) {
    case 'created':
      if (e.to_state === 'inbox') return { text: 'Captured to Inbox' };
      return { text: data.segmentName ? `Added to ${data.segmentName}` : 'Added' };
    case 'completed':
      return { text: 'Marked done', detail: e.note || null };
    case 'follow_up':
      return { text: e.note || 'Follow-up logged' };
    case 'edited':
      return { text: e.note || 'Edited' };
    case 'deleted':
      return { text: 'Deleted' };
    case 'restored':
      return { text: 'Restored' };
    case 'state_change': {
      if (e.to_state === 'waiting') return { text: e.note || 'Marked Waiting' };
      if (e.to_state === 'snoozed') return { text: data.until ? `Snoozed until ${dayWithDate(data.until)}` : 'Snoozed' };
      if (e.from_state === 'inbox') return { text: sortedText(e, item, segmentName) };
      if (e.from_state === 'done') return { text: e.to_state === 'inbox' ? 'Reopened to Inbox' : 'Reopened' };
      if (e.to_state === 'active') return { text: 'Back to Active' };
      return { text: e.note || 'Changed' };
    }
    default:
      return { text: e.note || e.type };
  }
}
