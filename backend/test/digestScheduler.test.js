import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import bcrypt from 'bcryptjs';
import { buildSeed } from '../src/seedData.js';
import { createDigestRunner, startDigestScheduler } from '../src/digest/scheduler.js';

// The scheduler against a real Postgres engine (PGlite) with the real migrations
const SEED_NOW = new Date('2026-10-26T15:00:00Z');
let pg, db, seed;
const quiet = { log() {}, warn() {}, error() {} };

async function insert(table, row) {
  const cols = Object.keys(row);
  const vals = cols.map((c) => (row[c] !== null && typeof row[c] === 'object' && !(row[c] instanceof Date) ? JSON.stringify(row[c]) : row[c]));
  await pg.query(`insert into ${table} (${cols.join(', ')}) values (${cols.map((_, i) => '$' + (i + 1)).join(', ')})`, vals);
}

before(async () => {
  pg = new PGlite({ parsers: { 1082: (v) => v } });
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
  for (const f of fs.readdirSync(dir).sort()) await pg.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  seed = buildSeed({ now: SEED_NOW });
  await insert('households', seed.household);
  for (const u of seed.users) {
    const { key, ...row } = u;
    await insert('users', { ...row, password_hash: bcrypt.hashSync('a long enough password', 4) });
  }
  for (const s of seed.segments) await insert('segments', s);
  for (const i of seed.items) {
    const { key, ...row } = i;
    await insert('items', row);
  }
  for (const e of seed.events) await insert('item_events', e);
  db = { query: (s, p) => pg.query(s, p) };
});

// Fresh start for every test: both people can get email at 8:00, the log is empty
beforeEach(async () => {
  await pg.query('delete from digest_log');
  await pg.query(`update users set email = username || '@example.com', digest_enabled = true, digest_time = '08:00'`);
  await pg.query(`update households set time_zone = 'America/New_York'`);
});

function fakeMailer({ failFirst = 0, alwaysFail = false } = {}) {
  const sent = [];
  let calls = 0;
  return {
    sent,
    get calls() {
      return calls;
    },
    async send(mail) {
      calls += 1;
      if (alwaysFail || calls <= failFirst) throw new Error('SMTP down');
      sent.push(mail);
    },
  };
}

// 2026-10-27 is during Eastern daylight time (UTC-4), so 08:00 Eastern is 12:00 UTC
const at = (iso) => () => new Date(iso);
const runner = (mailer, iso, extra = {}) => createDigestRunner({ db, mailer, appUrl: 'https://x.test/radar', now: at(iso), retryDelayMs: 0, log: quiet, ...extra });
const logRows = async () => (await pg.query('select u.username, d.status, d.attempts, d.error from digest_log d join users u on u.id = d.user_id order by u.username')).rows;

test('nothing is sent before the send time', async () => {
  const mail = fakeMailer();
  const r = await runner(mail, '2026-10-27T11:59:00Z').tick();
  assert.equal(r.sent, 0);
  assert.equal(mail.sent.length, 0);
  assert.equal((await logRows()).length, 0);
});

test('each person gets one digest once the time has passed, and it is logged', async () => {
  const mail = fakeMailer();
  const r = await runner(mail, '2026-10-27T12:05:00Z').tick();
  assert.equal(r.sent, 2);
  assert.deepEqual(mail.sent.map((m) => m.to).sort(), ['avckiran@example.com', 'koarora6@example.com']);
  assert.ok(mail.sent[0].subject && mail.sent[0].html && mail.sent[0].text);
  assert.deepEqual((await logRows()).map((x) => x.status), ['sent', 'sent']);
});

test('never twice in a day: later ticks and a brand new runner (a restart) send nothing more', async () => {
  const mail = fakeMailer();
  await runner(mail, '2026-10-27T12:05:00Z').tick();
  await runner(mail, '2026-10-27T12:20:00Z').tick();
  await runner(mail, '2026-10-27T14:00:00Z').tick();
  assert.equal(mail.sent.length, 2);
});

test('the next local day gets a new digest', async () => {
  const mail = fakeMailer();
  await runner(mail, '2026-10-27T12:05:00Z').tick();
  await runner(mail, '2026-10-28T12:05:00Z').tick();
  assert.equal(mail.sent.length, 4);
});

test('turned off or no email address: nothing is sent', async () => {
  await pg.query(`update users set digest_enabled = false where username = 'avckiran'`);
  await pg.query(`update users set email = null where username = 'koarora6'`);
  const mail = fakeMailer();
  await runner(mail, '2026-10-27T13:00:00Z').tick();
  assert.equal(mail.sent.length, 0);
});

test('changing the send time changes when it arrives', async () => {
  const mail = fakeMailer();
  await pg.query(`update users set digest_time = '09:30'`);
  await runner(mail, '2026-10-27T13:00:00Z').tick(); // 9:00 Eastern: not yet
  assert.equal(mail.sent.length, 0);
  await runner(mail, '2026-10-27T13:30:00Z').tick(); // 9:30 Eastern
  assert.equal(mail.sent.length, 2);
  // moving the time earlier after it was sent does not send again
  await pg.query(`update users set digest_time = '07:00'`);
  await runner(mail, '2026-10-27T14:00:00Z').tick();
  assert.equal(mail.sent.length, 2);
});

