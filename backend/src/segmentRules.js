import { HttpError, isUuid } from './errors.js';

const PLURAL = { action: 'actions', note: 'notes', link: 'links' };

export async function findSegmentFor(tx, householdId, segmentId, kind) {
  if (!isUuid(segmentId)) throw new HttpError(400, 'That segment doesn’t exist.');
  const found = await tx.query(
    'select id, name, color, allowed_kinds from segments where id = $1 and household_id = $2 and deleted_at is null',
    [segmentId, householdId]
  );
  const segment = found.rows[0];
  if (!segment) throw new HttpError(400, 'That segment doesn’t exist.');
  if (!segment.allowed_kinds.includes(kind)) throw new HttpError(400, `${segment.name} doesn’t take ${PLURAL[kind]}.`);
  return segment;
}
