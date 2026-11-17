import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../src/app.js';
import { openContext } from './helpers.js';
import { HttpError } from '../src/errors.js';
import { buildSeed } from '../src/seedData.js';
import { loadExport, buildCsvFiles } from '../src/exporter.js';
import {
  clearCheckin,
  createTracker,
  deleteTracker,
  endTracker,
  homeTrackers,
  listTrackers,
  pauseTracker,
  resumeTracker,
  setCheckin,
  setSchedule,
  trackerDay,
  trackerProgress,
  trackerWeek,
  updateTracker,
} from '../src/trackers.js';

// "Now" is Tuesday 2026-11-17, 10:00 in New York.
const NOW = new Date('2026-11-17T15:00:00Z');
const TODAY = '2026-11-17';
const OTHER_HH = '99999999-9999-4999-8999-999999999999';
const OTHER_USER = '88888888-8888-4888-8888-888888888888';
let pg, db, seed, chandra, komal, outsider, server, base, counter = 0;

async function insert(table, row) {
  const cols = Object.keys(row);
  const vals = cols.map((c) => (row[c] !== null && typeof row[c] === 'object' && !(row[c] instanceof Date) ? JSON.stringify(row[c]) : row[c]));
  await pg.query(`insert into ${table} (${cols.join(', ')}) values (${cols.map((_, i) => '$' + (i + 1)).join(', ')})`, vals);
}

function id() {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
}

const fails = (promise, status, pattern) =>
  assert.rejects(promise, (e) => e instanceof HttpError && e.status === status && (!pattern || pattern.test(e.message)));

const make = async (over = {}, ctx = chandra, now = NOW) =>
  (await createTracker(db, ctx, { id: id(), title: 'Thing', schedule: { kind: 'days', days: [0, 1, 2, 3, 4, 5, 6] }, ...over }, now)).tracker;

const rowsOf = (day) => day.groups.flatMap((g) => g.rows);
const find = (day, title) => rowsOf(day).find((r) => r.title === title);
const when = (ymd, hour = 15) => new Date(`${ymd}T${String(hour).padStart(2, '0')}:00:00Z`);

