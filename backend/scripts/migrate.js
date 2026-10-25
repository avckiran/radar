import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config.js';
import { createPool } from '../src/db.js';

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

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

const client = await db.connect().catch((err) => {
  console.error('Could not connect:', err.code || '', err.message);
  process.exit(1);
});

try {

  await client.query(`create table if not exists schema_migrations (
    name text primary key, applied_at timestamptz not null default now())`);
  await client.query('alter table schema_migrations enable row level security');

  const done = new Set((await client.query('select name from schema_migrations')).rows.map((r) => r.name));
  let applied = 0;
  for (const file of files) {
    if (done.has(file)) continue;
    console.log(`Applying ${file} ...`);
    await client.query('begin');
    try {
      await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
      await client.query('insert into schema_migrations (name) values ($1)', [file]);
      await client.query('commit');
      applied++;
    } catch (err) {
      await client.query('rollback');
      throw err;
    }
  }
  console.log(applied ? `Applied ${applied} migration(s).` : 'Nothing to do: the database is up to date.');

  const { rows } = await client.query(`
    select c.relname as "table", c.relrowsecurity as rls,
           (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)::int as policies
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
     order by c.relname`);
  console.table(rows.map((r) => ({ table: r.table, 'row-level security': r.rls ? 'ON' : 'OFF (!)', policies: r.policies })));
  if (rows.some((r) => !r.rls || r.policies > 0)) {
    console.error('Warning: a table has row-level security off or has policies. Fix before going further.');
    process.exitCode = 1;
  }
} catch (err) {
  console.error('Migration failed:', err.code || '', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await db.end();
}
