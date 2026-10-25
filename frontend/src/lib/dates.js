const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parts(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return { y, m, d };
}

function toUtc(ymd) {
  const { y, m, d } = parts(ymd);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(ymd, n) {
  const date = toUtc(ymd);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

export function weekdayOf(ymd) {
  return toUtc(ymd).getUTCDay();
}

export function endOfWeek(ymd) {
  return addDays(ymd, 6 - weekdayOf(ymd));
}

export function daysBetween(fromYmd, toYmd) {
  return Math.round((toUtc(toYmd) - toUtc(fromYmd)) / 86400000);
}

export const weekdayShort = (ymd) => WEEKDAYS[weekdayOf(ymd)];
export const weekdayLong = (ymd) => WEEKDAYS_LONG[weekdayOf(ymd)];

export function monthDay(ymd) {
  const { m, d } = parts(ymd);
  return `${MONTHS[m - 1]} ${d}`;
}

export function shortDate(ymd) {
  return `${weekdayShort(ymd)}, ${monthDay(ymd)}`;
}

export function longDate(ymd) {
  const { m, d } = parts(ymd);
  return `${weekdayLong(ymd)}, ${MONTHS_LONG[m - 1]} ${d}`;
}

export function dayHint(ymd, today) {
  return daysBetween(today, ymd) > 6 ? shortDate(ymd) : weekdayShort(ymd);
}

export function snoozeOptions(today) {
  return [
    { key: 'tomorrow', label: 'Tomorrow', date: addDays(today, 1) },
    { key: 'two-days', label: 'In 2 days', date: addDays(today, 2) },
    { key: 'next-week', label: 'Next week', date: addDays(endOfWeek(today), 2) },
  ];
}

export function followUpOptions(today) {
  return [
    { key: 'three-days', label: 'In 3 days', date: addDays(today, 3) },
    { key: 'one-week', label: 'In a week', date: addDays(today, 7) },
  ];
}
