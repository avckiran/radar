import { withTransaction } from './db.js';

// One-time clean-up: remove every item and its history. People, passwords, settings, segments,
// sign-in sessions and the daily-email log are left exactly as they are.
export async function describeItems(db) {
  const states = await db.query(`select state, count(*)::int as n from items where deleted_at is null group by state order by state`);
  const one = async (sql) => (await db.query(sql)).rows[0].n;
  return {
    items: await one('select count(*)::int as n from items'),
    deleted: await one('select count(*)::int as n from items where deleted_at is not null'),
    byState: Object.fromEntries(states.rows.map((r) => [r.state, r.n])),
    events: await one('select count(*)::int as n from item_events'),
    segments: await one('select count(*)::int as n from segments where deleted_at is null'),
    users: await one('select count(*)::int as n from users'),
  };
}

// `expectedItems` is the count the person was shown; if it changed meanwhile, nothing is deleted.
export async function clearItems(db, { expectedItems }) {
  return withTransaction(db, async (tx) => {
    const now = (await tx.query('select count(*)::int as n from items')).rows[0].n;
    if (now !== expectedItems) {
      throw new Error(`The number of items changed from ${expectedItems} to ${now} while you were deciding. Nothing was deleted; run it again.`);
    }
    const events = await tx.query('delete from item_events');
    const items = await tx.query('delete from items');
    return { items: items.rowCount, events: events.rowCount };
  });
}
