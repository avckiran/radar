// Made-up households for previews and tests. The fixed "now" is a Tuesday (all clear is shown on a Saturday).
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const SEG = {
  general: { segment_id: 's-general', segment_name: 'General / Administrative', segment_color: 'slate' },
  finances: { segment_id: 's-finances', segment_name: 'Finances', segment_color: 'emerald' },
  health: { segment_id: 's-health', segment_name: 'Health', segment_color: 'rose' },
  career: { segment_id: 's-career', segment_name: 'Career', segment_color: 'blue' },
};

function item(id, title, seg, extra = {}) {
  return { id, kind: 'action', state: 'active', title, due_date: null, snoozed_until: null, follow_up_date: null, waiting_since: null, waiting_on: null,
    created_at: new Date('2026-10-01T14:00:00Z'), completed_at: null, creator: 'Maya', ...SEG[seg], ...extra };
}

const inboxItem = (id, title) => ({ ...item(id, title, 'general'), state: 'inbox', segment_id: null, segment_name: null, segment_color: null });

export const SAMPLE_HOUSEHOLD = { id: 'h1', name: 'Maya & Dev’s household', timeZone: 'America/New_York', nudgeDays: 5 };
export const SAMPLE_USER = { id: 'u1', displayName: 'Maya', email: 'maya@example.com', digestTime: '08:00' };

export function sampleInputs(variant) {
  if (variant === 'normal') {
    const now = new Date('2026-10-20T12:00:00Z'); // Tuesday 8:00 AM Eastern
    return {
      now,
      data: {
        openItems: [
          item('a1', 'Renew car registration', 'general', { due_date: '2026-10-18' }),
          item('a2', 'Submit HSA receipts', 'finances', { due_date: '2026-10-21', creator: 'Dev' }),
          item('a3', 'Call dentist about crown', 'health', { due_date: '2026-10-23' }),
          item('a4', 'Insurance claim reimbursement', 'health', { state: 'waiting', waiting_since: new Date(now.getTime() - 6 * DAY), follow_up_date: '2026-10-22', creator: 'Dev' }),
          item('n0', 'Schedule furnace service', 'general', { due_date: '2026-10-26' }),
          item('n1', 'Call insurance back', 'health', { due_date: '2026-10-27' }),
          item('n2', 'Review budget', 'finances', { due_date: '2026-10-29' }),
          item('n3', 'Career check-in', 'career', { due_date: '2026-10-30' }),
          item('n4', 'Book dentist cleaning', 'health', { due_date: '2026-10-30' }),
          item('n5', 'Renew passport photos', 'general', { due_date: '2026-10-31' }),
          inboxItem('i1', 'Gift idea for Sam'),
          inboxItem('i2', 'Look into gutter cleaning'),
          inboxItem('i3', 'https://example.com/recipe'),
        ],
        doneItems: [],
        inboxCount: 3,
      },
    };
  }
  if (variant === 'allclear') {
    const now = new Date('2026-10-24T12:00:00Z'); // Saturday
    const finished = ['Renew car registration', 'Submit HSA receipts', 'Pay water bill', 'Book flu shots', 'Order new filters', 'Email the landlord', 'Cancel old gym', 'Update address', 'Schedule oil change']
      .map((t, i) => item(`d${i}`, t, 'general', { state: 'done', completed_at: new Date(now.getTime() - (i % 5) * DAY) }));
    return {
      now,
      data: {
        openItems: [
          item('a4', 'Insurance claim reimbursement', 'health', { state: 'waiting', waiting_since: new Date(now.getTime() - 6 * DAY), creator: 'Dev' }),
          inboxItem('i1', 'Gift idea for Sam'),
          inboxItem('i2', 'Look into gutter cleaning'),
        ],
        doneItems: finished,
        inboxCount: 2,
      },
    };
  }
  return {
    now: new Date('2026-10-20T12:00:00Z'),
    data: { openItems: [], doneItems: [], inboxCount: 0 },
  };
}

export const SAMPLE_VARIANTS = ['normal', 'empty', 'allclear'];
