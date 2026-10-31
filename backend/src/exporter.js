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

const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const mapRow = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [camel(k), v]));

export async function loadExport(db, ctx, now) {
  const [users, segments, items, events] = await Promise.all([
    db.query(USER_SQL, [ctx.householdId]),
    db.query(SEGMENT_SQL, [ctx.householdId]),
    db.query(ITEM_SQL, [ctx.householdId]),
    db.query(EVENT_SQL, [ctx.householdId]),
  ]);
  return {
    exportedAt: now.toISOString(),
    household: { name: ctx.householdName, timeZone: ctx.timeZone, nudgeDays: ctx.nudgeDays },
    users: users.rows.map(mapRow),
    segments: segments.rows.map(mapRow),
    items: items.rows.map(mapRow),
    events: events.rows.map(mapRow),
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
  };
  const first = {
    'items.csv': ['id', 'kind', 'state', 'title', 'segment', 'segmentId', 'body', 'url', 'description', 'dueDate', 'snoozedUntil', 'waitingOn', 'followUpDate', 'waitingSince', 'completedAt', 'createdBy', 'createdAt', 'updatedAt', 'deletedAt'],
    'history.csv': ['id', 'itemId', 'itemTitle', 'type', 'fromState', 'toState', 'note', 'data', 'actor', 'createdAt'],
    'segments.csv': ['id', 'name', 'color', 'sortOrder', 'protected', 'allowedKinds', 'createdAt', 'deletedAt'],
    'users.csv': ['id', 'username', 'displayName', 'email', 'isOwner', 'digestEnabled', 'digestMorningEnabled', 'digestMorningTime', 'digestAfternoonEnabled', 'digestAfternoonTime', 'digestEveningEnabled', 'digestEveningTime', 'createdAt'],
  };
  return Object.entries(sets).map(([name, rows]) => ({
    name,
    data: toCsv(columns(first[name]), rows.map((r) => ({ ...r, allowedKinds: Array.isArray(r.allowedKinds) ? r.allowedKinds.join(' ') : r.allowedKinds }))),
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
