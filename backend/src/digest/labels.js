// Small wording helpers for the emails (the app has its own copies in frontend/src/lib/zones.js)
const SHORT_ZONES = {
  'America/New_York': 'Eastern',
  'America/Detroit': 'Eastern',
  'America/Toronto': 'Eastern',
  'America/Chicago': 'Central',
  'America/Winnipeg': 'Central',
  'America/Denver': 'Mountain',
  'America/Phoenix': 'Arizona',
  'America/Los_Angeles': 'Pacific',
  'America/Vancouver': 'Pacific',
  'America/Anchorage': 'Alaska',
  'Pacific/Honolulu': 'Hawaii',
  'America/Halifax': 'Atlantic',
  'Europe/London': 'London',
  'Asia/Kolkata': 'India',
  UTC: 'UTC',
};

export function zoneLabel(zone) {
  return SHORT_ZONES[zone] ?? String(zone || '').split('/').pop().replace(/_/g, ' ');
}

export function timeLabel(hhmm) {
  const [h, m] = String(hhmm || '08:00').split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function sendLabel(hhmm, zone) {
  return `${timeLabel(hhmm)} ${zoneLabel(zone)}`;
}

export function firstName(displayName) {
  return String(displayName || '').trim().split(/\s+/)[0] || 'there';
}

export function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// "Tuesday, October 20" for the zone the household lives in
export function dateLabel(now, timeZone) {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'long', day: 'numeric' }).format(now);
}

export function greetingFor(now, timeZone) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(now));
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// Tight spots (the next-week list) use the short form
export function shortSegment(name) {
  return name === 'General / Administrative' ? 'General / Admin.' : name;
}

export function joinUrl(base, pathAndQuery = '') {
  const root = String(base || '').replace(/\/+$/, '');
  return `${root}${pathAndQuery}`;
}
