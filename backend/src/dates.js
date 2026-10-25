const partsFormat = new Map();

function formatterFor(timeZone) {
  if (!partsFormat.has(timeZone)) {
    partsFormat.set(
      timeZone,
      new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    );
  }
  return partsFormat.get(timeZone);
}

export function todayInZone(now, timeZone) {
  const p = Object.fromEntries(formatterFor(timeZone).formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

function toUtcDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(ymd, n) {
  const d = toUtcDate(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekdayOf(ymd) {
  return toUtcDate(ymd).getUTCDay();
}

export function nextWeekday(ymd, weekday) {
  return addDays(ymd, (weekday - weekdayOf(ymd) + 7) % 7);
}

export function endOfWeek(ymd) {
  return addDays(ymd, 6 - weekdayOf(ymd));
}
