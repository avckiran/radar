import { withTransaction } from './db.js';
import { HttpError } from './errors.js';
import { SEGMENT_COLORS } from './segmentColors.js';

const NAME_MAX = 60;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function validTimeZone(zone) {
  if (typeof zone !== 'string' || zone.length > 64 || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(zone)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export async function loadSettings(db, ctx) {
  const [household, me, members, segments, archived] = await Promise.all([
    db.query('select name, time_zone, nudge_days from households where id = $1', [ctx.householdId]),
    db.query(
      `select id, username, display_name, is_owner, to_char(digest_time, 'HH24:MI') as digest_time
         from users where id = $1 and household_id = $2`,
      [ctx.user.id, ctx.householdId]
    ),
    db.query(
      `select id, username, display_name, email, is_owner from users
        where household_id = $1 order by created_at, username`,
      [ctx.householdId]
    ),
    db.query(
      `select s.id, s.name, s.color, s.sort_order, s.protected, s.allowed_kinds,
              count(i.id)::int as item_count
         from segments s
         left join items i on i.segment_id = s.id and i.deleted_at is null
        where s.household_id = $1 and s.deleted_at is null
        group by s.id
        order by s.sort_order, s.name`,
      [ctx.householdId]
    ),
    db.query(
      `select count(*) filter (where deleted_at is null and state = 'done')::int as done,
              count(*) filter (where deleted_at is not null)::int as deleted
         from items where household_id = $1`,
      [ctx.householdId]
    ),
  ]);
  const hh = household.rows[0];
  const mine = me.rows[0];
  const a = archived.rows[0];
  return {
    household: { name: hh.name, timeZone: hh.time_zone, nudgeDays: hh.nudge_days },
    me: {
      id: mine.id,
      username: mine.username,
      displayName: mine.display_name,
      isOwner: mine.is_owner,
      digestTime: mine.digest_time,
    },
    members: members.rows.map((m) => ({
      id: m.id,
      username: m.username,
      displayName: m.display_name,
      email: m.email ?? null,
      isOwner: m.is_owner,
    })),
    segments: segments.rows.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      sortOrder: s.sort_order,
      protected: s.protected,
      allowedKinds: s.allowed_kinds,
      itemCount: s.item_count,
    })),
    colors: SEGMENT_COLORS,
    archived: { done: a.done, deleted: a.deleted, total: a.done + a.deleted },
  };
}

export async function updateSettings(db, ctx, input) {
  const body = input && typeof input === 'object' ? input : {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
  const hh = {};
  if (has('householdName')) {
    const name = typeof body.householdName === 'string' ? body.householdName.replace(/\s+/g, ' ').trim() : '';
    if (!name) throw new HttpError(400, 'Give the household a name.');
    if (name.length > NAME_MAX) throw new HttpError(400, `Keep the name under ${NAME_MAX + 1} characters.`);
    hh.name = name;
  }
  if (has('timeZone')) {
    if (!validTimeZone(body.timeZone)) throw new HttpError(400, 'That time zone isn’t one we know.');
    hh.time_zone = body.timeZone;
  }
  if (has('nudgeDays')) {
    const n = body.nudgeDays;
    if (!Number.isInteger(n) || n < 1 || n > 60) throw new HttpError(400, 'Nudge after a whole number of days from 1 to 60.');
    hh.nudge_days = n;
  }
  let digestTime = null;
  if (has('digestTime')) {
    if (typeof body.digestTime !== 'string' || !HHMM.test(body.digestTime)) {
      throw new HttpError(400, 'Pick a send time like 08:00.');
    }
    digestTime = body.digestTime;
  }
  if (Object.keys(hh).length === 0 && digestTime === null) throw new HttpError(400, 'Nothing to change.');

  await withTransaction(db, async (tx) => {
    const columns = Object.keys(hh);
    if (columns.length) {
      await tx.query(
        `update households set ${columns.map((c, i) => `${c} = $${i + 2}`).join(', ')} where id = $1`,
        [ctx.householdId, ...columns.map((c) => hh[c])]
      );
    }
    if (digestTime !== null) {
      await tx.query('update users set digest_time = $2, updated_at = now() where id = $1 and household_id = $3', [
        ctx.user.id,
        digestTime,
        ctx.householdId,
      ]);
    }
  });
  return loadSettings(db, { ...ctx, ...(hh.name ? { householdName: hh.name } : {}) });
}
