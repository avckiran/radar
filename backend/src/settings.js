import { withTransaction } from './db.js';
import { HttpError } from './errors.js';
import { SEGMENT_COLORS } from './segmentColors.js';

const NAME_MAX = 60;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

// The three daily emails. Morning keeps the original digest_time column.
export const SLOTS = ['morning', 'afternoon', 'evening'];
const SLOT_COLUMNS = {
  morning: { enabled: 'digest_morning_enabled', time: 'digest_time' },
  afternoon: { enabled: 'digest_afternoon_enabled', time: 'digest_afternoon_time' },
  evening: { enabled: 'digest_evening_enabled', time: 'digest_evening_time' },
};

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
      `select id, username, display_name, is_owner, email, digest_enabled,
              digest_morning_enabled, to_char(digest_time, 'HH24:MI') as digest_time,
              digest_afternoon_enabled, to_char(digest_afternoon_time, 'HH24:MI') as digest_afternoon_time,
              digest_evening_enabled, to_char(digest_evening_time, 'HH24:MI') as digest_evening_time
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
      digestEnabled: mine.digest_enabled,
      digestSlots: {
        morning: { enabled: mine.digest_morning_enabled, time: mine.digest_time },
        afternoon: { enabled: mine.digest_afternoon_enabled, time: mine.digest_afternoon_time },
        evening: { enabled: mine.digest_evening_enabled, time: mine.digest_evening_time },
      },
      hasEmail: Boolean(mine.email),
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
  // Everything that lives on the person's own row: column name -> new value
  const mine = {};
  const pickTime = (value) => {
    if (typeof value !== 'string' || !HHMM.test(value)) throw new HttpError(400, 'Pick a send time like 08:00.');
    return value;
  };
  if (has('digestTime')) mine[SLOT_COLUMNS.morning.time] = pickTime(body.digestTime);
  if (has('digestEnabled')) {
    if (typeof body.digestEnabled !== 'boolean') throw new HttpError(400, 'Choose on or off for the daily digest.');
    mine.digest_enabled = body.digestEnabled;
  }
  if (has('digestSlots')) {
    const slots = body.digestSlots;
    if (slots === null || typeof slots !== 'object' || Array.isArray(slots)) throw new HttpError(400, 'Choose the emails to send.');
    for (const [name, change] of Object.entries(slots)) {
      if (!SLOTS.includes(name)) throw new HttpError(400, `There is no "${name}" email. Choose morning, afternoon or evening.`);
      if (change === null || typeof change !== 'object' || Array.isArray(change)) throw new HttpError(400, 'Choose on or off and a time.');
      if ('enabled' in change) {
        if (typeof change.enabled !== 'boolean') throw new HttpError(400, `Choose on or off for the ${name} email.`);
        mine[SLOT_COLUMNS[name].enabled] = change.enabled;
      }
      if ('time' in change) mine[SLOT_COLUMNS[name].time] = pickTime(change.time);
    }
  }
  if (Object.keys(hh).length === 0 && Object.keys(mine).length === 0) throw new HttpError(400, 'Nothing to change.');

  await withTransaction(db, async (tx) => {
    const columns = Object.keys(hh);
    if (columns.length) {
      await tx.query(
        `update households set ${columns.map((c, i) => `${c} = $${i + 2}`).join(', ')} where id = $1`,
        [ctx.householdId, ...columns.map((c) => hh[c])]
      );
    }
    const own = Object.keys(mine);
    if (own.length) {
      await tx.query(
        `update users set ${own.map((c, i) => `${c} = $${i + 3}`).join(', ')}, updated_at = now() where id = $1 and household_id = $2`,
        [ctx.user.id, ctx.householdId, ...own.map((c) => mine[c])]
      );
    }
  });
  return loadSettings(db, { ...ctx, ...(hh.name ? { householdName: hh.name } : {}) });
}
