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

export function daysBetween(fromYmd, toYmd) {
  return Math.round((toUtcDate(toYmd) - toUtcDate(fromYmd)) / 86400000);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function weekdayShort(ymd) {
  return WEEKDAYS[weekdayOf(ymd)];
}

export function monthDay(ymd) {
  const [, m, d] = ymd.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

export function isValidYmd(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && addDays(value, 0) === value;
}
