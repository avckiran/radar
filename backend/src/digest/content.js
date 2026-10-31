import { addDays, endOfWeek, todayInZone } from '../dates.js';
import { needsAttention, waitingAgeDays } from '../rules/needsAttention.js';
import { nextUp } from '../rules/home.js';
import { dateLabel, firstName, greetingFor, joinUrl, sendLabel, shortSegment } from './labels.js';

const NEXT_WEEK_MAX = 5;
const FINISHED_SHOWN = 4;
const SECTION_MAX = 15;

// Everything the three templates need, worked out once. The rules for "what needs you" are the same module Home uses.
export function buildDigest({ openItems, doneItems, inboxCount, user, household, now, appUrl }) {
  const { timeZone, nudgeDays } = household;
  const today = todayInZone(now, timeZone);
  const weekEnd = endOfWeek(today);
  const weekStart = addDays(weekEnd, -6);
  const rows = needsAttention(openItems, { now, timeZone, nudgeDays });

  const dated = rows.filter((r) => r.reason === 'due' || r.reason === 'returned');
  const overdue = dated.filter((r) => r.dueDate && r.dueDate < today);
  const thisWeek = dated.filter((r) => !(r.dueDate && r.dueDate < today));
  const waiting = rows.filter((r) => r.reason === 'waiting');
  const nextWeek = nextUp(openItems, today)
    .slice(0, NEXT_WEEK_MAX)
    .map((i) => ({ id: i.id, title: i.title, dayLabel: i.dayLabel, segment: i.segment && { ...i.segment, shortName: shortSegment(i.segment.name) } }));

  const finishedTitles = doneItems
    .filter((i) => i.kind === 'action' && i.completed_at && todayInZone(i.completed_at, timeZone) >= weekStart)
    .map((i) => i.title);

  const link = (path = '') => joinUrl(appUrl, path);
  const model = {
    name: firstName(user.displayName),
    greeting: greetingFor(now, timeZone),
    dateLabel: dateLabel(now, timeZone),
    today,
    weekEnd,
    inboxCount,
    openThisWeek: overdue.length + thisWeek.length,
    links: { app: link('/'), inbox: link('/inbox'), settings: link('/settings'), item: (id) => link(`/items/${id}`) },
    footer: {
      email: user.email,
      household: household.name,
      sendLabel: sendLabel(user.digestTime, timeZone),
    },
  };

  if (model.openThisWeek > 0) {
    const needing = overdue.length + thisWeek.length + waiting.length;
    const bits = [
      overdue.length && `${overdue.length} overdue`,
      thisWeek.length && `${thisWeek.length} due this week`,
      waiting.length && `${waiting.length} waiting`,
      inboxCount && `${inboxCount} in your Inbox`,
    ].filter(Boolean);
    return {
      ...model,
      variant: 'normal',
      subject: `${needing === 1 ? '1 thing needs' : `${needing} things need`} you this week`,
      preheader: bits.join(' · '),
      intro: today === weekEnd ? 'Here’s what needs you today.' : 'Here’s what needs you today and through Saturday.',
      overdue: overdue.slice(0, SECTION_MAX),
      overdueMore: Math.max(0, overdue.length - SECTION_MAX),
      thisWeek: thisWeek.slice(0, SECTION_MAX),
      thisWeekMore: Math.max(0, thisWeek.length - SECTION_MAX),
      waiting: waiting.slice(0, SECTION_MAX),
      waitingMore: Math.max(0, waiting.length - SECTION_MAX),
      nextWeek,
    };
  }

  // Nothing overdue and nothing left this week. Waiting nudges and the Inbox still get one line each.
  const looseEnds = {
    waiting: waiting.map((r) => {
      const item = openItems.find((i) => i.id === r.id);
      return { id: r.id, title: r.title, days: item ? waitingAgeDays(item, today, timeZone) : 0 };
    }),
    inboxCount,
  };

  if (finishedTitles.length > 0) {
    return {
      ...model,
      variant: 'allclear',
      subject: 'All clear for the week',
      preheader: 'You finished everything due before Saturday.',
      finished: { titles: finishedTitles.slice(0, FINISHED_SHOWN), more: Math.max(0, finishedTitles.length - FINISHED_SHOWN) },
      looseEnds,
    };
  }

  return {
    ...model,
    variant: 'empty',
    subject: 'Nothing on the list today',
    preheader: 'Enjoy the day.',
    looseEnds,
  };
}

