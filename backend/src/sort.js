import { withTransaction } from './db.js';
import { isValidYmd } from './dates.js';
import { HttpError, isUuid } from './errors.js';
import { findSegmentFor } from './segmentRules.js';

export async function sortItem(db, { householdId, actorId, itemId, segmentId, dueDate }) {
  if (!isUuid(itemId)) throw new HttpError(404, 'Item not found.');
  if (!segmentId) throw new HttpError(400, 'Pick a segment first.');
  if (dueDate != null && dueDate !== '' && (!isValidYmd(dueDate) || dueDate < '2000-01-01' || dueDate > '2100-12-31')) {
    throw new HttpError(400, 'That due date isn’t valid.');
  }
  return withTransaction(db, async (tx) => {
    const found = await tx.query(
      `select id, kind, state from items where id = $1 and household_id = $2 and deleted_at is null for update`,
      [itemId, householdId]
    );
    const item = found.rows[0];
    if (!item) throw new HttpError(404, 'Item not found.');
    if (item.state !== 'inbox') throw new HttpError(409, 'That item has already been sorted. The list has been refreshed.');
    const segment = await findSegmentFor(tx, householdId, segmentId, item.kind);
    const due = item.kind === 'action' && dueDate ? dueDate : null;

    await tx.query(
      `update items set segment_id = $2, state = 'active', due_date = $3, updated_at = now() where id = $1`,
      [itemId, segment.id, due]
    );
    await tx.query(
      `insert into item_events (item_id, household_id, type, from_state, to_state, data, actor_id)
       values ($1, $2, 'state_change', 'inbox', 'active', $3, $4)`,
      [itemId, householdId, JSON.stringify({ segmentId: segment.id, segmentName: segment.name, dueDate: due }), actorId]
    );
    return { id: itemId, state: 'active', segmentName: segment.name };
  });
}
