import { withTransaction } from './db.js';
import { HttpError, isUuid } from './errors.js';
import { addDays, isValidYmd, todayInZone } from './dates.js';
import { KINDS, PARTS, currentSchedule, lastActiveSchedule, slotOn, startOfWeek } from './rules/trackers.js';
import {
  buildDayView,
  buildHomeTrackers,
  buildProgress,
  buildTrackerList,
  buildWeekView,
  prepare,
} from './rules/trackerViews.js';

// Trackers: things done again and again. A personal tracker belongs to one person and nobody else can see it;
// a household tracker can be seen and ticked by everybody in the household.
// Nothing is removed for good: deleting a tracker only sets deleted_at. Un-ticking a day removes that day's check-in.
export const LIMITS = { title: 80, note: 500, skipNote: 200, trackers: 100 };
export const BACKFILL_DAYS = 7; // today and the six days before it can be ticked or changed

const NOT_FOUND = 'That tracker wasn’t found. It may have been deleted.';
const FINISHED = 'This tracker has finished. Make a new one to keep going.';

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const oneLine = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

export function cleanTitle(raw) {
  const title = oneLine(raw);
  if (!title) throw new HttpError(400, 'Give the tracker a name, like “Take vitamins”.');
  if (title.length > LIMITS.title) throw new HttpError(400, `The name is too long (${LIMITS.title} characters at most).`);
  return title;
}

export function cleanNote(raw, max = LIMITS.note) {
  const note = typeof raw === 'string' ? raw.trim() : '';
  if (note.length > max) throw new HttpError(400, `The note is too long (${max} characters at most).`);
  return note || null;
}

function cleanPart(raw) {
  if (raw == null || raw === '') return 'anytime';
  if (!PARTS.includes(raw)) throw new HttpError(400, 'Choose morning, afternoon, evening or anytime.');
  return raw;
}

function cleanDate(raw, label) {
  if (!isValidYmd(raw)) throw new HttpError(400, `${label} isn’t a valid date.`);
  return raw;
}

const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

// A schedule from the screen: { kind: 'days', days: [2] } | { kind: 'interval', intervalDays: 2, anchorDate? } | { kind: 'weekly', perWeek: 4 }
export function cleanSchedule(raw, fallbackAnchor) {
  const s = obj(raw);
  if (!KINDS.includes(s.kind)) throw new HttpError(400, 'Choose how often this happens.');
  if (s.kind === 'days') {
    if (!Array.isArray(s.days) || !s.days.every((d) => isInt(d, 0, 6))) throw new HttpError(400, 'Pick at least one day of the week.');
    const days = [...new Set(s.days)].sort((a, b) => a - b);
    if (!days.length) throw new HttpError(400, 'Pick at least one day of the week.');
    return { kind: 'days', days, intervalDays: null, anchorDate: null, perWeek: null };
  }
  if (s.kind === 'interval') {
    if (!isInt(s.intervalDays, 2, 30)) throw new HttpError(400, 'Choose between every 2 and every 30 days.');
    const anchorDate = s.anchorDate == null || s.anchorDate === '' ? fallbackAnchor : cleanDate(s.anchorDate, 'The first day');
    return { kind: 'interval', days: null, intervalDays: s.intervalDays, anchorDate, perWeek: null };
  }
  if (!isInt(s.perWeek, 1, 6)) throw new HttpError(400, 'Choose between 1 and 6 days a week. For every day, choose “Every day”.');
  return { kind: 'weekly', days: null, intervalDays: null, anchorDate: null, perWeek: s.perWeek };
}

// ---------- loading ----------

const VISIBLE = `t.household_id = $1 and t.deleted_at is null and (t.scope = 'household' or t.owner_id = $2)`;

