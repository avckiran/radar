import { addDays, daysBetween, endOfWeek, monthDay, todayInZone, weekdayShort } from '../dates.js';
import { needsAttention, plural, waitingAgeDays } from '../rules/needsAttention.js';
import { nextUp } from '../rules/home.js';
import { SLOT_NAMES, dateLabel, firstName, greetingFor, joinUrl, sendLabel, sendTimesLabel, shoppingLine, shortSegment } from './labels.js';

const NEXT_WEEK_MAX = 5;
const FINISHED_SHOWN = 4;
const SECTION_MAX = 15;

// One simple row for the email: title, segment, a short label on the right and, for follow-ups, a small line under the title.
// tone is 'late' (red), 'soon' (strong) or 'plain'.
function dueRow(row, today) {
  let label;
  let tone = 'plain';
  if (!row.dueDate) label = 'Back from snooze';
  else {
    const diff = daysBetween(today, row.dueDate);
    if (diff < 0) {
      label = `${plural(-diff, 'day')} late`;
      tone = 'late';
    } else if (diff === 0) {
      label = 'Today';
      tone = 'soon';
    } else if (diff === 1) {
      label = 'Tomorrow';
      tone = 'soon';
    } else label = weekdayShort(row.dueDate);
  }
  return { id: row.id, title: row.title, segment: row.segment, label, tone, sub: null };
}

function checkBackText(date, today) {
  const diff = daysBetween(today, date);
  if (diff < 0) return { text: 'check back now', tone: 'late' };
  if (diff === 0) return { text: 'check back today', tone: 'soon' };
  return { text: `check back ${diff > 6 ? monthDay(date) : weekdayShort(date)}`, tone: 'plain' };
}

// Every open follow-up that is not already listed above as due or overdue, longest-open first (check-back dates that have come up lead)
function followUpRows(openItems, listed, today, timeZone) {
  const rank = { late: 0, soon: 1, plain: 2 };
  return openItems
    .filter((i) => i.kind === 'action' && i.state === 'waiting' && !listed.has(i.id))
    .map((i) => {
      const days = waitingAgeDays(i, today, timeZone);
      const back = i.follow_up_date ? checkBackText(i.follow_up_date, today) : null;
      const sub = [i.waiting_on && `with ${i.waiting_on}`, back?.text].filter(Boolean).join(' · ') || null;
      return {
        id: i.id,
        title: i.title,
        segment: i.segment_id ? { id: i.segment_id, name: i.segment_name, color: i.segment_color } : null,
        label: days === 0 ? 'New today' : `${plural(days, 'day')} open`,
        tone: back?.tone ?? 'plain',
        sub,
        waitingSince: i.waiting_since,
      };
    })
    .sort((a, b) => rank[a.tone] - rank[b.tone] || a.waitingSince - b.waitingSince || a.title.localeCompare(b.title));
}

// Everything the three templates need, worked out once. The rules for "what needs you" are the same module Home uses.
export function buildDigest({ openItems, doneItems, inboxCount, shoppingLists = [], user, household, now, appUrl, slot = 'morning' }) {
  const { timeZone, nudgeDays } = household;
  const today = todayInZone(now, timeZone);
  const weekEnd = endOfWeek(today);
  const weekStart = addDays(weekEnd, -6);
  const rows = needsAttention(openItems, { now, timeZone, nudgeDays });

  const dated = rows.filter((r) => r.reason === 'due' || r.reason === 'returned');
  const overdue = dated.filter((r) => r.dueDate && r.dueDate < today);
  const thisWeek = dated.filter((r) => !(r.dueDate && r.dueDate < today));
  const waiting = rows.filter((r) => r.reason === 'waiting'); // follow-ups due a nudge: these decide whether the afternoon and evening emails are sent
  const listed = new Set(dated.map((r) => r.id));
  const followUps = followUpRows(openItems, listed, today, timeZone);
  const nextWeek = nextUp(openItems, today)
    .slice(0, NEXT_WEEK_MAX)
    .map((i) => ({ id: i.id, title: i.title, dayLabel: i.dayLabel, segment: i.segment && { ...i.segment, shortName: shortSegment(i.segment.name) } }));

  const finishedTitles = doneItems
    .filter((i) => i.kind === 'action' && i.completed_at && todayInZone(i.completed_at, timeZone) >= weekStart)
    .map((i) => i.title);

  const link = (path = '') => joinUrl(appUrl, path);
  // Afternoon and evening emails say which one they are, so the three are easy to tell apart
  const withSlot = (subject) => (slot === 'morning' ? subject : `${SLOT_NAMES[slot]}: ${subject}`);
  const model = {
    slot,
    needsYou: overdue.length + thisWeek.length + waiting.length,
    name: firstName(user.displayName),
    greeting: greetingFor(now, timeZone),
    dateLabel: dateLabel(now, timeZone),
    today,
    weekEnd,
    inboxCount,
    shopping: shoppingLine(shoppingLists), // a quiet note at the bottom; it never changes the subject or the skip rule
    openThisWeek: overdue.length + thisWeek.length,
    links: { app: link('/'), inbox: link('/inbox'), shopping: link('/shopping'), settings: link('/settings'), item: (id) => link(`/items/${id}`) },
    footer: {
      email: user.email,
      household: household.name,
      sendLabel: user.sendTimes?.length ? sendTimesLabel(user.sendTimes, timeZone) : sendLabel(user.digestTime, timeZone),
      sendCount: user.sendTimes?.length ?? 1,
    },
  };

  if (model.openThisWeek > 0) {
    const needing = overdue.length + thisWeek.length + followUps.length; // the subject counts what the email lists
    const bits = [
      overdue.length && `${overdue.length} overdue`,
      thisWeek.length && `${thisWeek.length} due this week`,
      followUps.length && `${plural(followUps.length, 'follow-up')}`,
      inboxCount && `${inboxCount} in your Inbox`,
    ].filter(Boolean);
    return {
      ...model,
      variant: 'normal',
      subject: withSlot(`${needing === 1 ? '1 thing needs' : `${needing} things need`} you this week`),
      preheader: bits.join(' · '),
      intro: `Here’s what ${slot === 'morning' ? '' : 'still '}needs you today${today === weekEnd ? '.' : ' and through Saturday.'}`,
      overdue: overdue.slice(0, SECTION_MAX).map((r) => dueRow(r, today)),
      overdueMore: Math.max(0, overdue.length - SECTION_MAX),
      thisWeek: thisWeek.slice(0, SECTION_MAX).map((r) => dueRow(r, today)),
      thisWeekMore: Math.max(0, thisWeek.length - SECTION_MAX),
      followUps: followUps.slice(0, SECTION_MAX),
      followUpsMore: Math.max(0, followUps.length - SECTION_MAX),
      nextWeek,
    };
  }

  // Nothing overdue and nothing left this week. Open follow-ups are still listed, and the Inbox gets one line.
  const looseEnds = {
    followUps: followUps.slice(0, SECTION_MAX),
    followUpsMore: Math.max(0, followUps.length - SECTION_MAX),
    inboxCount,
  };

  if (finishedTitles.length > 0) {
    return {
      ...model,
      variant: 'allclear',
      subject: withSlot('All clear for the week'),
      preheader: 'You finished everything due before Saturday.',
      finished: { titles: finishedTitles.slice(0, FINISHED_SHOWN), more: Math.max(0, finishedTitles.length - FINISHED_SHOWN) },
      looseEnds,
    };
  }

  return {
    ...model,
    variant: 'empty',
    subject: withSlot('Nothing on the list today'),
    preheader: 'Enjoy the day.',
    looseEnds,
  };
}

