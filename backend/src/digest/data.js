import { ITEM_COLUMNS, ITEM_JOINS } from '../queries.js';

// What the digest needs from one household: every open item, and what was finished in the last 8 days
export async function loadDigestData(db, householdId, now) {
  const since = new Date(now.getTime() - 8 * 24 * 3600 * 1000);
  const open = await db.query(
    `select ${ITEM_COLUMNS}
       from items i
       ${ITEM_JOINS}
      where i.household_id = $1 and i.deleted_at is null and i.state <> 'done'`,
    [householdId]
  );
  const done = await db.query(
    `select ${ITEM_COLUMNS}
       from items i
       ${ITEM_JOINS}
      where i.household_id = $1 and i.deleted_at is null and i.state = 'done' and i.completed_at >= $2
      order by i.completed_at desc, i.title`,
    [householdId, since]
  );
  return {
    openItems: open.rows,
    doneItems: done.rows,
    inboxCount: open.rows.filter((i) => i.state === 'inbox').length,
  };
}
