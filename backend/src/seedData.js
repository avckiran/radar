import crypto from 'node:crypto';
import { addDays, endOfWeek, nextWeekday, todayInZone, weekdayOf } from './dates.js';

export function seedId(key) {
  const h = crypto.createHash('sha1').update(`radar-seed:${key}`).digest('hex');

  const variant = ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

export const SEGMENTS = [
  { key: 'finances', name: 'Finances', color: 'emerald' },
  { key: 'health', name: 'Health', color: 'rose' },
  { key: 'career', name: 'Career', color: 'blue' },
  { key: 'future', name: 'Future Plans', color: 'violet' },
  { key: 'general', name: 'General / Administrative', color: 'slate', protected: true },
];

export function buildSeed({ now = new Date(), timeZone = 'America/New_York' } = {}) {
  const today = todayInZone(now, timeZone);
  const wd = weekdayOf(today);
  const ago = (days, hours = 0) => new Date(now.getTime() - days * DAY - hours * HOUR);
  const thursday = nextWeekday(today, 4);
  const friday = nextWeekday(today, 5);
  const nextSunday = addDays(today, wd === 0 ? 7 : 7 - wd);
  const nextWeek = (offsetFromSunday) => addDays(nextSunday, offsetFromSunday);

  const household = { id: seedId('household'), name: 'Our household', time_zone: timeZone, nudge_days: 5 };

  const users = [
    { key: 'chandra', username: 'chandra', display_name: 'Chandra', is_owner: true },
    { key: 'komal', username: 'komal', display_name: 'Komal', is_owner: true },
  ].map((u) => ({ ...u, id: seedId(`user:${u.key}`), household_id: household.id }));
  const userId = (key) => users.find((u) => u.key === key).id;

  const segments = SEGMENTS.map((s, i) => ({
    id: seedId(`segment:${s.key}`),
    household_id: household.id,
    name: s.name,
    color: s.color,
    sort_order: i,
    protected: Boolean(s.protected),
  }));
  const segId = (key) => segments.find((_, i) => SEGMENTS[i].key === key).id;

  const spec = [

    { key: 'car-reg', kind: 'action', state: 'active', seg: 'general', title: 'Renew car registration', due: addDays(today, -2), by: 'chandra', age: 20 },
    { key: 'prop-tax', kind: 'action', state: 'active', seg: 'finances', title: 'Pay property tax installment', due: addDays(today, -5), by: 'komal', age: 30 },

    { key: 'prescription', kind: 'action', state: 'active', seg: 'health', title: 'Pick up prescription', due: today, by: 'komal', age: 4 },
    { key: 'hsa', kind: 'action', state: 'active', seg: 'finances', title: 'Submit HSA receipts', due: addDays(today, 1), by: 'komal', age: 9 },
    { key: 'dentist', kind: 'action', state: 'active', seg: 'health', title: 'Call dentist about crown', due: friday, by: 'chandra', age: 6 },

    { key: 'trip', kind: 'action', state: 'active', seg: 'future', title: 'Plan the summer trip', by: 'chandra', age: 12 },
    { key: 'resume', kind: 'action', state: 'active', seg: 'career', title: 'Update resume', by: 'komal', age: 15 },

    { key: 'furnace', kind: 'action', state: 'active', seg: 'general', title: 'Schedule furnace service', due: nextWeek(1), by: 'chandra', age: 3 },
    { key: 'ins-back', kind: 'action', state: 'active', seg: 'health', title: 'Call insurance back', due: nextWeek(2), by: 'komal', age: 2 },
    { key: 'budget', kind: 'action', state: 'active', seg: 'finances', title: 'Review budget', due: nextWeek(4), by: 'chandra', age: 8 },
    { key: 'checkin', kind: 'action', state: 'active', seg: 'career', title: 'Career check-in', due: nextWeek(5), by: 'komal', age: 5 },

    { key: 'ins-claim', kind: 'action', state: 'waiting', seg: 'health', title: 'Insurance claim reimbursement', by: 'komal', age: 8,
      waitingOn: 'Insurance claims team', waitingDaysAgo: 6, followUp: thursday,
      followUps: [{ daysAgo: 3, note: 'Called. Claim is in review, they said 5 to 7 business days.', by: 'komal' }] },
    { key: 'roof', kind: 'action', state: 'waiting', seg: 'general', title: 'Roofing contractor quote', by: 'chandra', age: 3,
      waitingOn: 'Summit Roofing', waitingDaysAgo: 2, followUp: addDays(today, 3), followUps: [] },
    { key: 'airline', kind: 'action', state: 'waiting', seg: 'finances', title: 'Airline refund', by: 'chandra', age: 14,
      waitingOn: 'Airline customer service', waitingDaysAgo: 9, followUp: addDays(today, -1),
      followUps: [
        { daysAgo: 7, note: 'Filed the refund request online. Case number is in the email.', by: 'chandra' },
        { daysAgo: 4, note: 'Chat agent said it takes up to 10 days.', by: 'chandra' },
      ] },

    { key: 'k401', kind: 'action', state: 'snoozed', seg: 'finances', title: 'Review 401(k) allocation', due: addDays(today, 2), by: 'chandra', age: 25,
      snoozedUntil: addDays(today, -1), snoozedDaysAgo: 6 },
    { key: 'passport', kind: 'action', state: 'snoozed', seg: 'future', title: 'Renew passport', by: 'komal', age: 18,
      snoozedUntil: nextWeek(1), snoozedDaysAgo: 2 },

    { key: 'solar', kind: 'action', state: 'inbox', title: 'Look into solar panels', by: 'chandra', ageHours: 3 * 24 + 2 },
    { key: 'gift', kind: 'action', state: 'inbox', title: 'Gift idea for Mom’s birthday', by: 'komal', ageHours: 4 },
    { key: 'index-funds', kind: 'link', state: 'inbox', title: 'Article on index funds', url: 'https://www.investopedia.com/terms/i/indexfund.asp', by: 'chandra', ageHours: 20 },

    { key: 'flights', kind: 'action', state: 'done', seg: 'future', title: 'Book flights for spring', by: 'komal', age: 10, doneDaysAgo: 1, doneNote: 'Booked the morning flight. Confirmation is in email.' },
    { key: 'tax-ext', kind: 'action', state: 'done', seg: 'finances', title: 'File tax extension', by: 'chandra', age: 12, doneDaysAgo: 3 },
    { key: 'physical', kind: 'action', state: 'done', seg: 'health', title: 'Schedule annual physical', by: 'komal', age: 14, doneDaysAgo: 4 },

    { key: 'n-retire', kind: 'note', state: 'active', seg: 'finances', title: 'Retirement account notes', by: 'chandra', age: 40,
      body: 'Contribution limit check each January.\nRebalance once a year, not more.\nKeep the beneficiary details up to date.' },
    { key: 'n-doctor', kind: 'note', state: 'active', seg: 'health', title: 'Questions for the doctor', by: 'komal', age: 7,
      body: 'Ask about the sleep trouble.\nBring the list of current medications.' },
    { key: 'n-goals', kind: 'note', state: 'active', seg: 'career', title: 'Goals for next year', by: 'chandra', age: 21,
      body: 'Pick one skill to go deeper on and finish a real project with it.\n\nTalk to my manager about the next role before the review cycle starts.\n\nWrite down wins as they happen so the review is easy.' },
    { key: 'n-home', kind: 'note', state: 'active', seg: 'general', title: 'Home maintenance schedule', by: 'komal', age: 33,
      body: 'Furnace filter every 3 months.\nGutters in spring and fall.\nSmoke detector batteries when the clocks change.' },

    { key: 'l-irs', kind: 'link', state: 'active', seg: 'finances', title: 'IRS: Where’s my refund?', url: 'https://www.irs.gov/refunds', description: 'Check the status of a federal refund.', by: 'chandra', age: 22 },
    { key: 'l-care', kind: 'link', state: 'active', seg: 'health', title: 'Find local care', url: 'https://www.healthcare.gov/find-local-care/', description: 'Search for doctors and clinics near us.', by: 'komal', age: 16 },
    { key: 'l-linkedin', kind: 'link', state: 'active', seg: 'career', title: 'LinkedIn', url: 'https://www.linkedin.com/', by: 'chandra', age: 50 },
    { key: 'l-parks', kind: 'link', state: 'active', seg: 'future', title: 'National Park Service', url: 'https://www.nps.gov/', description: 'Ideas and passes for the summer trip.', by: 'komal', age: 11 },
  ];

  const items = [];
  const events = [];
  const addEvent = (item, e) =>
    events.push({
      id: seedId(`event:${item.key}:${events.filter((x) => x.item_id === item.id).length}`),
      item_id: item.id,
      household_id: household.id,
      type: e.type,
      from_state: e.from ?? null,
      to_state: e.to ?? null,
      note: e.note ?? null,
      data: e.data ?? {},
      actor_id: userId(e.by),
      created_at: e.at,
    });

  for (const s of spec) {
    const createdAt = s.ageHours != null ? ago(0, s.ageHours) : ago(s.age);
    const item = {
      key: s.key,
      id: seedId(`item:${s.key}`),
      household_id: household.id,
      segment_id: s.seg ? segId(s.seg) : null,
      kind: s.kind,
      state: s.state,
      title: s.title,
      body: s.body ?? null,
      url: s.url ?? null,
      description: s.description ?? null,
      due_date: s.due ?? null,
      snoozed_until: s.snoozedUntil ?? null,
      waiting_on: s.waitingOn ?? null,
      follow_up_date: s.followUp ?? null,
      waiting_since: s.waitingDaysAgo != null ? ago(s.waitingDaysAgo) : null,
      completed_at: s.doneDaysAgo != null ? ago(s.doneDaysAgo) : null,
      created_by: userId(s.by),
      created_at: createdAt,
      updated_at: createdAt,
    };
    items.push(item);

    addEvent(item, { type: 'created', to: s.state === 'inbox' ? 'inbox' : 'active', data: s.seg ? { segmentName: segments.find((x) => x.id === segId(s.seg))?.name } : {}, by: s.by, at: createdAt });
    if (s.state === 'waiting') {
      addEvent(item, { type: 'state_change', from: 'active', to: 'waiting', note: `Marked Waiting on ${s.waitingOn}`, by: s.by, at: item.waiting_since });
      for (const f of s.followUps) addEvent(item, { type: 'follow_up', note: f.note, by: f.by, at: ago(f.daysAgo) });
    }
    if (s.state === 'snoozed') {
      addEvent(item, { type: 'state_change', from: 'active', to: 'snoozed', data: { until: s.snoozedUntil }, by: s.by, at: ago(s.snoozedDaysAgo) });
    }
    if (s.state === 'done') {
      addEvent(item, { type: 'completed', from: 'active', to: 'done', note: s.doneNote, by: s.by, at: item.completed_at });
    }
  }

  return { today, endOfWeek: endOfWeek(today), household, users, segments, items, events };
}
