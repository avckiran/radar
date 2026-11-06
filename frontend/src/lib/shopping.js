import { monthDay } from './dates.js';
import { plural } from './text.js';

// Pure helpers for the Shopping Lists screens (no network, no React), so they can be tested on their own.
export const LIMITS = { title: 80, note: 500, item: 200 };

// Open items first, then checked ones; inside each group the order they were added in
export function sortItems(items) {
  return [...items].sort((a, b) => Number(a.checked) - Number(b.checked) || a.pos - b.pos);
}

function recount(list, items) {
  return { ...list, items, total: items.length, checked: items.filter((i) => i.checked).length };
}

// What the list looks like straight after ticking, before the server has answered
export function withChecked(list, itemId, checked) {
  return recount(list, sortItems(list.items.map((i) => (i.id === itemId ? { ...i, checked } : i))));
}

export function withText(list, itemId, text) {
  return { ...list, items: list.items.map((i) => (i.id === itemId ? { ...i, text } : i)) };
}

export function withoutItem(list, itemId) {
  return recount(list, list.items.filter((i) => i.id !== itemId));
}

export function withNewItem(list, { id, text, addedBy }) {
  const pos = list.items.reduce((max, i) => Math.max(max, i.pos), 0) + 1;
  return recount(list, sortItems([...list.items, { id, text, checked: false, pos, addedBy: addedBy ?? null, checkedBy: null }]));
}

export const openCount = (list) => list.total - list.checked;

export function progress(list) {
  const { total, checked } = list;
  if (total === 0) return { pct: 0, label: 'No items yet' };
  if (checked === total) return { pct: 100, label: 'All done' };
  return { pct: Math.round((checked / total) * 100), label: `${checked} of ${total} done` };
}

// "Nov 5", with the year only when it is not this year
function dateLabel(ymd, today) {
  const sameYear = !today || ymd.slice(0, 4) === today.slice(0, 4);
  return sameYear ? monthDay(ymd) : `${monthDay(ymd)}, ${ymd.slice(0, 4)}`;
}

export const createdLabel = (list, today) => `Created ${dateLabel(list.createdOn, today)}`;
export const archivedLabel = (list, today) => `Archived ${dateLabel(list.archivedOn, today)}`;

export function overviewSubtitle({ open, archived }) {
  if (open.length === 0 && archived.length === 0) return 'One list for each store or trip';
  const parts = [`${open.length} open`];
  if (archived.length) parts.push(`${archived.length} archived`);
  return parts.join(' · ');
}

export function itemsLeftText(list) {
  return `${plural(openCount(list), 'item')} left`;
}
