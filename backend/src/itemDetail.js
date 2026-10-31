import { HttpError, isUuid } from './errors.js';
import { ITEM_COLUMNS, ITEM_JOINS } from './queries.js';
import { buildDetail } from './rules/itemView.js';

export async function loadDetail(db, { householdId, timeZone }, itemId, now) {
  if (!isUuid(itemId)) throw new HttpError(404, 'Item not found.');
  const found = await db.query(
    `select ${ITEM_COLUMNS}
       from items i
       ${ITEM_JOINS}
      where i.id = $1 and i.household_id = $2 and i.deleted_at is null`,
    [itemId, householdId]
  );
  const item = found.rows[0];
  if (!item) throw new HttpError(404, 'Item not found.');
  const events = await db.query(
    `select e.id, e.type, e.from_state, e.to_state, e.note, e.data, e.created_at, a.display_name as actor
       from item_events e
       left join users a on a.id = e.actor_id
      where e.item_id = $1
      order by e.created_at asc, e.id`,
    [itemId]
  );
  return buildDetail({ item, events: events.rows, now, timeZone });
}
