// Proves that a backup file can be restored, without touching your real database.
//   npm run backup:check -w backend -- path/to/radar-2026-11-01-0830.sql.gz
// It loads the file into a throw-away database that lives in memory, counts what came back,
// and checks that every table is still locked down (row level security on). Nothing is written anywhere.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { PGlite } from '@electric-sql/pglite';

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error('Usage: npm run backup:check -w backend -- path/to/backup.sql.gz');
  process.exit(1);
}
const raw = fs.readFileSync(file);
let text;
try {
  text = file.endsWith('.gz') ? zlib.gunzipSync(raw).toString('utf8') : raw.toString('utf8');
} catch (err) {
  console.error(`FAILED: the file is damaged or cut short (${err.message}).`);
  process.exit(1);
}
// Newer pg_dump versions add \restrict / \unrestrict lines that only psql understands; drop them (and nothing else)
const sql = text
  .split('\n')
  .filter((line) => !/^\\(un)?restrict(\s|$)/.test(line))
  .join('\n')
  .replace(/^CREATE SCHEMA public;$/m, 'CREATE SCHEMA IF NOT EXISTS public;');

const db = new PGlite();
try {
  await db.exec(sql);
} catch (err) {
  console.error(`FAILED: the backup did not load. ${err.message}`);
  process.exit(1);
}

const tables = (await db.query(`select c.relname as name, c.relrowsecurity as rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' order by 1`)).rows;
const required = ['households', 'users', 'segments', 'items', 'item_events', 'auth_sessions'];
const missing = required.filter((t) => !tables.some((x) => x.name === t));
let problems = missing.map((t) => `table "${t}" is missing`);

console.log(`Backup file: ${file} (${Math.round(raw.length / 1024)} KB)`);
console.log('');
for (const t of tables) {
  const n = (await db.query(`select count(*)::int as n from public."${t.name}"`)).rows[0].n;
  console.log(`  ${t.name.padEnd(24)} ${String(n).padStart(6)} rows   ${t.rls ? 'locked (RLS on)' : 'NOT LOCKED'}`);
  if (!t.rls) problems.push(`table "${t.name}" has row level security off`);
}
const item = (await db.query(`select count(*)::int as n from public.items where title is not null`)).rows[0].n;
const user = (await db.query(`select count(*)::int as n from public.users where password_hash is not null`)).rows[0].n;
console.log('');
console.log(`  people who can sign in (have a saved password): ${user}`);
console.log(`  items with a title: ${item}`);
if (user === 0) problems.push('no one has a saved password');

if (problems.length) {
  console.error(`\nPROBLEMS:\n - ${problems.join('\n - ')}`);
  process.exit(1);
}
console.log('\nOK: this backup restores cleanly.');
await db.close();
