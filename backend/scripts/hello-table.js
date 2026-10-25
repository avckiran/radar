// Creates a tiny test table to prove the backend can use the database.
// Safe to run many times. Remove it later with: npm run db:hello -- --drop
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

try {
  if (process.argv.includes('--drop')) {
    await db.query('drop table if exists hello_world');
    console.log('hello_world table removed.');
  } else {
    await db.query(`create table if not exists hello_world (
      id bigint generated always as identity primary key,
      message text not null,
      created_at timestamptz not null default now()
    )`);
    // Row-level security on, with NO policies: Supabase's public API can read nothing.
    await db.query('alter table hello_world enable row level security');
    await db.query(
      `insert into hello_world (message)
       select 'Hello from Supabase' where not exists (select 1 from hello_world)`
    );

    const rls = await db.query(
      `select c.relrowsecurity as on,
              (select count(*) from pg_policies where tablename = 'hello_world') as policies
         from pg_class c where c.oid = 'public.hello_world'::regclass`
    );
    const role = await db.query(
      'select r.rolname, r.rolbypassrls from pg_roles r where r.rolname = current_user'
    );
    console.log(`hello_world is ready.`);
    console.log(`Row-level security: ${rls.rows[0].on ? 'ON' : 'OFF (unexpected!)'}; policies: ${rls.rows[0].policies}`);
    console.log(`Connected as role "${role.rows[0].rolname}" (bypasses row-level security: ${role.rows[0].rolbypassrls})`);
  }
} catch (err) {
  console.error('Could not finish:', err.code || '', err.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
