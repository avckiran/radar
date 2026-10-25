import { config } from '../src/config.js';
import { createPool } from '../src/db.js';
import { buildSeed } from '../src/seedData.js';

if (!config.databaseUrl) {
  console.error('DATABASE_URL is not set. Copy backend/.env.example to backend/.env first.');
  process.exit(1);
}
let db;
try {
  db = createPool(config);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
const reset = process.argv.includes('--reset');

async function insert(client, table, row) {
  const cols = Object.keys(row);
  const values = cols.map((c) => (row[c] !== null && typeof row[c] === 'object' && !(row[c] instanceof Date) ? JSON.stringify(row[c]) : row[c]));
  const marks = cols.map((_, i) => `$${i + 1}`).join(', ');
  const res = await client.query(
    `insert into ${table} (${cols.join(', ')}) values (${marks}) on conflict (id) do nothing`,
    values
  );
  return res.rowCount;
}

const client = await db.connect().catch((err) => {
  console.error('Could not connect:', err.code || '', err.message);
  process.exit(1);
});

try {

  const existing = await client.query('select time_zone from households order by created_at limit 1');
  const seed = buildSeed({ now: new Date(), timeZone: existing.rows[0]?.time_zone || 'America/New_York' });

  await client.query('begin');
  if (reset) {
    await client.query('delete from items where id = any($1)', [seed.items.map((i) => i.id)]);
    console.log('Removed existing sample items.');
  }
  const added = { households: 0, users: 0, segments: 0, items: 0, events: 0 };
  added.households += await insert(client, 'households', seed.household);
  for (const u of seed.users) {
    const { key, ...row } = u;
    added.users += await insert(client, 'users', row);
  }
  for (const s of seed.segments) added.segments += await insert(client, 'segments', s);
  for (const i of seed.items) {
    const { key, ...row } = i;
    added.items += await insert(client, 'items', row);
  }
  for (const e of seed.events) added.events += await insert(client, 'item_events', e);
  await client.query('commit');
  console.log('Added this run:', added);

  const counts = await client.query(`
    select 'households' as what, count(*)::int as n from households union all
    select 'users', count(*)::int from users union all
    select 'segments', count(*)::int from segments union all
    select 'items', count(*)::int from items union all
    select 'item_events', count(*)::int from item_events order by 1`);
  console.table(counts.rows);
  const byState = await client.query(`select kind, state, count(*)::int as n from items group by 1, 2 order by 1, 2`);
  console.table(byState.rows);
} catch (err) {
  await client.query('rollback').catch(() => {});
  console.error('Seeding failed:', err.code || '', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await db.end();
}