// Every tracker the signed-in person may see, each with its schedule versions and check-ins
export async function loadTrackers(db, ctx) {
  const params = [ctx.householdId, ctx.user.id];
  const trackers = await db.query(
    `select t.id, t.scope, t.owner_id, ou.display_name as owner_name, t.title, t.note, t.part, t.start_date, t.end_date
       from trackers t join users ou on ou.id = t.owner_id
      where ${VISIBLE} order by t.created_at, t.id`,
    params
  );
  const schedules = await db.query(
    `select s.tracker_id, s.effective_from, s.kind, s.days, s.interval_days, s.anchor_date, s.per_week
       from tracker_schedules s join trackers t on t.id = s.tracker_id
      where ${VISIBLE} order by s.effective_from, s.seq`,
    params
  );
  const checkins = await db.query(
    `select c.tracker_id, c.local_date, c.status, c.note, u.display_name as user_name
       from tracker_checkins c join trackers t on t.id = c.tracker_id
       left join users u on u.id = c.user_id
      where ${VISIBLE}`,
    params
  );
  const sched = new Map();
  for (const r of schedules.rows) {
    if (!sched.has(r.tracker_id)) sched.set(r.tracker_id, []);
    sched.get(r.tracker_id).push({
      effectiveFrom: r.effective_from,
      kind: r.kind,
      days: r.days ? r.days.map(Number) : null,
      intervalDays: r.interval_days,
      anchorDate: r.anchor_date,
      perWeek: r.per_week,
    });
  }
  const marks = new Map();
  for (const r of checkins.rows) {
    if (!marks.has(r.tracker_id)) marks.set(r.tracker_id, new Map());
    marks.get(r.tracker_id).set(r.local_date, { status: r.status, note: r.note, userName: r.user_name });
  }
  return trackers.rows.map((r) => ({
    t: {
      id: r.id,
      scope: r.scope,
      ownerId: r.owner_id,
      ownerName: r.owner_name,
      mine: r.owner_id === ctx.user.id,
      title: r.title,
      note: r.note,
      part: r.part,
      startDate: r.start_date,
      endDate: r.end_date,
    },
    schedules: sched.get(r.id) ?? [],
    byDate: marks.get(r.id) ?? new Map(),
  }));
}

async function loadPrepared(db, ctx, now) {
  const today = todayInZone(now, ctx.timeZone);
  return { today, list: prepare(await loadTrackers(db, ctx), today) };
}

export async function listTrackers(db, ctx, now) {
  const { today, list } = await loadPrepared(db, ctx, now);
  return buildTrackerList(list, today);
}

export async function trackerDay(db, ctx, dateParam, now) {
  const { today, list } = await loadPrepared(db, ctx, now);
  const date = dateParam == null || dateParam === '' ? today : cleanDate(dateParam, 'That day');
  if (date > addDays(today, 14) || date < addDays(today, -400)) throw new HttpError(400, 'That day is out of range.');
  return buildDayView(list, date, today);
}

export async function trackerWeek(db, ctx, startParam, now) {
  const { today, list } = await loadPrepared(db, ctx, now);
  const given = startParam == null || startParam === '' ? today : cleanDate(startParam, 'That week');
  const weekStart = startOfWeek(given);
  if (weekStart > addDays(today, 60) || weekStart < addDays(today, -800)) throw new HttpError(400, 'That week is out of range.');
  return buildWeekView(list, weekStart, today);
}

export async function trackerProgress(db, ctx, query, now) {
  const { today, list } = await loadPrepared(db, ctx, now);
  const range = query?.range == null || query.range === '' ? '30' : String(query.range);
  if (!['7', '30', '90', 'all'].includes(range)) throw new HttpError(400, 'Choose 7, 30, 90 days or all.');
  let trackerId = null;
  if (query?.trackerId) {
    trackerId = String(query.trackerId);
    if (!isUuid(trackerId) || !list.some((e) => e.t.id === trackerId)) throw new HttpError(404, NOT_FOUND);
  }
  return buildProgress(list, { today, range, trackerId });
}

