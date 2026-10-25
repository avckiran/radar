import { daysBetween, monthDay, todayInZone } from '../dates.js';
import { describeEvent, dayWithDate, formatStamp } from '../history.js';
import { domainOf } from '../capture.js';
import { dueTag, effectiveState, isReturnedSnooze, plural, waitingAgeDays, waitingTag } from './needsAttention.js';

export function tagFor(item, today, timeZone) {
  if (item.kind !== 'action') return null;
  if (item.state === 'done') return { kind: 'later', label: 'Done' };
  if (item.state === 'inbox') {
    const age = daysBetween(todayInZone(item.created_at, timeZone), today);
    return { kind: 'inbox', label: age >= 1 ? `Unsorted ${plural(age, 'day')}` : 'In Inbox' };
  }
  if (isReturnedSnooze(item, today)) return { kind: 'snoozed', label: 'Back from snooze' };
  if (item.state === 'snoozed') return { kind: 'snoozed', label: `Snoozed until ${dayWithDate(item.snoozed_until)}` };
  if (item.state === 'waiting') return waitingTag(item, today, timeZone);
  if (item.due_date) return dueTag(item.due_date, today);
  return null;
}

export function actionsFor(item, today) {
  if (item.kind !== 'action') return [];
  const state = effectiveState(item, today);
  if (state === 'done') return ['reopen'];
  if (state === 'inbox') return ['done'];
  if (state === 'waiting' || state === 'snoozed') return ['done', 'back'];
  return ['done', 'snooze', 'waiting'];
}

export function buildDetail({ item, events, now, timeZone }) {
  const today = todayInZone(now, timeZone);
  const segmentName = item.segment_name ?? null;
  const entries = events.map((e) => {
    const { text, detail } = describeEvent(e, { item, segmentName });
    return {
      id: e.id,
      type: e.type,
      at: e.created_at,
      stamp: formatStamp(e.created_at, timeZone),
      by: e.actor ?? '',
      text,
      detail: detail ?? null,
      kind: e.data?.kind ?? null,
    };
  });
  const history = [...entries].reverse();

  let waiting = null;
  let followUps = [];
  if (item.state === 'waiting') {
    const age = waitingAgeDays(item, today, timeZone);
    waiting = {
      on: item.waiting_on ?? null,
      since: `${monthDay(todayInZone(item.waiting_since, timeZone))} · ${plural(age, 'day')}`,
      followUp: item.follow_up_date ? dayWithDate(item.follow_up_date) : null,
      followUpDate: item.follow_up_date ?? null,
    };
    let startIndex = -1;
    events.forEach((e, i) => {
      if (e.type === 'state_change' && e.to_state === 'waiting') startIndex = i;
    });
    followUps = entries
      .slice(Math.max(0, startIndex))
      .filter((e, i) => (startIndex >= 0 && i === 0) || e.type === 'follow_up')
      .reverse();
  }

  return {
    today,
    item: {
      id: item.id,
      kind: item.kind,
      state: effectiveState(item, today),
      title: item.title,
      body: item.body ?? '',
      url: item.url ?? null,
      domain: item.url ? domainOf(item.url) : null,
      description: item.description ?? '',
      dueDate: item.due_date ?? null,
      snoozedUntil: item.snoozed_until ?? null,
      createdLabel: monthDay(todayInZone(item.created_at, timeZone)),
      creator: item.creator ?? '',
      segment: item.segment_id ? { id: item.segment_id, name: item.segment_name, color: item.segment_color } : null,
      tag: tagFor(item, today, timeZone),
    },
    actions: actionsFor(item, today),
    waiting,
    followUps,
    history,
  };
}
