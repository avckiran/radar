import { withTransaction } from './db.js';
import { HttpError, isUuid } from './errors.js';
import { isSegmentColor } from './segmentColors.js';

export const NAME_MAX = 40;

const PLURAL = { action: 'actions', note: 'notes', link: 'links' };

export function cleanSegmentName(raw) {
  const name = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  if (!name) throw new HttpError(400, 'Give the segment a name.');
  if (name.length > NAME_MAX) throw new HttpError(400, `Keep the name under ${NAME_MAX + 1} characters.`);
  return name;
}

function duplicate(name) {
  return new HttpError(409, `You already have a segment called “${name}”.`);
}

function checkColor(color) {
  if (!isSegmentColor(color)) throw new HttpError(400, 'Pick one of the twelve segment colors.');
}

async function lockSegment(tx, householdId, id) {
  if (!isUuid(id)) throw new HttpError(404, 'Segment not found.');
  const found = await tx.query(
    `select id, name, color, protected, allowed_kinds from segments
      where id = $1 and household_id = $2 and deleted_at is null for update`,
    [id, householdId]
  );
  if (!found.rows[0]) throw new HttpError(404, 'Segment not found.');
  return found.rows[0];
}

async function nameTaken(tx, householdId, name, exceptId = null) {
  const found = await tx.query(
    `select 1 from segments
      where household_id = $1 and lower(name) = lower($2) and deleted_at is null
        and ($3::uuid is null or id <> $3::uuid)`,
    [householdId, name, exceptId]
  );
  return found.rows.length > 0;
}

function mapUnique(err, name) {
  if (err?.code === '23505') throw duplicate(name);
  throw err;
}

export async function createSegment(db, { householdId }, input) {
  const body = input && typeof input === 'object' ? input : {};
  const name = cleanSegmentName(body.name);
  checkColor(body.color);
  try {
    return await withTransaction(db, async (tx) => {
      if (await nameTaken(tx, householdId, name)) throw duplicate(name);
      const made = await tx.query(
        `insert into segments (household_id, name, color, sort_order)
         values ($1, $2, $3, coalesce((select max(sort_order) + 1 from segments where household_id = $1 and deleted_at is null), 0))
         returning id, name, color, sort_order as "sortOrder", protected`,
        [householdId, name, body.color]
      );
      return { ...made.rows[0], itemCount: 0 };
    });
  } catch (err) {
    mapUnique(err, name);
  }
}

export async function updateSegment(db, { householdId }, id, input) {
  const body = input && typeof input === 'object' ? input : {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
  if (!has('name') && !has('color')) throw new HttpError(400, 'Nothing to change.');
  const name = has('name') ? cleanSegmentName(body.name) : null;
  if (has('color')) checkColor(body.color);
  try {
    return await withTransaction(db, async (tx) => {
      const segment = await lockSegment(tx, householdId, id);
      if (name !== null && (await nameTaken(tx, householdId, name, segment.id))) throw duplicate(name);
      const updated = await tx.query(
        `update segments set name = $2, color = $3, updated_at = now()
          where id = $1
          returning id, name, color, sort_order as "sortOrder", protected`,
        [segment.id, name ?? segment.name, has('color') ? body.color : segment.color]
      );
      return updated.rows[0];
    });
  } catch (err) {
    mapUnique(err, name);
  }
}

export async function reorderSegments(db, { householdId }, input) {
  const ids = Array.isArray(input?.ids) ? input.ids : null;
  if (!ids || !ids.every(isUuid) || new Set(ids).size !== ids.length) {
    throw new HttpError(400, 'That order couldn’t be read.');
  }
  await withTransaction(db, async (tx) => {
    const live = await tx.query(
      'select id from segments where household_id = $1 and deleted_at is null for update',
      [householdId]
    );
    const liveIds = live.rows.map((r) => r.id);
    if (liveIds.length !== ids.length || !liveIds.every((id) => ids.includes(id))) {
      throw new HttpError(409, 'The segment list changed. Reload and try again.');
    }
    await tx.query(
      `update segments s set sort_order = v.ord - 1, updated_at = now()
         from unnest($2::uuid[]) with ordinality as v(id, ord)
        where s.id = v.id and s.household_id = $1`,
      [householdId, ids]
    );
  });
  return { ids };
}

export async function deleteSegment(db, { householdId, actorId }, id, input) {
  const body = input && typeof input === 'object' ? input : {};
  return withTransaction(db, async (tx) => {
    const segment = await lockSegment(tx, householdId, id);
    if (segment.protected) throw new HttpError(400, `${segment.name} can’t be deleted.`);

    const counts = await tx.query(
      `select kind, count(*)::int as n from items
        where segment_id = $1 and household_id = $2 and deleted_at is null group by kind`,
      [segment.id, householdId]
    );
    const total = counts.rows.reduce((sum, r) => sum + r.n, 0);
    let moved = 0;
    let deleted = 0;

    if (total > 0) {
      if (body.deleteItems === true) {
        const gone = await tx.query(
          `with gone as (
             update items set deleted_at = now(), updated_at = now()
              where segment_id = $1 and household_id = $2 and deleted_at is null
              returning id, state
           )
           insert into item_events (item_id, household_id, type, from_state, note, data, actor_id, created_at)
           select id, $2, 'deleted', state, $3, '{}'::jsonb, $4, clock_timestamp() from gone
           returning item_id`,
          [segment.id, householdId, `Deleted with the ${segment.name} segment`, actorId]
        );
        deleted = gone.rowCount;
      } else if (body.moveTo !== undefined && body.moveTo !== null) {
        if (!isUuid(body.moveTo) || body.moveTo === segment.id) throw new HttpError(400, 'Pick another segment for these items.');
        const target = await tx.query(
          `select id, name, allowed_kinds from segments
            where id = $1 and household_id = $2 and deleted_at is null`,
          [body.moveTo, householdId]
        );
        const to = target.rows[0];
        if (!to) throw new HttpError(400, 'Pick another segment for these items.');
        for (const { kind } of counts.rows) {
          if (!to.allowed_kinds.includes(kind)) throw new HttpError(400, `${to.name} doesn’t take ${PLURAL[kind]}.`);
        }
        const done = await tx.query(
          `with moved as (
             update items set segment_id = $3, updated_at = now()
              where segment_id = $1 and household_id = $2 and deleted_at is null
              returning id, state
           )
           insert into item_events (item_id, household_id, type, from_state, to_state, note, data, actor_id, created_at)
           select id, $2, 'edited', state, state, $4,
                  jsonb_build_object('field', 'segment', 'from', $1::text, 'to', $3::text), $5, clock_timestamp()
             from moved
           returning item_id`,
          [segment.id, householdId, to.id, `Moved to ${to.name}`, actorId]
        );
        moved = done.rowCount;
      } else {
        throw new HttpError(409, `${segment.name} has ${total} ${total === 1 ? 'item' : 'items'}. Choose where they should go.`);
      }
    }

    await tx.query('update segments set deleted_at = now(), updated_at = now() where id = $1', [segment.id]);
    return { id: segment.id, moved, deleted };
  });
}
