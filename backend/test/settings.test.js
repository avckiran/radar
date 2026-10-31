import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { buildSeed } from '../src/seedData.js';

// Settings against a real Postgres engine (PGlite) with the real migrations
const NOW = new Date('2026-10-26T15:00:00Z');
let pg, server, base, seed, token;

async function call(method, url, body, raw = false) {
  const res = await fetch(base + url, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (raw) return { status: res.status, buf: Buffer.from(await res.arrayBuffer()), headers: res.headers };
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, body: json, headers: res.headers };
}

async function insert(table, row) {
  const cols = Object.keys(row);
  const vals = cols.map((c) => (row[c] !== null && typeof row[c] === 'object' && !(row[c] instanceof Date) ? JSON.stringify(row[c]) : row[c]));
  await pg.query(`insert into ${table} (${cols.join(', ')}) values (${cols.map((_, i) => '$' + (i + 1)).join(', ')})`, vals);
}

before(async () => {
  pg = new PGlite({ parsers: { 1082: (v) => v } });
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
  for (const f of fs.readdirSync(dir).sort()) await pg.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  seed = buildSeed({ now: NOW });
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
  const db = { query: (s, p) => pg.query(s, p), connect: async () => ({ query: (s, p) => pg.query(s, p), release() {} }) };
  const app = createApp({ db, corsOrigins: [], now: () => NOW, jwtSecret: 'test-secret-test-secret-test-secret-123456' });
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  base = `http://localhost:${server.address().port}`;
  const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'avckiran', password: 'a long enough password' }) });
  token = (await login.json()).token;
});

after(async () => {
  await new Promise((r) => server.close(r));
});

