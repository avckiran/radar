// Takes a task out of every list on Home at once (the four Needs attention
// sections and the Follow-up items), so Done and Snooze feel instant.
export function removeAttentionRow(home, id) {
  if (!home) return home;
  const keep = (rows) => rows.filter((row) => row.id !== id);
  const attention = Object.fromEntries(Object.entries(home.attention).map(([key, rows]) => [key, keep(rows)]));
  const attentionCount = Object.values(attention).reduce((n, rows) => n + rows.length, 0);
  return { ...home, attention, attentionCount, followUps: keep(home.followUps) };
}

// The four sections in the order they are shown
export const ATTENTION_SECTIONS = [
  { key: 'overdue', title: 'Overdue' },
  { key: 'today', title: 'Today' },
  { key: 'tomorrow', title: 'Tomorrow' },
  { key: 'restOfWeek', title: 'Rest of the week' },
];

// Which columns of Home to draw for a given container width
export function columnCount(width, fallbackWide) {
  if (width <= 0) return fallbackWide ? 3 : 1;
  if (width >= 1040) return 3;
  if (width >= 700) return 2;
  return 1;
}
