// Friendly names for time zones and send times

const SHORT = {
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

const COMMON = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'Europe/London',
  'Asia/Kolkata',
  'UTC',
];

export function zoneLabel(zone) {
  if (SHORT[zone]) return SHORT[zone];
  const city = String(zone || '').split('/').pop() || '';
  return city.replace(/_/g, ' ');
}

export function zoneOptions(current) {
  const all = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  const rest = all.filter((z) => !COMMON.includes(z));
  const common = [...COMMON];
  if (current && !common.includes(current) && !rest.includes(current)) common.push(current);
  return {
    common: common.map((value) => ({ value, label: SHORT[value] ? `${SHORT[value]} (${value.split('/').pop().replace(/_/g, ' ')})` : zoneLabel(value) })),
    rest: rest.map((value) => ({ value, label: value.replace(/_/g, ' ') })),
  };
}

export function timeLabel(hhmm) {
  const [h, m] = String(hhmm || '08:00').split(':').map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function digestLabel(hhmm, zone) {
  return `${timeLabel(hhmm)} ${zoneLabel(zone)}`;
}

// Send times offered in the picker: every 30 minutes from 5:00 AM to 11:30 PM
export const SEND_TIMES = (() => {
  const out = [];
  for (let minutes = 5 * 60; minutes < 24 * 60; minutes += 30) {
    const value = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    out.push({ value, label: timeLabel(value) });
  }
  return out;
})();
