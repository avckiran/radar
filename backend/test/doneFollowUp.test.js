import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { applyTransition } from '../src/lifecycle.js';
import { describeEvent } from '../src/history.js';
import { buildSeed } from '../src/seedData.js';

// "Done, and follow up" against a real Postgres engine (PGlite) with the real migrations
const NOW = new Date('2026-10-26T15:00:00Z');
let pg, db, seed, hh, user, segment;

async function insert(table, row) {
  const cols = Object.keys(row);
  const vals = cols.map((c) => (row[c] !== null && typeof row[c] === 'object' && !(row[c] instanceof Date) ? JSON.stringify(row[c]) : row[c]));
  await pg.query(`insert into ${table} (${cols.join(', ')}) values (${cols.map((_, i) => '$' + (i + 1)).join(', ')})`, vals);
}

async function newAction(title, segmentId = segment.id) {
  const r = await pg.query(
    `insert into items (household_id, segment_id, kind, state, title, due_date, created_by)
     values ($1, $2, 'action', $3, $4, '2026-10-20', $5) returning id`,
    [hh.id, segmentId, segmentId ? 'active' : 'inbox', title, user.id]
  );
  return r.rows[0].id;
}

const act = (itemId, action, body) =>
  applyTransition(db, { householdId: hh.id, actorId: user.id, itemId, action, body, timeZone: 'America/New_York', now: NOW });

before(async () => {
  pg = new PGlite({ parsers: { 1082: (v) => v } });
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
  for (const f of fs.readdirSync(dir).sort()) await pg.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  seed = buildSeed({ now: NOW });
  await insert('households', seed.household);
  for (const u of seed.users) {
    const { key, ...row } = u;
    await insert('users', { ...row, password_hash: 'x' });
  }
  for (const s of seed.segments) await insert('segments', s);
  hh = seed.household;
  user = seed.users[0];
  segment = seed.segments[0];
  db = { query: (s, p) => pg.query(s, p), connect: async () => ({ query: (s, p) => pg.query(s, p), release() {} }) };
});

const row = async (id) => (await pg.query('select * from items where id = $1', [id])).rows[0];

test('plain done creates nothing extra', async () => {
  const id = await newAction('Plain task');
  const before = (await pg.query('select count(*)::int as n from items')).rows[0].n;
  const result = await act(id, 'done', { note: 'paid' });
  assert.equal(result.followUpId, undefined);
  assert.equal((await pg.query('select count(*)::int as n from items')).rows[0].n, before);
  assert.equal((await row(id)).state, 'done');
});

test('done with a follow-up finishes the task and adds a follow-up in the same segment with no due date', async () => {
  const id = await newAction('Call the bank');
  const result = await act(id, 'done', { note: 'Spoke to Sam', followUp: { waitingOn: 'The bank', checkBack: '2026-10-30' } });
  assert.equal(result.state, 'done');
  const original = await row(id);
  assert.equal(original.state, 'done');
  const made = await row(result.followUpId);
  assert.equal(made.title, 'Follow up: Call the bank');
  assert.equal(made.state, 'waiting');
  assert.equal(made.segment_id, segment.id);
  assert.equal(made.due_date, null);
  assert.equal(made.waiting_on, 'The bank');
  assert.equal(made.follow_up_date, '2026-10-30');
  assert.ok(made.waiting_since);
  assert.equal(made.created_by, user.id);

  const events = (await pg.query('select * from item_events where item_id = any($1) order by created_at', [[id, made.id]])).rows;
  const done = events.find((e) => e.item_id === id && e.type === 'completed');
  assert.equal(done.note, 'Spoke to Sam');
  assert.equal(done.data.followUpId, made.id);
  assert.equal(describeEvent(done, {}).text, 'Marked done, follow-up created');
  const created = events.find((e) => e.item_id === made.id && e.type === 'created');
  assert.match(describeEvent(created, {}).text, /Follow-up created from “Call the bank”/);
});

test('a follow-up with no details is allowed', async () => {
  const id = await newAction('Mail the form');
  const result = await act(id, 'done', { followUp: true });
  const made = await row(result.followUpId);
  assert.equal(made.state, 'waiting');
  assert.equal(made.waiting_on, null);
  assert.equal(made.follow_up_date, null);
});

test('an unsorted task gets its follow-up in the Inbox', async () => {
  const id = await newAction('Loose end', null);
  const result = await act(id, 'done', { followUp: true });
  const made = await row(result.followUpId);
  assert.equal(made.state, 'inbox');
  assert.equal(made.segment_id, null);
});

test('a bad follow-up stops the whole request: the task stays open and nothing is created', async () => {
  const id = await newAction('Bad request');
  const before = (await pg.query('select count(*)::int as n from items')).rows[0].n;
  await assert.rejects(act(id, 'done', { followUp: { checkBack: '2026-10-01' } }), /check-back/i);
  assert.equal((await row(id)).state, 'active');
  assert.equal((await pg.query('select count(*)::int as n from items')).rows[0].n, before);
});

test('undo reopens the task and removes the follow-up it created, but only that one', async () => {
  const id = await newAction('Undo me');
  const other = await newAction('Unrelated');
  const result = await act(id, 'done', { followUp: true });
  await act(id, 'reopen', { undoFollowUpId: other }); // not made from this task: ignored
  assert.equal((await row(other)).deleted_at, null);
  await act(id, 'done', {});
  await act(id, 'reopen', { undoFollowUpId: result.followUpId });
  assert.equal((await row(id)).state, 'active');
  assert.notEqual((await row(result.followUpId)).deleted_at, null);
  const types = (await pg.query('select type from item_events where item_id = $1 order by created_at', [result.followUpId])).rows.map((r) => r.type);
  assert.deepEqual(types, ['created', 'deleted']);
});
