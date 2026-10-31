import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { buildSeed } from '../src/seedData.js';

// A real Postgres engine (PGlite) with the real migrations: two households, real sign-in, real queries.
const NOW = new Date('2026-10-26T15:00:00Z');
const SECRET = 'test-secret-test-secret-test-secret-123456';
const PW = { avckiran: 'correct horse battery', koarora6: 'second long password!', outsider: 'outsider password 1' };
const B = { household: '00000000-0000-4000-8000-0000000000b1', user: '00000000-0000-4000-8000-0000000000b2', segment: '00000000-0000-4000-8000-0000000000b3', item: '00000000-0000-4000-8000-0000000000b4' };

let pg, server, base, seed;
const seen = []; // every response body, to prove no password hash ever leaves the server

async function call(method, url, { token, body, raw } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  seen.push(buf.toString('latin1'));
  if (raw) return { status: res.status, buf, headers: res.headers };
  let json = null;
  try {
    json = JSON.parse(buf.toString('utf8'));
  } catch {
    /* not JSON */
  }
  return { status: res.status, body: json, headers: res.headers };
}

async function signIn(username, extra = {}) {
  const r = await call('POST', '/api/auth/login', { body: { username, password: PW[username], ...extra } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.token;
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
    await insert('users', { ...row, password_hash: bcrypt.hashSync(PW[row.username], 4) });
  }
  for (const s of seed.segments) await insert('segments', s);
  for (const i of seed.items) {
    const { key, ...row } = i;
    await insert('items', row);
  }
  for (const e of seed.events) await insert('item_events', e);

  // A second household that must never be visible to the first, and the other way round
  await insert('households', { id: B.household, name: 'Somebody else', time_zone: 'America/Chicago', nudge_days: 5 });
  await insert('users', { id: B.user, household_id: B.household, username: 'outsider', display_name: 'Outsider', is_owner: true, password_hash: bcrypt.hashSync(PW.outsider, 4) });
  await insert('segments', { id: B.segment, household_id: B.household, name: 'Secret stuff', color: 'blue', sort_order: 0, protected: true });
  await insert('items', { id: B.item, household_id: B.household, segment_id: B.segment, kind: 'action', state: 'active', title: 'Outsider zebra plan', created_by: B.user, created_at: NOW, updated_at: NOW });
  await insert('item_events', { item_id: B.item, household_id: B.household, type: 'created', to_state: 'active', note: 'zebra note', actor_id: B.user, created_at: NOW });

  const db = { query: (s, p) => pg.query(s, p), connect: async () => ({ query: (s, p) => pg.query(s, p), release() {} }) };
  const app = createApp({ db, corsOrigins: ['http://localhost:5173'], now: () => NOW, jwtSecret: SECRET });
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  base = `http://localhost:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
});

const ROUTES = [
  ['GET', '/api/auth/me'],
  ['POST', '/api/auth/logout'],
  ['GET', '/api/segments'],
  ['POST', '/api/segments'],
  ['POST', '/api/segments/reorder'],
  ['GET', '/api/segments/00000000-0000-4000-8000-000000000001'],
  ['GET', '/api/segments/00000000-0000-4000-8000-000000000001/done'],
  ['PATCH', '/api/segments/00000000-0000-4000-8000-000000000001'],
  ['DELETE', '/api/segments/00000000-0000-4000-8000-000000000001'],
  ['GET', '/api/home'],
  ['GET', '/api/inbox'],
  ['GET', '/api/search?q=insurance'],
  ['GET', '/api/settings'],
  ['PATCH', '/api/settings'],
  ['GET', '/api/export?format=json'],
  ['GET', '/api/export?format=csv'],
  ['POST', '/api/items'],
  ['DELETE', '/api/items/archived'],
  ['GET', '/api/items/00000000-0000-4000-8000-000000000001'],
  ['PATCH', '/api/items/00000000-0000-4000-8000-000000000001'],
  ['DELETE', '/api/items/00000000-0000-4000-8000-000000000001'],
  ['POST', '/api/items/00000000-0000-4000-8000-000000000001/follow-ups'],
  ['POST', '/api/items/00000000-0000-4000-8000-000000000001/follow-up-date'],
  ['POST', '/api/items/00000000-0000-4000-8000-000000000001/sort'],
  ['POST', '/api/items/00000000-0000-4000-8000-000000000001/done'],
  ['POST', '/api/items/00000000-0000-4000-8000-000000000001/snooze'],
  ['POST', '/api/items/00000000-0000-4000-8000-000000000001/waiting'],
  ['POST', '/api/items/00000000-0000-4000-8000-000000000001/reopen'],
  ['GET', '/api/something-that-does-not-exist'],
];

test('health works without signing in; every /api route needs sign-in', async () => {
  const health = await call('GET', '/health');
  assert.equal(health.status, 200);
  for (const [method, url] of ROUTES) {
    const r = await call(method, url, { body: method === 'GET' ? undefined : {} });
    assert.equal(r.status, 401, `${method} ${url} answered ${r.status}`);
  }
});

test('garbage, wrongly signed and unknown tokens are refused', async () => {
  for (const token of ['abc', 'a.b.c', 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.']) {
    assert.equal((await call('GET', '/api/home', { token })).status, 401);
  }
  const forged = (await import('jsonwebtoken')).default.sign({ sub: seed.users[0].id, sid: seed.users[0].id }, 'some-other-secret-some-other-secret-1', { expiresIn: 3600 });
  assert.equal((await call('GET', '/api/home', { token: forged })).status, 401);
  const noSession = (await import('jsonwebtoken')).default.sign({ sub: seed.users[0].id, sid: '00000000-0000-4000-8000-00000000ffff', exp: Math.floor(NOW.getTime() / 1000) + 3600 }, SECRET);
  assert.equal((await call('GET', '/api/home', { token: noSession })).status, 401);
});

test('wrong passwords and unknown names get the same message', async () => {
  const wrong = await call('POST', '/api/auth/login', { body: { username: 'avckiran', password: 'not the password' } });
  const unknown = await call('POST', '/api/auth/login', { body: { username: 'nobody-here', password: 'whatever it is' } });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.body.error, 'Username or password is incorrect.');
  assert.deepEqual(wrong.body, unknown.body);
  const empty = await call('POST', '/api/auth/login', { body: { username: '', password: '' } });
  assert.equal(empty.status, 400);
});

test('sign in, who am I, sign out; the token stops working after sign-out', async () => {
  const token = await signIn('avckiran');
  const me = await call('GET', '/api/auth/me', { token });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.username, 'avckiran');
  assert.equal(me.body.household.name, 'Our household');
  assert.equal((await call('GET', '/api/home', { token })).status, 200);
  assert.equal((await call('POST', '/api/auth/logout', { token })).status, 200);
  assert.equal((await call('GET', '/api/home', { token })).status, 401);
  // the other token for the same person is a different session and still works
  const other = await signIn('avckiran');
  assert.equal((await call('GET', '/api/home', { token: other })).status, 200);
});

test('usernames are not case sensitive', async () => {
  const r = await call('POST', '/api/auth/login', { body: { username: '  AvcKiran ', password: PW.avckiran } });
  assert.equal(r.status, 200);
});

test('sessions last 12 hours, or 30 days with Keep me signed in', async () => {
  const short = await call('POST', '/api/auth/login', { body: { username: 'koarora6', password: PW.koarora6, keepSignedIn: false } });
  const long = await call('POST', '/api/auth/login', { body: { username: 'koarora6', password: PW.koarora6, keepSignedIn: true } });
  assert.equal(new Date(short.body.expiresAt).getTime() - NOW.getTime(), 12 * 3600 * 1000);
  assert.equal(new Date(long.body.expiresAt).getTime() - NOW.getTime(), 30 * 24 * 3600 * 1000);
});

test('an expired session is refused', async () => {
  const token = await signIn('koarora6');
  await pg.query(`update auth_sessions set expires_at = $1 where user_id = $2`, [new Date(NOW.getTime() - 1000), seed.users[1].id]);
  assert.equal((await call('GET', '/api/home', { token })).status, 401);
});

test('the second person sees the same household data and each other’s changes', async () => {
  const a = await signIn('avckiran');
  const k = await signIn('koarora6');
  const homeA = await call('GET', '/api/segments', { token: a });
  const homeK = await call('GET', '/api/segments', { token: k });
  assert.deepEqual(homeA.body.segments, homeK.body.segments);
  assert.equal(homeA.body.user.displayName, 'Chandra');
  assert.equal(homeK.body.user.displayName, 'Komal');

  const made = await call('POST', '/api/items', { token: a, body: { id: '11111111-1111-4111-8111-111111111111', kind: 'note', title: 'Shared hello note' } });
  assert.equal(made.status, 201);
  const found = await call('GET', '/api/search?q=hello', { token: k });
  assert.equal(found.body.results.length, 1);
  const detail = await call('GET', '/api/items/11111111-1111-4111-8111-111111111111', { token: k });
  assert.equal(detail.status, 200);
  assert.match(JSON.stringify(detail.body), /Chandra/);
});

test('a person from another household cannot read or change this household’s data', async () => {
  const outsider = await signIn('outsider');
  const mine = seed.items.find((i) => i.state === 'active' && i.kind === 'action');
  const seg = seed.segments[0];
  const snapshot = async () =>
    JSON.stringify([
      (await pg.query('select id, title, state, segment_id, deleted_at, updated_at from items where household_id = $1 order by id', [seed.household.id])).rows,
      (await pg.query('select count(*)::int n from item_events where household_id = $1', [seed.household.id])).rows,
      (await pg.query('select id, name, color, sort_order, deleted_at from segments where household_id = $1 order by id', [seed.household.id])).rows,
      (await pg.query('select name, time_zone, nudge_days from households where id = $1', [seed.household.id])).rows,
    ]);
  const before = await snapshot();

  const denied = async (method, url, body) => {
    const r = await call(method, url, { token: outsider, body });
    assert.ok(r.status >= 400 && r.status < 500, `${method} ${url} answered ${r.status}`);
    return r;
  };
  assert.equal((await denied('GET', `/api/items/${mine.id}`)).status, 404);
  assert.equal((await denied('PATCH', `/api/items/${mine.id}`, { title: 'hacked' })).status, 404);
  assert.equal((await denied('DELETE', `/api/items/${mine.id}`)).status, 404);
  await denied('POST', `/api/items/${mine.id}/follow-ups`, { note: 'hi' });
  await denied('POST', `/api/items/${mine.id}/done`, {});
  await denied('POST', `/api/items/${mine.id}/snooze`, { until: '2026-12-01' });
  await denied('POST', `/api/items/${mine.id}/waiting`, { waitingOn: 'x' });
  await denied('POST', `/api/items/${mine.id}/sort`, { segmentId: B.segment });
  assert.equal((await denied('GET', `/api/segments/${seg.id}`)).status, 404);
  assert.equal((await denied('GET', `/api/segments/${seg.id}/done`)).status, 404);
  assert.equal((await denied('PATCH', `/api/segments/${seg.id}`, { name: 'hacked' })).status, 404);
  assert.equal((await denied('DELETE', `/api/segments/${seg.id}`, { deleteItems: true })).status, 404);
  assert.equal((await denied('POST', '/api/segments/reorder', { ids: seed.segments.map((s) => s.id) })).status, 409);
  // putting their own item into our segment, or capturing into it, is refused
  await denied('PATCH', `/api/items/${B.item}`, { segmentId: seg.id });
  await denied('POST', '/api/items', { id: '22222222-2222-4222-8222-222222222222', kind: 'action', title: 'sneaky', segmentId: seg.id });
  await denied('DELETE', `/api/segments/${B.segment}`, { moveTo: seg.id });

  // what they can list is only their own
  const homeBody = (await call('GET', '/api/home', { token: outsider })).body;
  assert.deepEqual(homeBody.segments.map((s) => s.name), ['Secret stuff']);
  assert.equal(homeBody.household.name, 'Somebody else');
  assert.ok(!JSON.stringify(homeBody).includes('Renew car registration'));
  const list = await call('GET', '/api/segments', { token: outsider });
  assert.deepEqual(list.body.segments.map((s) => s.name), ['Secret stuff']);
  assert.equal(list.body.household.name, 'Somebody else');
  assert.equal((await call('GET', '/api/search?q=insurance', { token: outsider })).body.results.length, 0);
  assert.equal((await call('GET', '/api/search?q=zebra', { token: outsider })).body.results.length, 1);
  const inbox = JSON.stringify((await call('GET', '/api/inbox', { token: outsider })).body);
  assert.ok(!inbox.includes('Pick up prescription'));
  const settings = (await call('GET', '/api/settings', { token: outsider })).body;
  assert.deepEqual(settings.members.map((m) => m.username), ['outsider']);
  assert.deepEqual(settings.segments.map((s) => s.name), ['Secret stuff']);
  const json = JSON.stringify((await call('GET', '/api/export?format=json', { token: outsider })).body);
  assert.ok(json.includes('zebra') && !json.includes('Renew car registration') && !json.includes('avckiran'));
  const zip = (await call('GET', '/api/export?format=csv', { token: outsider, raw: true })).buf.toString('utf8');
  assert.ok(zip.includes('zebra') && !zip.includes('Renew car registration') && !zip.includes('avckiran'));
  // deleting "archived" items and changing settings only touch their own household
  assert.equal((await call('DELETE', '/api/items/archived', { token: outsider, body: {} })).status, 200);
  assert.equal((await call('PATCH', '/api/settings', { token: outsider, body: { householdName: 'Renamed by outsider', nudgeDays: 9 } })).status, 200);

  assert.equal(await snapshot(), before);
});

test('password hashes never appear in any response or export', async () => {
  const token = await signIn('avckiran');
  for (const url of ['/api/auth/me', '/api/settings', '/api/segments', '/api/home', '/api/export?format=json']) {
    assert.equal((await call('GET', url, { token })).status, 200);
  }
  await call('GET', '/api/export?format=csv', { token, raw: true });
  const all = seen.join('\n');
  assert.ok(!/\$2[aby]\$\d\d\$/.test(all), 'a bcrypt hash was sent');
  assert.ok(!/password_?hash/i.test(all), 'a password column name was sent');
  assert.ok(!all.includes(PW.avckiran) || !all.includes('"password":"' + PW.avckiran), 'a password was echoed');
});

test('too many wrong passwords are slowed down', async () => {
  const wrong = () => call('POST', '/api/auth/login', { body: { username: 'koarora6', password: 'wrong wrong wrong' } });
  for (let i = 0; i < 5; i++) assert.equal((await wrong()).status, 401);
  const blocked = await wrong();
  assert.equal(blocked.status, 429);
  assert.match(blocked.body.error, /Too many tries/);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  // even the right password waits, but someone else is not affected
  assert.equal((await call('POST', '/api/auth/login', { body: { username: 'koarora6', password: PW.koarora6 } })).status, 429);
  assert.equal((await call('POST', '/api/auth/login', { body: { username: 'avckiran', password: PW.avckiran } })).status, 200);
});

test('CORS only answers the allowed address and security headers are on', async () => {
  const ok = await fetch(base + '/health', { headers: { origin: 'http://localhost:5173' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  const bad = await fetch(base + '/health', { headers: { origin: 'https://evil.example' } });
  assert.equal(bad.headers.get('access-control-allow-origin'), null);
  const pre = await fetch(base + '/api/home', { method: 'OPTIONS', headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' } });
  assert.match(pre.headers.get('access-control-allow-headers') || '', /Authorization/i);
  assert.equal(ok.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(ok.headers.get('x-powered-by'), null);
});

test('the app will not start without a secret', () => {
  assert.throws(() => createApp({ db: { query: async () => ({ rows: [] }) }, corsOrigins: [], jwtSecret: '' }), /JWT_SECRET/);
});
