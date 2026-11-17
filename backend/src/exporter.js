import { todayInZone } from './dates.js';
import { toCsv } from './csv.js';
import { makeZip } from './zip.js';

// Explicit column lists: nothing like password_hash can ever slip into an export.
const USER_SQL = `select id, username, display_name, email, is_owner,
                         digest_enabled, digest_morning_enabled, to_char(digest_time, 'HH24:MI') as digest_morning_time,
                         digest_afternoon_enabled, to_char(digest_afternoon_time, 'HH24:MI') as digest_afternoon_time,
                         digest_evening_enabled, to_char(digest_evening_time, 'HH24:MI') as digest_evening_time, created_at
                    from users where household_id = $1 order by created_at, username`;
const SEGMENT_SQL = `select s.id, s.name, s.color, s.sort_order, s.protected, s.allowed_kinds, s.created_at, s.deleted_at
                       from segments s where s.household_id = $1 order by s.deleted_at nulls first, s.sort_order, s.name`;
const ITEM_SQL = `select i.id, i.kind, i.state, i.title, s.name as segment, i.segment_id, i.body, i.url, i.description,
                         i.due_date, i.snoozed_until, i.waiting_on, i.follow_up_date, i.waiting_since, i.completed_at,
                         u.display_name as created_by, i.created_at, i.updated_at, i.deleted_at
                    from items i
                    left join segments s on s.id = i.segment_id
                    left join users u on u.id = i.created_by
                   where i.household_id = $1 order by i.created_at, i.id`;
const EVENT_SQL = `select e.id, e.item_id, i.title as item_title, e.type, e.from_state, e.to_state, e.note, e.data,
                          u.display_name as actor, e.created_at
                     from item_events e
                     join items i on i.id = e.item_id
                     left join users u on u.id = e.actor_id
                    where e.household_id = $1 order by e.created_at, e.id`;

const SHOPPING_LIST_SQL = `select l.id, l.title, l.note, u.display_name as created_by, l.created_at, l.updated_at,
                                  l.archived_at, a.display_name as archived_by, l.deleted_at
                             from shopping_lists l
                             left join users u on u.id = l.created_by
                             left join users a on a.id = l.archived_by
                            where l.household_id = $1 order by l.created_at, l.id`;
const SHOPPING_ITEM_SQL = `select i.id, i.list_id, l.title as list_title, i.text, i.checked_at, c.display_name as checked_by,
                                  u.display_name as created_by, i.created_at, i.updated_at, i.deleted_at
                             from shopping_items i
                             join shopping_lists l on l.id = i.list_id
                             left join users u on u.id = i.created_by
                             left join users c on c.id = i.checked_by
                            where i.household_id = $1 order by i.created_at, i.seq`;

// Only the signed-in person's own trackers and the household ones: a personal tracker is private to its owner
const TRACKER_SQL = `select t.id, t.scope, o.display_name as owner, t.title, t.note, t.part, t.start_date, t.end_date,
                            t.created_at, t.updated_at, t.deleted_at
                       from trackers t join users o on o.id = t.owner_id
                      where t.household_id = $1 and (t.scope = 'household' or t.owner_id = $2)
                      order by t.created_at, t.id`;
const TRACKER_SCHEDULE_SQL = `select s.id, s.tracker_id, t.title as tracker_title, s.effective_from, s.kind, s.days, s.interval_days,
                                     s.anchor_date, s.per_week, s.created_at
                                from tracker_schedules s join trackers t on t.id = s.tracker_id
                               where t.household_id = $1 and (t.scope = 'household' or t.owner_id = $2)
                               order by s.created_at, s.seq`;
const TRACKER_CHECKIN_SQL = `select c.id, c.tracker_id, t.title as tracker_title, c.local_date, c.status, c.note,
                                    u.display_name as checked_by, c.created_at, c.updated_at
                               from tracker_checkins c join trackers t on t.id = c.tracker_id
                               left join users u on u.id = c.user_id
                              where t.household_id = $1 and (t.scope = 'household' or t.owner_id = $2)
                              order by c.local_date, c.created_at, c.id`;

const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const mapRow = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [camel(k), v]));