export async function homeTrackers(db, ctx, now) {
  const { today, list } = await loadPrepared(db, ctx, now);
  return buildHomeTrackers(list, today);
}

async function trackerCard(db, ctx, id, now) {
  const found = (await listTrackers(db, ctx, now)).trackers.find((t) => t.id === id);
  if (!found) throw new HttpError(404, NOT_FOUND);
  return found;
}

// ---------- changing ----------

async function lockTracker(tx, ctx, id) {
  if (!isUuid(id)) throw new HttpError(404, NOT_FOUND);
  const res = await tx.query(
    `select t.id, t.scope, t.owner_id, t.title, t.note, t.part, t.start_date, t.end_date
       from trackers t
      where t.id = $3 and ${VISIBLE} for update`,
    [ctx.householdId, ctx.user.id, id]
  );
  if (!res.rows[0]) throw new HttpError(404, NOT_FOUND);
  return res.rows[0];
}

async function versionsOf(tx, id) {
  const res = await tx.query(
    `select effective_from, kind, days, interval_days, anchor_date, per_week from tracker_schedules where tracker_id = $1 order by effective_from, seq`,
    [id]
  );
  return res.rows.map((r) => ({
    effectiveFrom: r.effective_from,
    kind: r.kind,
    days: r.days ? r.days.map(Number) : null,
    intervalDays: r.interval_days,
    anchorDate: r.anchor_date,
    perWeek: r.per_week,
  }));
}

