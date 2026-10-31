import { daysBetween, todayInZone } from '../dates.js';
import { domainOf } from '../capture.js';

export const AGED_INBOX_DAYS = 2;

export function capturedLabel(createdAt, today, timeZone) {
  const days = daysBetween(todayInZone(createdAt, timeZone), today);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export function buildInbox(rows, { now, timeZone }) {
  const today = todayInZone(now, timeZone);
  return {
    today,
    items: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      domain: row.url ? domainOf(row.url) : null,
      creator: row.creator ?? '',
      capturedLabel: capturedLabel(row.created_at, today, timeZone),
      aged: daysBetween(todayInZone(row.created_at, timeZone), today) >= AGED_INBOX_DAYS,
    })),
  };
}