before(async () => {
  pg = new PGlite({ parsers: { 1082: (v) => v } });
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
  for (const f of fs.readdirSync(dir).sort()) await pg.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  seed = buildSeed({ now: NOW });
  await insert('households', seed.household);
  for (const u of seed.users) {
    const { key, ...row } = u;
    await insert('users', { ...row, password_hash: 'x' });
  }
  await insert('households', { id: OTHER_HH, name: 'Somebody else', time_zone: 'America/Chicago', nudge_days: 5 });
  await insert('users', { id: OTHER_USER, household_id: OTHER_HH, username: 'outsider', display_name: 'Outsider', is_owner: true, password_hash: 'x' });
  db = { query: (s, p) => pg.query(s, p), connect: async () => ({ query: (s, p) => pg.query(s, p), release() {} }) };
  const mk = (u) => ({ householdId: seed.household.id, householdName: seed.household.name, timeZone: 'America/New_York', nudgeDays: 5, user: { id: u.id, displayName: u.display_name } });
  chandra = mk(seed.users[0]);
  komal = mk(seed.users[1]);
  outsider = { householdId: OTHER_HH, householdName: 'Somebody else', timeZone: 'America/Chicago', nudgeDays: 5, user: { id: OTHER_USER, displayName: 'Outsider' } };

  const app = createApp({ authenticate: openContext(db), db, corsOrigins: ['http://localhost:5173'], now: () => NOW });
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  base = `http://localhost:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
});

test('the four trackers from the user journey can be set up', async () => {
  const pill = await make({ title: 'Take the pill', part: 'morning', schedule: { kind: 'interval', intervalDays: 2 } });
  assert.equal(pill.scheduleText, 'Every other day');
  assert.deepEqual(pill.schedule, { kind: 'interval', days: null, intervalDays: 2, anchorDate: TODAY, perWeek: null });
  assert.equal(pill.startDate, TODAY);
  const med = await make({ title: 'Meditate', part: 'morning' });
  assert.equal(med.scheduleText, 'Every day');
  const trash = await make({ title: 'Trash', scope: 'household', schedule: { kind: 'days', days: [2] } });
  assert.equal(trash.scheduleText, 'Tuesdays');
  assert.equal(trash.scope, 'household');
  const gym = await make({ title: 'Workout', schedule: { kind: 'weekly', perWeek: 4 }, endDate: '2027-05-17' });
  assert.equal(gym.scheduleText, '4 days a week');
  assert.equal(gym.endDate, '2027-05-17');
  const day = await trackerDay(db, chandra, undefined, NOW);
  assert.deepEqual(day.groups.map((g) => g.part), ['morning', 'anytime']);
  assert.deepEqual(find(day, 'Take the pill') && [find(day, 'Take the pill').state, find(day, 'Take the pill').kind], ['open', 'fixed']);
  assert.equal(find(day, 'Workout').kind, 'quota');
  assert.equal(find(day, 'Workout').quota.required, 4);
  for (const t of [pill, med, trash, gym]) await deleteTracker(db, chandra, t.id);
});

test('the same create request twice makes one tracker', async () => {
  const tid = id();
  const input = { id: tid, title: '  Stretch  ', note: ' ten minutes ', schedule: { kind: 'days', days: [3, 1, 1] } };
  const first = await createTracker(db, chandra, input, NOW);
  assert.equal(first.created, true);
  assert.equal(first.tracker.title, 'Stretch');
  assert.equal(first.tracker.note, 'ten minutes');
  assert.deepEqual(first.tracker.schedule.days, [1, 3]);
  const again = await createTracker(db, chandra, input, NOW);
  assert.equal(again.created, false);
  assert.equal((await pg.query('select count(*)::int n from trackers where id = $1', [tid])).rows[0].n, 1);
  assert.equal((await pg.query('select count(*)::int n from tracker_schedules where tracker_id = $1', [tid])).rows[0].n, 1);
  await fails(createTracker(db, komal, input, NOW), 409);
  await deleteTracker(db, chandra, tid);
});

test('names, dates and schedules are checked', async () => {
  const bad = (over, status, pattern) => fails(createTracker(db, chandra, { id: id(), title: 'ok', schedule: { kind: 'days', days: [1] }, ...over }, NOW), status, pattern);
  await bad({ title: '   ' }, 400, /name/);
  await bad({ title: 'x'.repeat(81) }, 400, /too long/);
  await bad({ note: 'x'.repeat(501) }, 400, /too long/);
  await bad({ scope: 'public' }, 400);
  await bad({ part: 'midnight' }, 400, /morning/);
  await bad({ startDate: '2026-11-16' }, 400, /today or later/);
  await bad({ startDate: 'tomorrow' }, 400, /valid date/);
  await bad({ startDate: '2028-01-01' }, 400, /too far/);
  await bad({ endDate: '2026-11-16', startDate: TODAY }, 400, /before the start/);
  await bad({ schedule: { kind: 'days', days: [] } }, 400, /day/);
  await bad({ schedule: { kind: 'days', days: [7] } }, 400, /day/);
  await bad({ schedule: { kind: 'interval', intervalDays: 1 } }, 400, /2 and every 30/);
  await bad({ schedule: { kind: 'interval', intervalDays: 31 } }, 400);
  await bad({ schedule: { kind: 'weekly', perWeek: 7 } }, 400, /1 and 6/);
  await bad({ schedule: { kind: 'weekly', perWeek: 0 } }, 400);
  await bad({ schedule: { kind: 'monthly' } }, 400, /how often/);
  await bad({ schedule: null }, 400, /how often/);
  await fails(createTracker(db, chandra, { title: 'No id', schedule: { kind: 'days', days: [1] } }, NOW), 400, /ID/);
});

test('ticking, undoing and skipping a day', async () => {
  const t = await make({ title: 'Prayer', part: 'evening' });
  let r = await setCheckin(db, chandra, t.id, TODAY, {}, NOW);
  assert.equal(find(r.day, 'Prayer').state, 'done');
  assert.equal(find(r.day, 'Prayer').checkedBy, 'Chandra');
  assert.deepEqual(r.day.summary, { state: 'win', done: 1, total: 1, skipped: 0, bonus: 0 });
  await setCheckin(db, chandra, t.id, TODAY, { status: 'done' }, NOW);
  assert.equal((await pg.query('select count(*)::int n from tracker_checkins where tracker_id = $1', [t.id])).rows[0].n, 1);
  r = await clearCheckin(db, chandra, t.id, TODAY, NOW);
  assert.equal(find(r.day, 'Prayer').state, 'open');
  r = await setCheckin(db, chandra, t.id, TODAY, { status: 'skipped', note: '  travelling ' }, NOW);
  assert.equal(find(r.day, 'Prayer').state, 'skipped');
  assert.equal(find(r.day, 'Prayer').skipNote, 'travelling');
  assert.equal(r.day.summary.state, 'rest');
  await fails(setCheckin(db, chandra, t.id, TODAY, { status: 'skipped', note: 'x'.repeat(201) }, NOW), 400, /too long/);
  await fails(setCheckin(db, chandra, t.id, TODAY, { status: 'maybe' }, NOW), 400);
  await deleteTracker(db, chandra, t.id);
});

test('only today and the six days before can be changed; days must be scheduled', async () => {
  const t = await make({ title: 'Trash', schedule: { kind: 'days', days: [2] } });
  await fails(setCheckin(db, chandra, t.id, '2026-11-18', {}, NOW), 400, /hasn’t happened/);
  await fails(setCheckin(db, chandra, t.id, '2026-11-10', {}, NOW), 400, /last|before/); // 7 days ago
  await fails(setCheckin(db, chandra, t.id, 'nonsense', {}, NOW), 400);
  await fails(setCheckin(db, chandra, t.id, '2026-11-16', {}, NOW), 409, /isn’t a day/); // Monday
  const later = await make({ title: 'Starts tomorrow', startDate: '2026-11-18' });
  await fails(setCheckin(db, chandra, later.id, TODAY, {}, NOW), 409, /isn’t a day/);
  await deleteTracker(db, chandra, t.id);
  await deleteTracker(db, chandra, later.id);
});

test('yesterday can be ticked from the day view, and a missed day shows as missed', async () => {
  // Tracker created a week ago (as if it had been made on 11-10)
  const week = new Date('2026-11-10T15:00:00Z');
  const t = await make({ title: 'Walk' }, chandra, week);
  let day = await trackerDay(db, chandra, '2026-11-16', NOW);
  assert.equal(find(day, 'Walk').state, 'missed');
  assert.equal(day.summary.state, 'miss');
  await setCheckin(db, chandra, t.id, '2026-11-16', {}, NOW);
  day = await trackerDay(db, chandra, '2026-11-16', NOW);
  assert.equal(find(day, 'Walk').state, 'done');
  await fails(trackerDay(db, chandra, '2020-01-01', NOW), 400, /range/);
  await fails(trackerDay(db, chandra, 'soon', NOW), 400);
  await deleteTracker(db, chandra, t.id);
});

test('a personal tracker is private; a household tracker is shared and shows who ticked it', async () => {
  const mine = await make({ title: 'Secret pill', scope: 'personal' });
  const shared = await make({ title: 'Laundry', scope: 'household', schedule: { kind: 'days', days: [2] } });
  const k = await listTrackers(db, komal, NOW);
  assert.deepEqual(k.trackers.map((x) => x.title), ['Laundry']);
  assert.equal((await listTrackers(db, chandra, NOW)).trackers.some((x) => x.title === 'Secret pill'), true);
  await fails(setCheckin(db, komal, mine.id, TODAY, {}, NOW), 404);
  await fails(clearCheckin(db, komal, mine.id, TODAY, NOW), 404);
  await fails(updateTracker(db, komal, mine.id, { title: 'Hijack' }, NOW), 404);
  await fails(setSchedule(db, komal, mine.id, { kind: 'days', days: [1] }, NOW), 404);
  await fails(pauseTracker(db, komal, mine.id, NOW), 404);
  await fails(endTracker(db, komal, mine.id, NOW), 404);
  await fails(deleteTracker(db, komal, mine.id), 404);
  await fails(trackerProgress(db, komal, { trackerId: mine.id }, NOW), 404);
  const r = await setCheckin(db, komal, shared.id, TODAY, {}, NOW);
  assert.equal(find(r.day, 'Laundry').checkedBy, 'Komal');
  const c = await trackerDay(db, chandra, TODAY, NOW);
  assert.equal(find(c, 'Laundry').state, 'done');
  assert.equal(find(c, 'Laundry').checkedBy, 'Komal');
  assert.deepEqual((await listTrackers(db, outsider, NOW)).trackers, []);
  await fails(setCheckin(db, outsider, shared.id, TODAY, {}, NOW), 404);
  await deleteTracker(db, chandra, mine.id);
  await deleteTracker(db, komal, shared.id);
});

test('a schedule change applies from today and keeps the past as it was', async () => {
  const week = new Date('2026-11-10T15:00:00Z');
  const t = await make({ title: 'Daily', startDate: '2026-11-10' }, chandra, week);
  // daily since 11-10; change to Tuesdays only today (Tuesday 11-17)
  await setSchedule(db, chandra, t.id, { kind: 'days', days: [2] }, NOW);
  const wed = await trackerDay(db, chandra, '2026-11-11', NOW);
  assert.equal(find(wed, 'Daily').state, 'missed');
  const tomorrow = await trackerDay(db, chandra, '2026-11-18', NOW);
  assert.equal(find(tomorrow, 'Daily'), undefined);
  const card = (await listTrackers(db, chandra, NOW)).trackers.find((x) => x.id === t.id);
  assert.equal(card.scheduleText, 'Tuesdays');
  assert.equal((await pg.query('select count(*)::int n from tracker_schedules where tracker_id = $1', [t.id])).rows[0].n, 2);
  await deleteTracker(db, chandra, t.id);
});

test('pause stops the days from counting; resume brings the old schedule back', async () => {
  const week = new Date('2026-11-10T15:00:00Z');
  const t = await make({ title: 'Pausable', startDate: '2026-11-10', schedule: { kind: 'days', days: [1, 2, 3, 4, 5] } }, chandra, week);
  let card = (await pauseTracker(db, chandra, t.id, NOW)).tracker;
  assert.equal(card.status, 'paused');
  assert.equal(find(await trackerDay(db, chandra, TODAY, NOW), 'Pausable'), undefined);
  assert.equal(find(await trackerDay(db, chandra, '2026-11-12', NOW), 'Pausable').state, 'missed');
  await pauseTracker(db, chandra, t.id, NOW);
  assert.equal((await pg.query('select count(*)::int n from tracker_schedules where tracker_id = $1', [t.id])).rows[0].n, 2);
  const later = when('2026-11-19');
  card = (await resumeTracker(db, chandra, t.id, later)).tracker;
  assert.equal(card.status, 'active');
  assert.equal(card.scheduleText, 'Weekdays');
  await resumeTracker(db, chandra, t.id, later);
  assert.equal((await pg.query('select count(*)::int n from tracker_schedules where tracker_id = $1', [t.id])).rows[0].n, 3);
  const during = await trackerDay(db, chandra, '2026-11-18', later);
  assert.equal(find(during, 'Pausable'), undefined);
  await deleteTracker(db, chandra, t.id);
});

test('pausing and resuming on the day a tracker starts keeps its schedule', async () => {
  const t = await make({ title: 'Same day', schedule: { kind: 'interval', intervalDays: 3 } });
  await pauseTracker(db, chandra, t.id, NOW);
  const card = (await resumeTracker(db, chandra, t.id, NOW)).tracker;
  assert.equal(card.scheduleText, 'Every 3 days');
  assert.equal(card.schedule.anchorDate, TODAY);
  assert.equal(find(await trackerDay(db, chandra, TODAY, NOW), 'Same day').state, 'open');
  await deleteTracker(db, chandra, t.id);
});

test('stop tracking finishes the tracker and keeps its history; one that never had a day is deleted', async () => {
  const week = new Date('2026-11-10T15:00:00Z');
  const t = await make({ title: 'Six months', startDate: '2026-11-10' }, chandra, week);
  await setCheckin(db, chandra, t.id, '2026-11-12', {}, NOW);
  const r = await endTracker(db, chandra, t.id, NOW);
  assert.equal(r.tracker.status, 'finished');
  assert.equal(r.tracker.endDate, '2026-11-16');
  assert.equal(find(await trackerDay(db, chandra, TODAY, NOW), 'Six months'), undefined);
  assert.equal(find(await trackerDay(db, chandra, '2026-11-12', NOW), 'Six months').state, 'done');
  await fails(updateTracker(db, chandra, t.id, { title: 'New name' }, NOW), 409, /finished/);
  await fails(setSchedule(db, chandra, t.id, { kind: 'days', days: [1] }, NOW), 409, /finished/);
  const u = await make({ title: 'Ticked today' });
  await setCheckin(db, chandra, u.id, TODAY, {}, NOW);
  assert.equal((await endTracker(db, chandra, u.id, NOW)).tracker.endDate, TODAY);
  const n = await make({ title: 'Oops' });
  assert.deepEqual(await endTracker(db, chandra, n.id, NOW), { deleted: true, tracker: null });
  assert.equal((await listTrackers(db, chandra, NOW)).trackers.some((x) => x.id === n.id), false);
  for (const x of [t, u]) await deleteTracker(db, chandra, x.id);
});

test('editing a tracker: name, note, time of day, end date', async () => {
  const t = await make({ title: 'Old', part: 'morning' });
  const r = await updateTracker(db, chandra, t.id, { title: ' New  name ', note: 'hi', part: 'evening', endDate: '2027-01-01' }, NOW);
  assert.deepEqual([r.tracker.title, r.tracker.note, r.tracker.part, r.tracker.endDate], ['New name', 'hi', 'evening', '2027-01-01']);
  assert.equal((await updateTracker(db, chandra, t.id, { endDate: null }, NOW)).tracker.endDate, null);
  await fails(updateTracker(db, chandra, t.id, {}, NOW), 400, /Nothing/);
  await fails(updateTracker(db, chandra, t.id, { title: '' }, NOW), 400);
  await fails(updateTracker(db, chandra, t.id, { part: 'night' }, NOW), 400);
  await fails(updateTracker(db, chandra, t.id, { endDate: '2026-11-10' }, NOW), 400, /today or later/);
  await fails(updateTracker(db, chandra, id(), { title: 'x' }, NOW), 404);
  await fails(updateTracker(db, chandra, 'nope', { title: 'x' }, NOW), 404);
  await deleteTracker(db, chandra, t.id);
  await fails(deleteTracker(db, chandra, t.id), 404);
});

test('a workout quota: ticks add up and the week view shows it', async () => {
  const week = new Date('2026-11-10T15:00:00Z');
  const t = await make({ title: 'Gym', schedule: { kind: 'weekly', perWeek: 2 }, startDate: '2026-11-10' }, chandra, week);
  await setCheckin(db, chandra, t.id, '2026-11-16', {}, NOW);
  let w = await trackerWeek(db, chandra, '2026-11-15', NOW);
  assert.equal(w.rows[0].quota.done, 1);
  assert.equal(w.rows[0].status, 'inProgress');
  const r = await setCheckin(db, chandra, t.id, TODAY, {}, NOW);
  assert.equal(find(r.day, 'Gym').quota.done, 2);
  assert.equal(find(r.day, 'Gym').quota.status, 'met');
  w = await trackerWeek(db, chandra, '2026-11-09', NOW); // the previous week, which starts on Sunday 11-08
  assert.equal(w.weekStart, '2026-11-08');
  assert.equal(w.rows[0].quota.done, 0);
  assert.equal(w.rows[0].status, 'missed');
  await fails(trackerWeek(db, chandra, 'soon', NOW), 400);
  await deleteTracker(db, chandra, t.id);
});

test('the Progress dashboard and the Home card', async () => {
  const week = new Date('2026-11-11T15:00:00Z');
  const a = await make({ title: 'Meditate', part: 'morning', startDate: '2026-11-11' }, chandra, week);
  for (const d of ['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16']) await setCheckin(db, chandra, a.id, d, {}, NOW);
  const p = (await trackerProgress(db, chandra, { range: '30' }, NOW));
  assert.equal(p.range, '30');
  assert.equal(p.summary.dayStreak, 6);
  assert.equal(p.summary.completion, 100);
  assert.equal(p.cards.find((c) => c.id === a.id).streak.current, 6);
  const one = await trackerProgress(db, chandra, { range: 'all', trackerId: a.id }, NOW);
  assert.equal(one.cards.length, 1);
  await fails(trackerProgress(db, chandra, { range: '5' }, NOW), 400);
  await fails(trackerProgress(db, chandra, { trackerId: id() }, NOW), 404);
  const home = await homeTrackers(db, chandra, NOW);
  assert.equal(home.rows.some((r) => r.title === 'Meditate' && r.state === 'open'), true);
  assert.equal(home.summary.state, 'open');
  assert.equal(home.dayStreak, 6);
  await deleteTracker(db, chandra, a.id);
});

test('a household can have at most 100 trackers', async () => {
  const before = (await pg.query('select count(*)::int n from trackers where household_id = $1 and deleted_at is null', [seed.household.id])).rows[0].n;
  for (let i = before; i < 100; i++) await make({ title: `Filler ${i}` });
  await fails(createTracker(db, chandra, { id: id(), title: 'One too many', schedule: { kind: 'days', days: [1] } }, NOW), 400, /100/);
  await pg.query(`update trackers set deleted_at = now() where household_id = $1 and title like 'Filler%'`, [seed.household.id]);
});

test('the export holds your own and the household trackers, never somebody else’s personal ones', async () => {
  const mine = await make({ title: 'Chandra only' });
  const shared = await make({ title: 'Shared chore', scope: 'household' });
  await setCheckin(db, chandra, shared.id, TODAY, {}, NOW);
  const forKomal = await loadExport(db, komal, NOW);
  assert.deepEqual(forKomal.trackers.filter((t) => !t.deletedAt).map((t) => t.title), ['Shared chore']);
  assert.equal(forKomal.trackerCheckins.length >= 1, true);
  assert.equal(forKomal.trackerSchedules.some((s) => s.trackerTitle === 'Chandra only'), false);
  assert.equal(forKomal.trackerCheckins.some((c) => c.trackerTitle === 'Chandra only'), false);
  const forChandra = await loadExport(db, chandra, NOW);
  assert.equal(forChandra.trackers.some((t) => t.title === 'Chandra only'), true);
  const csv = buildCsvFiles(forChandra);
  for (const name of ['trackers.csv', 'tracker-schedules.csv', 'tracker-checkins.csv']) assert.ok(csv.some((f) => f.name === name), name);
  assert.ok(!/password/i.test(JSON.stringify(forChandra)));
  for (const t of [mine, shared]) await deleteTracker(db, chandra, t.id);
});

test('the routes work over HTTP', async () => {
  const tid = id();
  const post = (p, body) => fetch(`${base}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  let res = await post('/api/trackers', { id: tid, title: 'Over HTTP', schedule: { kind: 'days', days: [2] } });
  assert.equal(res.status, 201);
  assert.equal((await post('/api/trackers', { id: tid, title: 'Over HTTP', schedule: { kind: 'days', days: [2] } })).status, 200);
  res = await post(`/api/trackers/${tid}/checkins/${TODAY}`, {});
  assert.equal(res.status, 200);
  assert.equal((await res.json()).day.groups.flatMap((g) => g.rows).find((r) => r.title === 'Over HTTP').state, 'done');
  res = await fetch(`${base}/api/trackers/day`);
  assert.equal((await res.json()).day.groups.flatMap((g) => g.rows).some((r) => r.title === 'Over HTTP'), true);
  assert.equal((await fetch(`${base}/api/trackers/week`)).status, 200);
  assert.equal((await fetch(`${base}/api/trackers/progress?range=90`)).status, 200);
  assert.equal((await fetch(`${base}/api/trackers`)).status, 200);
  assert.equal((await fetch(`${base}/api/trackers/progress?range=1`)).status, 400);
  res = await fetch(`${base}/api/trackers/${tid}/checkins/${TODAY}`, { method: 'DELETE' });
  assert.equal(res.status, 200);
  assert.equal((await post(`/api/trackers/${tid}/pause`)).status, 200);
  assert.equal((await post(`/api/trackers/${tid}/resume`)).status, 200);
  res = await post(`/api/trackers/${tid}/schedule`, { kind: 'weekly', perWeek: 3 });
  assert.equal((await res.json()).tracker.scheduleText, '3 days a week');
  res = await fetch(`${base}/api/trackers/${tid}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Renamed' }) });
  assert.equal((await res.json()).tracker.title, 'Renamed');
  res = await post(`/api/trackers/${tid}/end`);
  assert.equal((await res.json()).deleted, true);
  assert.equal((await fetch(`${base}/api/trackers/${tid}`, { method: 'DELETE' })).status, 404);
  assert.equal((await fetch(`${base}/api/trackers/not-an-id`, { method: 'DELETE' })).status, 404);
});

test('the tracker tables are locked: row-level security is on with no policies', async () => {
  for (const table of ['trackers', 'tracker_schedules', 'tracker_checkins']) {
    const r = await pg.query(`select relrowsecurity from pg_class where relname = $1`, [table]);
    assert.equal(r.rows[0].relrowsecurity, true, table);
    const p = await pg.query(`select count(*)::int n from pg_policies where tablename = $1`, [table]);
    assert.equal(p.rows[0].n, 0, table);
  }
});