export async function loadExport(db, ctx, now) {
  const [users, segments, items, events, shoppingLists, shoppingItems, trackers, trackerSchedules, trackerCheckins] = await Promise.all([
    db.query(USER_SQL, [ctx.householdId]),
    db.query(SEGMENT_SQL, [ctx.householdId]),
    db.query(ITEM_SQL, [ctx.householdId]),
    db.query(EVENT_SQL, [ctx.householdId]),
    db.query(SHOPPING_LIST_SQL, [ctx.householdId]),
    db.query(SHOPPING_ITEM_SQL, [ctx.householdId]),
    db.query(TRACKER_SQL, [ctx.householdId, ctx.user.id]),
    db.query(TRACKER_SCHEDULE_SQL, [ctx.householdId, ctx.user.id]),
    db.query(TRACKER_CHECKIN_SQL, [ctx.householdId, ctx.user.id]),
  ]);
  return {
    exportedAt: now.toISOString(),
    household: { name: ctx.householdName, timeZone: ctx.timeZone, nudgeDays: ctx.nudgeDays },
    users: users.rows.map(mapRow),
    segments: segments.rows.map(mapRow),
    items: items.rows.map(mapRow),
    events: events.rows.map(mapRow),
    shoppingLists: shoppingLists.rows.map(mapRow),
    shoppingItems: shoppingItems.rows.map(mapRow),
    trackers: trackers.rows.map(mapRow),
    trackerSchedules: trackerSchedules.rows.map(mapRow),
    trackerCheckins: trackerCheckins.rows.map(mapRow),
  };
}

function columns(keys) {
  return keys.map((key) => ({ key, header: key }));
}

export function buildCsvFiles(data) {
  const sets = {
    'items.csv': data.items,
    'history.csv': data.events,
    'segments.csv': data.segments,
    'users.csv': data.users,
    'shopping-lists.csv': data.shoppingLists,
    'shopping-items.csv': data.shoppingItems,
    'trackers.csv': data.trackers,
    'tracker-schedules.csv': data.trackerSchedules,
    'tracker-checkins.csv': data.trackerCheckins,
  };
  const first = {
    'items.csv': ['id', 'kind', 'state', 'title', 'segment', 'segmentId', 'body', 'url', 'description', 'dueDate', 'snoozedUntil', 'waitingOn', 'followUpDate', 'waitingSince', 'completedAt', 'createdBy', 'createdAt', 'updatedAt', 'deletedAt'],
    'history.csv': ['id', 'itemId', 'itemTitle', 'type', 'fromState', 'toState', 'note', 'data', 'actor', 'createdAt'],
    'segments.csv': ['id', 'name', 'color', 'sortOrder', 'protected', 'allowedKinds', 'createdAt', 'deletedAt'],
    'users.csv': ['id', 'username', 'displayName', 'email', 'isOwner', 'digestEnabled', 'digestMorningEnabled', 'digestMorningTime', 'digestAfternoonEnabled', 'digestAfternoonTime', 'digestEveningEnabled', 'digestEveningTime', 'createdAt'],
    'shopping-lists.csv': ['id', 'title', 'note', 'createdBy', 'createdAt', 'updatedAt', 'archivedAt', 'archivedBy', 'deletedAt'],
    'shopping-items.csv': ['id', 'listId', 'listTitle', 'text', 'checkedAt', 'checkedBy', 'createdBy', 'createdAt', 'updatedAt', 'deletedAt'],
    'trackers.csv': ['id', 'scope', 'owner', 'title', 'note', 'part', 'startDate', 'endDate', 'createdAt', 'updatedAt', 'deletedAt'],
    'tracker-schedules.csv': ['id', 'trackerId', 'trackerTitle', 'effectiveFrom', 'kind', 'days', 'intervalDays', 'anchorDate', 'perWeek', 'createdAt'],
    'tracker-checkins.csv': ['id', 'trackerId', 'trackerTitle', 'localDate', 'status', 'note', 'checkedBy', 'createdAt', 'updatedAt'],
  };
  return Object.entries(sets).map(([name, rows]) => ({
    name,
    data: toCsv(columns(first[name]), rows.map((r) => ({ ...r, allowedKinds: Array.isArray(r.allowedKinds) ? r.allowedKinds.join(' ') : r.allowedKinds, days: Array.isArray(r.days) ? r.days.join(' ') : r.days }))),
  }));
}

export async function buildExport(db, ctx, format, now) {
  const data = await loadExport(db, ctx, now);
  const day = todayInZone(now, ctx.timeZone);
  if (format === 'csv') {
    return {
      filename: `radar-export-${day}.zip`,
      type: 'application/zip',
      body: makeZip(buildCsvFiles(data), now),
    };
  }
  return {
    filename: `radar-export-${day}.json`,
    type: 'application/json; charset=utf-8',
    body: Buffer.from(JSON.stringify(data, null, 2), 'utf8'),
  };
}