test('household settings are validated and saved', async () => {
  const ok = await call('PATCH', '/api/settings', { householdName: ' Arora   Home ', nudgeDays: 3, digestTime: '07:30', timeZone: 'America/Chicago' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.household.name, 'Arora Home');
  assert.equal(ok.body.household.nudgeDays, 3);
  assert.equal(ok.body.household.timeZone, 'America/Chicago');
  assert.equal(ok.body.me.digestTime, '07:30');
  for (const bad of [{ nudgeDays: 0 }, { nudgeDays: 61 }, { nudgeDays: 2.5 }, { timeZone: 'Mars/Base' }, { digestTime: '25:00' }, { householdName: '  ' }, {}]) {
    assert.equal((await call('PATCH', '/api/settings', bad)).status, 400, JSON.stringify(bad));
  }
  await call('PATCH', '/api/settings', { nudgeDays: 5, timeZone: 'America/New_York', digestTime: '08:00' });
});

test('the daily email can be switched off and on, and only with a real true or false', async () => {
  const first = await call('GET', '/api/settings');
  assert.equal(first.body.me.digestEnabled, true);
  assert.equal(first.body.me.hasEmail, false);
  const off = await call('PATCH', '/api/settings', { digestEnabled: false });
  assert.equal(off.status, 200);
  assert.equal(off.body.me.digestEnabled, false);
  for (const bad of [{ digestEnabled: 'no' }, { digestEnabled: 0 }, { digestEnabled: null }]) {
    assert.equal((await call('PATCH', '/api/settings', bad)).status, 400, JSON.stringify(bad));
  }
  const on = await call('PATCH', '/api/settings', { digestEnabled: true });
  assert.equal(on.body.me.digestEnabled, true);
});

test('the three daily emails each have their own switch and time', async () => {
  const first = (await call('GET', '/api/settings')).body.me.digestSlots;
  assert.deepEqual(first, {
    morning: { enabled: true, time: '08:00' },
    afternoon: { enabled: true, time: '14:00' },
    evening: { enabled: true, time: '18:00' },
  });
  const changed = await call('PATCH', '/api/settings', { digestSlots: { afternoon: { enabled: false }, evening: { time: '19:30' } } });
  assert.equal(changed.status, 200);
  assert.deepEqual(changed.body.me.digestSlots, {
    morning: { enabled: true, time: '08:00' },
    afternoon: { enabled: false, time: '14:00' },
    evening: { enabled: true, time: '19:30' },
  });
  // the old morning field still works and stays in step
  const morning = await call('PATCH', '/api/settings', { digestSlots: { morning: { time: '07:00' } } });
  assert.equal(morning.body.me.digestTime, '07:00');
  for (const bad of [
    { digestSlots: { lunch: { enabled: true } } },
    { digestSlots: { morning: { enabled: 'yes' } } },
    { digestSlots: { morning: { time: '7am' } } },
    { digestSlots: { evening: { time: '24:00' } } },
    { digestSlots: [] },
    { digestSlots: null },
    { digestSlots: { morning: null } },
  ]) {
    assert.equal((await call('PATCH', '/api/settings', bad)).status, 400, JSON.stringify(bad));
  }
  // nothing half-saved by a bad request
  assert.equal((await call('GET', '/api/settings')).body.me.digestSlots.evening.time, '19:30');
  // put things back for the tests that follow
  await call('PATCH', '/api/settings', { digestSlots: { morning: { time: '08:00' }, afternoon: { enabled: true }, evening: { time: '18:00' } } });
});

test('changing the nudge days changes what Home shows', async () => {
  const five = JSON.stringify((await call('GET', '/api/home')).body);
  await call('PATCH', '/api/settings', { nudgeDays: 1 });
  const one = JSON.stringify((await call('GET', '/api/home')).body);
  await call('PATCH', '/api/settings', { nudgeDays: 5 });
  assert.notEqual(five, one);
});

test('segments: create, rename, recolor, duplicate names, reorder', async () => {
  const made = await call('POST', '/api/segments', { name: 'Travel', color: 'sky' });
  assert.equal(made.status, 201);
  assert.equal((await call('POST', '/api/segments', { name: 'travel', color: 'sky' })).status, 409);
  assert.equal((await call('POST', '/api/segments', { name: 'X', color: 'pink' })).status, 400);
  const renamed = await call('PATCH', `/api/segments/${made.body.id}`, { name: 'Trips', color: 'rose' });
  assert.equal(renamed.body.color, 'rose');
  assert.equal((await call('PATCH', `/api/segments/${made.body.id}`, { name: 'finances' })).status, 409);
  const nav = (await call('GET', '/api/segments')).body.segments;
  assert.equal(nav.find((s) => s.id === made.body.id).name, 'Trips');

  const ids = (await call('GET', '/api/settings')).body.segments.map((s) => s.id);
  const reversed = [...ids].reverse();
  assert.equal((await call('POST', '/api/segments/reorder', { ids: reversed })).status, 200);
  assert.deepEqual((await call('GET', '/api/settings')).body.segments.map((s) => s.id), reversed);
  assert.equal((await call('POST', '/api/segments/reorder', { ids: reversed.slice(1) })).status, 409);
  assert.equal((await call('DELETE', `/api/segments/${made.body.id}`)).status, 200);
  // the name is free again after deleting
  assert.equal((await call('POST', '/api/segments', { name: 'Trips', color: 'blue' })).status, 201);
});

test('deleting a segment: protected one stays, items must go somewhere', async () => {
  const before = (await call('GET', '/api/settings')).body.segments;
  const general = before.find((s) => s.protected);
  const fin = before.find((s) => s.name === 'Finances');
  const health = before.find((s) => s.name === 'Health');
  assert.equal((await call('DELETE', `/api/segments/${general.id}`)).status, 400);
  assert.equal((await call('DELETE', `/api/segments/${fin.id}`)).status, 409);
  assert.equal((await call('DELETE', `/api/segments/${fin.id}`, { moveTo: fin.id })).status, 400);
  const moved = await call('DELETE', `/api/segments/${fin.id}`, { moveTo: general.id });
  assert.equal(moved.body.moved, fin.itemCount);
  const after = (await call('GET', '/api/settings')).body.segments;
  assert.equal(after.find((s) => s.id === general.id).itemCount, general.itemCount + fin.itemCount);
  const note = await pg.query(`select note from item_events where note = 'Moved to General / Administrative' limit 1`);
  assert.equal(note.rows.length, 1);
  const gone = await call('DELETE', `/api/segments/${health.id}`, { deleteItems: true });
  assert.equal(gone.body.deleted, health.itemCount);
  const archived = (await call('GET', '/api/settings')).body.archived;
  assert.ok(archived.deleted >= health.itemCount);
});

test('export: JSON and a CSV zip, without secrets', async () => {
  const json = await call('GET', '/api/export?format=json');
  assert.equal(json.status, 200);
  assert.match(json.headers.get('content-disposition'), /radar-export-2026-10-26\.json/);
  assert.deepEqual(Object.keys(json.body), ['exportedAt', 'household', 'users', 'segments', 'items', 'events']);
  assert.equal(json.body.users.length, 2);
  assert.ok(!/password|\$2[aby]\$/i.test(JSON.stringify(json.body)));
  const zip = await call('GET', '/api/export?format=csv', undefined, true);
  assert.equal(zip.headers.get('content-type'), 'application/zip');
  assert.equal(zip.buf.readUInt32LE(0), 0x04034b50);
  const text = zip.buf.toString('latin1');
  for (const name of ['items.csv', 'history.csv', 'segments.csv', 'users.csv']) assert.ok(text.includes(name), name);
  assert.ok(!/password|\$2[aby]\$/i.test(text));
  assert.equal((await call('GET', '/api/export?format=xml')).status, 400);
});

test('archived items: counted, guarded, owner only', async () => {
  const { archived } = (await call('GET', '/api/settings')).body;
  assert.ok(archived.total > 0);
  assert.equal((await call('DELETE', '/api/items/archived', { count: archived.total + 1 })).status, 409);
  const done = await call('DELETE', '/api/items/archived', { count: archived.total });
  assert.equal(done.body.deleted, archived.total);
  assert.equal((await call('GET', '/api/settings')).body.archived.total, 0);
  const orphans = await pg.query('select count(*)::int n from item_events e left join items i on i.id = e.item_id where i.id is null');
  assert.equal(orphans.rows[0].n, 0);
  await pg.query('update users set is_owner = false');
  assert.equal((await call('DELETE', '/api/items/archived')).status, 403);
});
