import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { buildSeed } from '../src/seedData.js';
import { clearItems, describeItems } from '../src/clearItems.js';

let pg, db, seed;

async function insert(table, row) {
  const cols = Object.keys(row);
  const vals = cols.map((c) => (row[c] !== null && typeof row[c] === 'object' && !(row[c] instanceof Date) ? JSON.stringify(row[c]) : row[c]));
  await pg.query(`insert into ${table} (${cols.join(', ')}) values (${cols.map((_, i) => '$' + (i + 1)).join(', ')})`, vals);
}

before(async () => {
  pg = new PGlite({ parsers: { 1082: (v) => v } });
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
  for (const f of fs.readdirSync(dir).sort()) await pg.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  seed = buildSeed({ now: new Date('2026-10-26T15:00:00Z') });
  await insert('households', seed.household);
  for (const u of seed.users) {
    const { key, ...row } = u;
    await insert('users', { ...row, password_hash: 'hash-' + key });
  }
  for (const s of seed.segments) await insert('segments', s);
  for (const i of seed.items) {
    const { key, ...row } = i;
    await insert('items', row);
  }
  for (const e of seed.events) await insert('item_events', e);
  const user = seed.users[0];
  await pg.query(`insert into digest_log (user_id, local_date, slot, status) values ($1, '2026-10-26', 'morning', 'sent')`, [user.id]);
  db = { query: (s, p) => pg.query(s, p), connect: async () => ({ query: (s, p) => pg.query(s, p), release() {} }) };
});

const count = async (table) => (await pg.query(`select count(*)::int as n from ${table}`)).rows[0].n;

test('describe shows what would go and what stays, and changes nothing', async () => {
  const before = await describeItems(db);
  assert.equal(before.items, seed.items.length);
  assert.equal(before.events, seed.events.length);
  assert.equal(before.users, seed.users.length);
  assert.ok(Object.keys(before.byState).length >= 3);
  assert.equal(await count('items'), seed.items.length);
});

test('refuses to delete when the count changed since it was shown', async () => {
  await assert.rejects(clearItems(db, { expectedItems: seed.items.length + 1 }), /changed/);
  assert.equal(await count('items'), seed.items.length);
});

test('removes every item and history entry and nothing else', async () => {
  const usersBefore = (await pg.query('select id, username, password_hash from users order by id')).rows;
  const segmentsBefore = (await pg.query('select id, name, sort_order from segments order by id')).rows;
  const done = await clearItems(db, { expectedItems: seed.items.length });
  assert.equal(done.items, seed.items.length);
  assert.equal(done.events, seed.events.length);
  assert.equal(await count('items'), 0);
  assert.equal(await count('item_events'), 0);
  assert.deepEqual((await pg.query('select id, username, password_hash from users order by id')).rows, usersBefore);
  assert.deepEqual((await pg.query('select id, name, sort_order from segments order by id')).rows, segmentsBefore);
  assert.equal(await count('households'), 1);
  assert.equal(await count('digest_log'), 1);
  const after = await describeItems(db);
  assert.equal(after.items, 0);
  assert.equal(after.segments, seed.segments.length);
});

test('running it again on an empty list is harmless', async () => {
  const done = await clearItems(db, { expectedItems: 0 });
  assert.deepEqual(done, { items: 0, events: 0 });
});
