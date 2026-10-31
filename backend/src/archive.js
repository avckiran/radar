import { withTransaction } from './db.js';
import { HttpError } from './errors.js';

// "Archived" means finished (done) items plus items that were deleted. Their history goes with them.
export async function deleteArchived(db, ctx, input) {
  if (!ctx.user.isOwner) throw new HttpError(403, 'Only the owner can do that.');
  const expected = input && typeof input === 'object' ? input.count : undefined;
  return withTransaction(db, async (tx) => {
    const found = await tx.query(
      `select id from items
        where household_id = $1 and (deleted_at is not null or state = 'done') for update`,
      [ctx.householdId]
    );
    if (expected !== undefined && expected !== found.rows.length) {
      throw new HttpError(409, 'The archive changed while you were looking at it. Check the new count and try again.');
    }
    if (found.rows.length) {
      await tx.query('delete from items where household_id = $1 and id = any($2::uuid[])', [
        ctx.householdId,
        found.rows.map((r) => r.id),
      ]);
    }
    return { deleted: found.rows.length };
  });
}
