import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.join(here, '..');
const deploy = path.join(backend, '..', 'deploy');
const hasBash = spawnSync('bash', ['--version']).status === 0;

// A tiny backup in the same shape pg_dump produces (plain SQL, column inserts, a psql-only line, "CREATE SCHEMA public;")
const TABLES = ['households', 'users', 'segments', 'items', 'item_events', 'auth_sessions'];
function sampleDump({ lock = true, withUser = true } = {}) {
  const create = TABLES.map((t) => `CREATE TABLE public.${t} (id integer PRIMARY KEY, title text, password_hash text);`).join('\n');
  const rls = lock ? TABLES.map((t) => `ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`).join('\n') : '';
  return `--
-- PostgreSQL database dump
--
\\restrict abc123
SET statement_timeout = 0;
CREATE SCHEMA public;
${create}
INSERT INTO public.households (id, title) VALUES (1, 'Home');
INSERT INTO public.users (id, title, password_hash) VALUES (1, 'Chandra', ${withUser ? "'$2a$10$hash'" : 'NULL'});
INSERT INTO public.items (id, title) VALUES (1, 'It''s a "test"
with a second line');
${rls}
\\unrestrict abc123
`;
}

function runCheck(file) {
  return spawnSync(process.execPath, [path.join(backend, 'scripts', 'backup-check.js'), file], { encoding: 'utf8' });
}
function tmpFile(name, data) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-backup-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, data);
  return file;
}

test('backup:check accepts a good backup and reports what came back', () => {
  const file = tmpFile('good.sql.gz', zlib.gzipSync(sampleDump()));
  const out = runCheck(file);
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /items\s+1 rows\s+locked \(RLS on\)/);
  assert.match(out.stdout, /people who can sign in \(have a saved password\): 1/);
  assert.match(out.stdout, /OK: this backup restores cleanly/);
});

test('backup:check rejects damaged, unlocked and password-less backups', () => {
  const cut = tmpFile('cut.sql.gz', zlib.gzipSync(sampleDump()).subarray(0, 60));
  assert.equal(runCheck(cut).status, 1);
  assert.match(runCheck(cut).stderr, /damaged or cut short/);

  const open = runCheck(tmpFile('open.sql', sampleDump({ lock: false })));
  assert.equal(open.status, 1);
  assert.match(open.stderr, /row level security off/);

  const nobody = runCheck(tmpFile('nobody.sql', sampleDump({ withUser: false })));
  assert.equal(nobody.status, 1);
  assert.match(nobody.stderr, /no one has a saved password/);

  const missing = runCheck('/nonexistent/file.sql.gz');
  assert.equal(missing.status, 1);
});

test('deploy scripts have valid shell syntax', { skip: !hasBash }, () => {
  for (const name of ['backup.sh', 'restore.sh', 'update.sh', 'pull-backup.sh', 'lib-dburl.sh']) {
    execFileSync('bash', ['-n', path.join(deploy, name)]);
  }
});

test('the database address is split into settings without exposing odd characters', { skip: !hasBash }, () => {
  const script = `. "${path.join(deploy, 'lib-dburl.sh')}"; export_pg_env "$URL" && printf '%s|%s|%s|%s|%s|%s' "$PGHOST" "$PGPORT" "$PGUSER" "$PGPASSWORD" "$PGDATABASE" "$PGSSLMODE"`;
  const url = "postgresql://postgres.abc:p%40ss'w%24rd%20x@aws-0-us.pooler.supabase.com:5432/postgres?sslmode=require";
  const out = execFileSync('bash', ['-c', script], { env: { ...process.env, URL: url }, encoding: 'utf8' });
  assert.equal(out, "aws-0-us.pooler.supabase.com|5432|postgres.abc|p@ss'w$rd x|postgres|require");
});

test('a bad address stops the backup helper with a message', { skip: !hasBash }, () => {
  const script = `. "${path.join(deploy, 'lib-dburl.sh')}"; export_pg_env "not a url"`;
  const r = spawnSync('bash', ['-c', script], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
});

test('backup.sh stops cleanly when it cannot read the settings or find pg_dump', { skip: !hasBash }, () => {
  const noEnv = spawnSync('bash', [path.join(deploy, 'backup.sh')], { encoding: 'utf8', env: { ...process.env, RADAR_ENV_FILE: '/nonexistent/.env' } });
  assert.equal(noEnv.status, 1);
  assert.match(noEnv.stderr, /BACKUP FAILED: cannot read/);

  const envFile = tmpFile('.env', 'DATABASE_URL=postgresql://u:p@localhost:5432/db\n');
  const noDump = spawnSync('bash', [path.join(deploy, 'backup.sh')], { encoding: 'utf8', env: { ...process.env, RADAR_ENV_FILE: envFile, PG_DUMP: 'definitely-not-installed-pg-dump' } });
  assert.equal(noDump.status, 1);
  assert.match(noDump.stderr, /pg_dump is not installed/);
});

test('restore.sh refuses to run without an explicit target', { skip: !hasBash }, () => {
  const file = tmpFile('x.sql', 'select 1;');
  const env = { ...process.env };
  delete env.RESTORE_DATABASE_URL;
  const r = spawnSync('bash', [path.join(deploy, 'restore.sh'), file], { encoding: 'utf8', env });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /RESTORE_DATABASE_URL/);
});

test('the service files point at the right places and keep the app boxed in', () => {
  const read = (n) => fs.readFileSync(path.join(deploy, n), 'utf8');
  const api = read('radar-api.service');
  assert.match(api, /^User=radar$/m);
  assert.match(api, /^Restart=always$/m);
  assert.match(api, /^Environment=HOST=127\.0\.0\.1$/m);
  assert.match(api, /^WorkingDirectory=\/opt\/radar\/backend$/m);
  assert.match(read('radar-backup.service'), /^OnFailure=radar-backup-failed\.service$/m);
  assert.match(read('radar-backup.timer'), /^Persistent=true$/m);
  assert.doesNotMatch(read('radar-backup-failed.service'), /password|PASS=/i);
});

test('no deploy file contains a real-looking database address', () => {
  const realLooking = /postgres(?:ql)?:\/\/[^\s:@'"]+:(?!PASSWORD|password)[^\s@'"]{6,}@/;
  for (const name of fs.readdirSync(deploy)) {
    const text = fs.readFileSync(path.join(deploy, name), 'utf8');
    // The tests' own example addresses are fine; the files in deploy/ must only show placeholders
    assert.doesNotMatch(text, realLooking, name);
  }
});