async function insertVersion(tx, ctx, trackerId, effectiveFrom, s) {
  await tx.query(
    `insert into tracker_schedules (tracker_id, household_id, effective_from, kind, days, interval_days, anchor_date, per_week)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [trackerId, ctx.householdId, effectiveFrom, s.kind, s.days, s.intervalDays, s.anchorDate, s.perWeek]
  );
}

const maxDate = (a, b) => (a > b ? a : b);

const bounds = (row) => ({ startDate: row.start_date, endDate: row.end_date });

export async function createTracker(db, ctx, input, now) {
  const raw = obj(input);
  if (!isUuid(raw.id)) throw new HttpError(400, 'That request is missing a tracker ID.');
  const today = todayInZone(now, ctx.timeZone);
  const title = cleanTitle(raw.title);
  const note = cleanNote(raw.note);
  if (!['personal', 'household'].includes(raw.scope ?? 'personal')) throw new HttpError(400, 'Choose personal or household.');
  const scope = raw.scope ?? 'personal';
  const part = cleanPart(raw.part);
  const startDate = raw.startDate == null || raw.startDate === '' ? today : cleanDate(raw.startDate, 'The start date');
  if (startDate < today) throw new HttpError(400, 'A tracker starts today or later, so earlier days are never counted as missed.');
  if (startDate > addDays(today, 365)) throw new HttpError(400, 'The start date is too far away.');
  const endDate = raw.endDate == null || raw.endDate === '' ? null : cleanDate(raw.endDate, 'The end date');
  if (endDate && endDate < startDate) throw new HttpError(400, 'The end date can’t be before the start date.');
  if (endDate && endDate > addDays(startDate, 3650)) throw new HttpError(400, 'The end date is too far away.');
  const schedule = cleanSchedule(raw.schedule, startDate);

  const made = await withTransaction(db, async (tx) => {
    const count = await tx.query(`select count(*)::int as n from trackers where household_id = $1 and deleted_at is null`, [ctx.householdId]);
    if (count.rows[0].n >= LIMITS.trackers) throw new HttpError(400, `A household can have ${LIMITS.trackers} trackers at most.`);
    const inserted = await tx.query(
      `insert into trackers (id, household_id, owner_id, scope, title, note, part, start_date, end_date)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict (id) do nothing returning id`,
      [raw.id, ctx.householdId, ctx.user.id, scope, title, note, part, startDate, endDate]
    );
    if (inserted.rows[0]) {
      await insertVersion(tx, ctx, raw.id, startDate, schedule);
      return true;
    }
    // Sending the same request twice never makes two trackers
    const same = await tx.query(`select 1 from trackers t where t.id = $3 and ${VISIBLE}`, [ctx.householdId, ctx.user.id, raw.id]);
    if (!same.rows[0]) throw new HttpError(409, 'That tracker ID is already in use.');
    return false;
  });
  return { created: made, tracker: await trackerCard(db, ctx, raw.id, now) };
}

export async function updateTracker(db, ctx, id, input, now) {
  const raw = obj(input);
  const has = (k) => raw[k] !== undefined;
  if (!['title', 'note', 'part', 'endDate'].some(has)) throw new HttpError(400, 'Nothing to change.');
  const today = todayInZone(now, ctx.timeZone);
  await withTransaction(db, async (tx) => {
    const cur = await lockTracker(tx, ctx, id);
    if (cur.end_date && cur.end_date < today) throw new HttpError(409, FINISHED);
    const title = has('title') ? cleanTitle(raw.title) : cur.title;
    const note = has('note') ? cleanNote(raw.note) : cur.note;
    const part = has('part') ? cleanPart(raw.part) : cur.part;
    let endDate = cur.end_date;
    if (has('endDate')) {
      if (raw.endDate === null || raw.endDate === '') endDate = null;
      else {
        endDate = cleanDate(raw.endDate, 'The end date');
        if (endDate < today) throw new HttpError(400, 'The end date has to be today or later. To stop a tracker now, choose Stop tracking.');
        if (endDate < cur.start_date) throw new HttpError(400, 'The end date can’t be before the start date.');
        if (endDate > addDays(cur.start_date, 3650)) throw new HttpError(400, 'The end date is too far away.');
      }
    }
    await tx.query(`update trackers set title = $3, note = $4, part = $5, end_date = $6, updated_at = now() where id = $1 and household_id = $2`, [
      id,
      ctx.householdId,
      title,
      note,
      part,
      endDate,
    ]);
  });
  return { tracker: await trackerCard(db, ctx, id, now) };
}

// A new schedule applies from today on (or from the start date if the tracker has not started). Past days keep their old schedule.
export async function setSchedule(db, ctx, id, input, now) {
  const today = todayInZone(now, ctx.timeZone);
  await withTransaction(db, async (tx) => {
    const cur = await lockTracker(tx, ctx, id);
    if (cur.end_date && cur.end_date < today) throw new HttpError(409, FINISHED);
    const from = maxDate(today, cur.start_date);
    await insertVersion(tx, ctx, id, from, cleanSchedule(input, from));
  });
  return { tracker: await trackerCard(db, ctx, id, now) };
}

export async function pauseTracker(db, ctx, id, now) {
  const today = todayInZone(now, ctx.timeZone);
  await withTransaction(db, async (tx) => {
    const cur = await lockTracker(tx, ctx, id);
    if (cur.end_date && cur.end_date < today) throw new HttpError(409, FINISHED);
    const versions = await versionsOf(tx, id);
    if (currentSchedule(versions, today)?.kind === 'paused') return;
    await insertVersion(tx, ctx, id, maxDate(today, cur.start_date), { kind: 'paused', days: null, intervalDays: null, anchorDate: null, perWeek: null });
  });
  return { tracker: await trackerCard(db, ctx, id, now) };
}

export async function resumeTracker(db, ctx, id, now) {
  const today = todayInZone(now, ctx.timeZone);
  await withTransaction(db, async (tx) => {
    const cur = await lockTracker(tx, ctx, id);
    if (cur.end_date && cur.end_date < today) throw new HttpError(409, FINISHED);
    const versions = await versionsOf(tx, id);
    if (currentSchedule(versions, today)?.kind !== 'paused') return;
    const before = lastActiveSchedule(versions);
    if (!before) throw new HttpError(409, 'This tracker has no schedule to go back to. Choose how often it happens.');
    await insertVersion(tx, ctx, id, maxDate(today, cur.start_date), before);
  });
  return { tracker: await trackerCard(db, ctx, id, now) };
}

// Stop tracking: the tracker finishes and moves to the finished list with its history kept.
// Today still counts if it was already ticked; otherwise it ends yesterday. A tracker that never had a day is simply deleted.
export async function endTracker(db, ctx, id, now) {
  const today = todayInZone(now, ctx.timeZone);
  const result = await withTransaction(db, async (tx) => {
    const cur = await lockTracker(tx, ctx, id);
    if (cur.end_date && cur.end_date < today) return { deleted: false };
    const ticked = await tx.query(`select 1 from tracker_checkins where tracker_id = $1 and local_date = $2`, [id, today]);
    let end = ticked.rows[0] ? today : addDays(today, -1);
    if (cur.end_date && cur.end_date < end) end = cur.end_date;
    if (end < cur.start_date) {
      await tx.query(`update trackers set deleted_at = now(), updated_at = now() where id = $1 and household_id = $2`, [id, ctx.householdId]);
      return { deleted: true };
    }
    await tx.query(`update trackers set end_date = $3, updated_at = now() where id = $1 and household_id = $2`, [id, ctx.householdId, end]);
    return { deleted: false };
  });
  if (result.deleted) return { deleted: true, tracker: null };
  return { deleted: false, tracker: await trackerCard(db, ctx, id, now) };
}

export async function deleteTracker(db, ctx, id) {
  return withTransaction(db, async (tx) => {
    await lockTracker(tx, ctx, id);
    await tx.query(`update trackers set deleted_at = now(), updated_at = now() where id = $1 and household_id = $2`, [id, ctx.householdId]);
    return { ok: true };
  });
}

// ---------- ticking ----------

function checkWindow(date, today) {
  cleanDate(date, 'That day');
  if (date > today) throw new HttpError(400, 'That day hasn’t happened yet.');
  if (date < addDays(today, -(BACKFILL_DAYS - 1))) throw new HttpError(400, `You can change today and the ${BACKFILL_DAYS - 1} days before it.`);
}

async function dayAfter(db, ctx, date, now) {
  const { today, list } = await loadPrepared(db, ctx, now);
  return buildDayView(list, date, today);
}

// Tick (done) or skip a day. Doing it twice is fine: the day just ends up in that state.
export async function setCheckin(db, ctx, id, date, input, now) {
  const raw = obj(input);
  const today = todayInZone(now, ctx.timeZone);
  checkWindow(date, today);
  const status = raw.status ?? 'done';
  if (!['done', 'skipped'].includes(status)) throw new HttpError(400, 'That request couldn’t be read.');
  const note = status === 'skipped' ? cleanNote(raw.note, LIMITS.skipNote) : null;
  await withTransaction(db, async (tx) => {
    const cur = await lockTracker(tx, ctx, id);
    const versions = await versionsOf(tx, id);
    if (!slotOn(bounds(cur), versions, date)) throw new HttpError(409, 'That isn’t a day for this tracker.');
    await tx.query(
      `insert into tracker_checkins (tracker_id, household_id, local_date, status, note, user_id)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (tracker_id, local_date) do update
         set status = excluded.status, note = excluded.note, user_id = excluded.user_id, updated_at = now()`,
      [id, ctx.householdId, date, status, note, ctx.user.id]
    );
  });
  return { day: await dayAfter(db, ctx, date, now) };
}

// Undo a tick or a skip: the day goes back to how it was before
export async function clearCheckin(db, ctx, id, date, now) {
  const today = todayInZone(now, ctx.timeZone);
  checkWindow(date, today);
  await withTransaction(db, async (tx) => {
    await lockTracker(tx, ctx, id);
    await tx.query(`delete from tracker_checkins where tracker_id = $1 and local_date = $2 and household_id = $3`, [id, date, ctx.householdId]);
  });
  return { day: await dayAfter(db, ctx, date, now) };
}