test('the household time zone decides the local time and date', async () => {
  const mail = fakeMailer();
  await pg.query(`update households set time_zone = 'America/Los_Angeles'`);
  await runner(mail, '2026-10-27T12:05:00Z').tick(); // 5:05 AM Pacific
  assert.equal(mail.sent.length, 0);
  await runner(mail, '2026-10-27T15:05:00Z').tick(); // 8:05 AM Pacific
  assert.equal(mail.sent.length, 2);
});

test('a failed send is retried once straight away, then logged as sent', async () => {
  const mail = fakeMailer({ failFirst: 1 });
  const r = await runner(mail, '2026-10-27T12:05:00Z').tick();
  assert.equal(r.sent, 2);
  assert.equal(mail.sent.length, 2);
  const rows = await logRows();
  assert.equal(rows[0].status, 'sent');
  assert.equal(rows[0].attempts, 2);
});

test('when the mail account stays broken it is logged as failed, retried on later ticks, then given up', async () => {
  const mail = fakeMailer({ alwaysFail: true });
  const r = await runner(mail, '2026-10-27T12:05:00Z').tick();
  assert.equal(r.failed, 2);
  let rows = await logRows();
  assert.equal(rows[0].status, 'failed');
  assert.match(rows[0].error, /SMTP down/);
  assert.equal(rows[0].attempts, 2);
  await runner(mail, '2026-10-27T12:20:00Z').tick();
  await runner(mail, '2026-10-27T12:35:00Z').tick();
  await runner(mail, '2026-10-27T12:50:00Z').tick(); // attempts are now at the limit
  rows = await logRows();
  assert.equal(rows[0].attempts, 6);
  const calls = mail.calls;
  await runner(mail, '2026-10-27T13:05:00Z').tick();
  assert.equal(mail.calls, calls, 'no more tries once the daily limit is used');
});

test('a failed day recovers when the mail account comes back', async () => {
  const bad = fakeMailer({ alwaysFail: true });
  await runner(bad, '2026-10-27T12:05:00Z').tick();
  const good = fakeMailer();
  await runner(good, '2026-10-27T12:20:00Z').tick();
  assert.equal(good.sent.length, 2);
  assert.deepEqual((await logRows()).map((x) => x.status), ['sent', 'sent']);
});

test('too late (server was off for hours): skipped and logged, not sent', async () => {
  const mail = fakeMailer();
  const r = await runner(mail, '2026-10-27T19:30:00Z').tick(); // 3:30 PM Eastern, 7.5 hours late
  assert.equal(r.sent, 0);
  assert.equal(r.skipped, 2);
  assert.equal(mail.sent.length, 0);
  assert.deepEqual((await logRows()).map((x) => x.status), ['skipped', 'skipped']);
});

test('a skipped day can still be sent if the send time is moved to later that day', async () => {
  const mail = fakeMailer();
  await runner(mail, '2026-10-27T19:30:00Z').tick();
  await pg.query(`update users set digest_time = '15:00'`);
  await runner(mail, '2026-10-27T19:30:00Z').tick();
  assert.equal(mail.sent.length, 2);
});

test('a claim left "sending" by a crash is never retried, so it can never go out twice', async () => {
  const mail = fakeMailer();
  await pg.query(
    `insert into digest_log (user_id, local_date, status, attempts, claimed_at, sent_at)
     select id, '2026-10-27', 'sending', 0, '2026-10-27T12:01:00Z', '2026-10-27T12:01:00Z' from users where username = 'avckiran'`
  );
  await runner(mail, '2026-10-27T12:05:00Z').tick(); // claim is fresh: left alone
  assert.deepEqual(mail.sent.map((m) => m.to), ['koarora6@example.com']);
  await runner(mail, '2026-10-27T12:30:00Z').tick(); // claim is now stale: marked failed, not sent
  assert.equal(mail.sent.length, 1);
  const rows = await logRows();
  assert.equal(rows[0].status, 'failed');
  assert.match(rows[0].error, /stopped while sending/);
});

test('two checks at the same moment cannot double send', async () => {
  const mail = fakeMailer();
  const a = runner(mail, '2026-10-27T12:05:00Z');
  const b = runner(mail, '2026-10-27T12:05:00Z');
  await Promise.all([a.tick(), b.tick(), a.tick()]);
  assert.equal(mail.sent.length, 2);
});

test('the scheduler start function runs a check and can be stopped', async () => {
  let ticks = 0;
  const stop = startDigestScheduler({ tick: async () => { ticks += 1; } }, { intervalMs: 20, firstDelayMs: 5, log: quiet });
  await new Promise((r) => setTimeout(r, 80));
  stop();
  const seen = ticks;
  assert.ok(seen >= 2);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(ticks, seen);
});
