import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { buildSeed } from '../src/seedData.js';
import { createDigestRunner } from '../src/digest/scheduler.js';
import { createPusher, createTestSender, deviceHash, generateVapidKeys, pushPayload, validateSubscription } from '../src/push.js';

// Web push notifications against a real Postgres engine (PGlite) with the real migrations and the real routes.
// The push service itself (Apple, Google ...) is a fake that records what it was asked to send.
const NOW = new Date('2026-10-26T15:00:00Z');
const PASSWORD = 'a long enough password';
const quiet = { log() {}, warn() {}, error() {} };
let pg, db, seed, server, serverNoKeys, base, baseNoKeys, fake;
let appClock = NOW.getTime(); // moves on a little before every test, so the pause between tests does not carry over
let counter = 0;

async function insert(table, row) {
  const cols = Object.keys(row);
  const vals = cols.map((c) => (row[c] !== null && typeof row[c] === 'object' && !(row[c] instanceof Date) ? JSON.stringify(row[c]) : row[c]));
  await pg.query(`insert into ${table} (${cols.join(', ')}) values (${cols.map((_, i) => '$' + (i + 1)).join(', ')})`, vals);
}

function fakePusher() {
  const f = {
    publicKey: 'TEST_PUBLIC_KEY',
    sent: [],
    // endpoint -> status code to fail with
    failing: new Map(),
    async send(sub, payload, options) {
      const status = f.failing.get(sub.endpoint);
      if (status) throw Object.assign(new Error(`push service ${status}`), { statusCode: status, body: 'nope' });
      f.sent.push({ endpoint: sub.endpoint, payload, options });
    },
  };
  return f;
}

function fakeMailer({ alwaysFail = false } = {}) {
  const sent = [];
  return {
    sent,
    async send(mail) {
      if (alwaysFail) throw new Error('SMTP down');
      sent.push(mail);
    },
  };
}

async function login(origin, username) {
  const res = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: PASSWORD }) });
  return (await res.json()).token;
}

const tokens = {};
async function call(method, url, body, who = 'avckiran', origin = base) {
  const token = tokens[origin]?.[who];
  const res = await fetch(origin + url, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, body: json };
}

// A device as the browser would hand it over (real-looking keys, an Apple address)
function device(name = 'iPhone') {
  counter += 1;
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    subscription: {
      endpoint: `https://web.push.apple.com/${name.replace(/\W/g, '')}-${counter}-${crypto.randomBytes(6).toString('hex')}`,
      keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') },
    },
    label: name,
  };
}
const subscribe = (dev, who = 'avckiran') => call('POST', '/api/push/subscribe', dev, who);
const settings = async (who = 'avckiran') => (await call('GET', '/api/settings', undefined, who)).body;

before(async () => {
  pg = new PGlite({ parsers: { 1082: (v) => v } });
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
  for (const f of fs.readdirSync(dir).sort()) await pg.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  seed = buildSeed({ now: NOW });
  await insert('households', seed.household);
  for (const u of seed.users) {
    const { key, ...row } = u;
    await insert('users', { ...row, password_hash: bcrypt.hashSync(PASSWORD, 4) });
  }
  for (const s of seed.segments) await insert('segments', s);
  for (const i of seed.items) {
    const { key, ...row } = i;
    await insert('items', row);
  }
  for (const e of seed.events) await insert('item_events', e);
  db = { query: (s, p) => pg.query(s, p), connect: async () => ({ query: (s, p) => pg.query(s, p), release() {} }) };
  fake = fakePusher();
  const open = (pusher) =>
    new Promise((resolve) => {
      const app = createApp({ db, corsOrigins: [], now: () => new Date(appClock), jwtSecret: 'test-secret-test-secret-test-secret-123456', pusher });
      const s = app.listen(0, () => resolve(s));
    });
  server = await open(fake);
  serverNoKeys = await open(null);
  base = `http://localhost:${server.address().port}`;
  baseNoKeys = `http://localhost:${serverNoKeys.address().port}`;
  for (const origin of [base, baseNoKeys]) {
    tokens[origin] = { avckiran: await login(origin, 'avckiran'), koarora6: await login(origin, 'koarora6') };
  }
});

after(async () => {
  await new Promise((r) => server.close(r));
  await new Promise((r) => serverNoKeys.close(r));
});

beforeEach(async () => {
  appClock += 10_000;
  fake.sent.length = 0;
  fake.failing.clear();
  await pg.query('delete from push_subscriptions');
  await pg.query('delete from digest_log');
  await pg.query(
    `update users set email = username || '@example.com', digest_enabled = true,
            digest_morning_enabled = true, digest_time = '08:00',
            digest_afternoon_enabled = false, digest_afternoon_time = '14:00',
            digest_evening_enabled = false, digest_evening_time = '18:00',
            digest_morning_push = false, digest_afternoon_push = false, digest_evening_push = false`
  );
  await pg.query(`update households set time_zone = 'America/New_York'`);
});

// ---------------------------------------------------------------- the routes

test('the browser learns whether push is set up and gets the public key', async () => {
  assert.deepEqual((await call('GET', '/api/push/config')).body, { enabled: true, publicKey: 'TEST_PUBLIC_KEY' });
  assert.deepEqual((await call('GET', '/api/push/config', undefined, 'avckiran', baseNoKeys)).body, { enabled: false, publicKey: null });
  const refused = await call('POST', '/api/push/subscribe', device(), 'avckiran', baseNoKeys);
  assert.equal(refused.status, 503);
});

test('a device is saved once, shows up in Settings and is recognisable by its tag', async () => {
  const phone = device('iPhone');
  const first = await subscribe(phone);
  assert.equal(first.status, 200);
  assert.equal(first.body.hash, deviceHash(phone.subscription.endpoint));
  await subscribe(phone); // the same device again (for example after reopening the app)
  const rows = await pg.query('select count(*)::int as n from push_subscriptions');
  assert.equal(rows.rows[0].n, 1);
  const me = (await settings()).me;
  assert.equal(me.pushDevices.length, 1);
  assert.equal(me.pushDevices[0].label, 'iPhone');
  assert.equal(me.pushDevices[0].hash, deviceHash(phone.subscription.endpoint));
  assert.equal('endpoint' in me.pushDevices[0], false, 'the push address and keys never leave the server');
  assert.deepEqual((await settings('koarora6')).me.pushDevices, []);
});

test('only real push services are accepted, so the server cannot be pointed somewhere else', async () => {
  const ok = device();
  for (const endpoint of [
    'http://web.push.apple.com/x',
    'https://evil.example.com/x',
    'https://169.254.169.254/latest/meta-data',
    'https://web.push.apple.com.evil.example.com/x',
    'not a url',
    `https://web.push.apple.com/${'a'.repeat(2100)}`,
  ]) {
    const r = await subscribe({ ...ok, subscription: { ...ok.subscription, endpoint } });
    assert.equal(r.status, 400, endpoint.slice(0, 60));
  }
  for (const keys of [{}, { p256dh: 'abc', auth: 'bad auth!' }, { p256dh: 'x'.repeat(300), auth: 'abc' }, { p256dh: 5, auth: 6 }]) {
    assert.equal((await subscribe({ ...ok, subscription: { ...ok.subscription, keys } })).status, 400);
  }
  assert.equal((await call('POST', '/api/push/subscribe', {})).status, 400);
  assert.equal((await pg.query('select count(*)::int as n from push_subscriptions')).rows[0].n, 0);
  for (const endpoint of ['https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/abc', 'https://wns2-par02p.notify.windows.com/w/?token=abc', 'https://web.push.apple.com/abc']) {
    assert.doesNotThrow(() => validateSubscription({ ...ok.subscription, endpoint }), endpoint);
  }
});

test('the label is tidied and defaults to Device', async () => {
  await subscribe({ ...device(), label: '   Chandra’s   iPhone   ' });
  await subscribe({ ...device(), label: '' });
  await subscribe({ ...device(), label: 'x'.repeat(90) });
  const labels = (await settings()).me.pushDevices.map((d) => d.label);
  assert.deepEqual(labels, ['Chandra’s iPhone', 'Device', 'x'.repeat(40)]);
});

test('each person only sees and removes their own devices; a device that signs in as someone else changes owner', async () => {
  const mine = device('iPhone');
  const hers = device('Mac');
  await subscribe(mine, 'avckiran');
  await subscribe(hers, 'koarora6');
  const myId = (await settings()).me.pushDevices[0].id;
  assert.equal((await call('DELETE', `/api/push/devices/${myId}`, undefined, 'koarora6')).status, 200);
  assert.equal((await settings()).me.pushDevices.length, 1, 'Komal cannot remove Chandra’s device');
  await call('POST', '/api/push/unsubscribe', { endpoint: mine.subscription.endpoint }, 'koarora6');
  assert.equal((await settings()).me.pushDevices.length, 1);
  // the shared iPad: Komal signs in on the device Chandra used
  await subscribe({ ...mine, label: 'iPad' }, 'koarora6');
  assert.equal((await settings()).me.pushDevices.length, 0);
  assert.deepEqual((await settings('koarora6')).me.pushDevices.map((d) => d.label).sort(), ['Mac', 'iPad']);
});

test('turning notifications off on a device, or removing it in Settings, forgets it', async () => {
  const a = device('iPhone');
  const b = device('Mac');
  await subscribe(a);
  await subscribe(b);
  assert.equal((await call('POST', '/api/push/unsubscribe', { endpoint: a.subscription.endpoint })).status, 200);
  assert.deepEqual((await settings()).me.pushDevices.map((d) => d.label), ['Mac']);
  const id = (await settings()).me.pushDevices[0].id;
  assert.equal((await call('DELETE', `/api/push/devices/${id}`)).status, 200);
  assert.equal((await settings()).me.pushDevices.length, 0);
  assert.equal((await call('POST', '/api/push/unsubscribe', {})).status, 400);
  assert.equal((await call('DELETE', '/api/push/devices/not-an-id')).status, 400);
});

test('each of the three emails can also be sent as a notification, switched on its own', async () => {
  const first = (await settings()).me.digestSlots;
  assert.deepEqual(Object.values(first).map((s) => s.push), [false, false, false]);
  const changed = await call('PATCH', '/api/settings', { digestSlots: { afternoon: { push: true }, morning: { enabled: false, push: true } } });
  assert.equal(changed.status, 200);
  const slots = changed.body.me.digestSlots;
  assert.deepEqual([slots.morning.enabled, slots.morning.push], [false, true]);
  assert.deepEqual([slots.afternoon.enabled, slots.afternoon.push], [false, true]);
  assert.deepEqual([slots.evening.enabled, slots.evening.push], [false, false]);
  assert.equal((await settings('koarora6')).me.digestSlots.afternoon.push, false, 'it is a personal setting');
  for (const bad of [{ afternoon: { push: 'yes' } }, { afternoon: { push: 1 } }, { afternoon: { push: null } }]) {
    assert.equal((await call('PATCH', '/api/settings', { digestSlots: bad })).status, 400, JSON.stringify(bad));
  }
});

test('"Send a test" goes to your own devices only and has a short pause between tests', async () => {
  await subscribe(device('iPhone'));
  await subscribe(device('Mac'));
  await subscribe(device('Her phone'), 'koarora6');
  const r = await call('POST', '/api/push/test', {});
  assert.deepEqual(r.body, { devices: 2, sent: 2, failed: 0 });
  assert.deepEqual(fake.sent.map((s) => s.payload.title), ['RADAR test', 'RADAR test']);
  assert.equal((await call('POST', '/api/push/test', {})).status, 429, 'a second test straight away is refused');
  const hers = await call('POST', '/api/push/test', {}, 'koarora6');
  assert.equal(hers.body.sent, 1);
  assert.equal((await call('POST', '/api/push/test', {}, 'avckiran', baseNoKeys)).status, 503);

  let clock = 1_000_000;
  const sender = createTestSender({ db, pusher: fake, now: () => new Date(clock) });
  const ctx = { user: { id: seed.users[0].id } };
  assert.equal((await sender(ctx)).sent, 2);
  await assert.rejects(sender(ctx), /Wait a few seconds/);
  clock += 6000;
  assert.equal((await sender(ctx)).sent, 2);
});

test('a test finds out which devices are gone and forgets them', async () => {
  const live = device('iPhone');
  const dead = device('Old iPad');
  await subscribe(live);
  await subscribe(dead);
  fake.failing.set(dead.subscription.endpoint, 410);
  const r = await call('POST', '/api/push/test', {});
  assert.deepEqual(r.body, { devices: 1, sent: 1, failed: 0 });
  assert.deepEqual((await settings()).me.pushDevices.map((d) => d.label), ['iPhone']);
});

test('the keys the server generates have the right shape and the push library accepts them', async () => {
  const { publicKey, privateKey } = generateVapidKeys();
  assert.equal(Buffer.from(publicKey, 'base64url').length, 65);
  assert.equal(Buffer.from(publicKey, 'base64url')[0], 4);
  assert.equal(Buffer.from(privateKey, 'base64url').length, 32);
  assert.notEqual(generateVapidKeys().privateKey, privateKey);
  assert.equal(createPusher({ publicKey: '', privateKey, subject: 'https://x.test' }), null);
  assert.equal(createPusher({ publicKey, privateKey, subject: '' }), null);
  const pusher = createPusher({ publicKey, privateKey, subject: 'https://x.test/radar' });
  assert.equal(pusher.publicKey, publicKey);
  // Build (not send) a real request with the real library, if it is installed
  let library;
  try {
    library = (await import('web-push')).default;
  } catch {
    console.warn('web-push is not installed here: run "npm install" to include the real-library check');
    return;
  }
  const dev = device();
  const details = library.generateRequestDetails({ endpoint: dev.subscription.endpoint, keys: dev.subscription.keys }, JSON.stringify({ title: 'x' }), {
    TTL: 60,
    urgency: 'high',
    vapidDetails: { subject: 'https://x.test/radar', publicKey, privateKey },
  });
  assert.equal(details.method, 'POST');
  assert.match(details.headers.Authorization, /^vapid t=/);
  assert.equal(details.headers['Content-Encoding'], 'aes128gcm');
  assert.ok(details.body.length > 0);
});

// ---------------------------------------------------------------- sending on schedule

// 2026-10-27 is during Eastern daylight time (UTC-4), so 08:00 Eastern is 12:00 UTC
const runner = (iso, { mailer = fakeMailer(), pusher = fake, ...extra } = {}) =>
  createDigestRunner({ db, mailer, pusher, appUrl: 'https://x.test/radar', now: () => new Date(iso), retryDelayMs: 0, log: quiet, ...extra });
const rows = async () => (await pg.query(`select u.username, d.slot, d.channel, d.status, d.error from digest_log d join users u on u.id = d.user_id order by u.username, d.slot, d.channel`)).rows;
const setPush = (username, slots, on = true) =>
  pg.query(`update users set ${slots.map((s) => `digest_${s}_push = ${on}`).join(', ')} where username = $1`, [username]);
const deviceFor = async (who, name = 'iPhone') => {
  const dev = device(name);
  await subscribe(dev, who);
  return dev;
};

async function withEmptyList(fn) {
  const saved = (await pg.query('select id, deleted_at from items')).rows;
  await pg.query('update items set deleted_at = now()');
  try {
    await fn();
  } finally {
    for (const r of saved) await pg.query('update items set deleted_at = $2 where id = $1', [r.id, r.deleted_at]);
  }
}

test('push is off until a person turns it on: nobody is notified by default', async () => {
  await deviceFor('avckiran');
  const r = await runner('2026-10-27T12:05:00Z').tick();
  assert.equal(r.sent, 2, 'the two emails still go');
  assert.equal(fake.sent.length, 0);
  assert.deepEqual((await rows()).map((x) => x.channel), ['email', 'email']);
});

test('a notification can replace an email: push on and email off sends only the notification', async () => {
  await deviceFor('avckiran');
  await setPush('avckiran', ['morning']);
  await pg.query(`update users set digest_morning_enabled = false where username = 'avckiran'`);
  const mail = fakeMailer();
  const r = await runner('2026-10-27T12:05:00Z', { mailer: mail }).tick();
  assert.equal(r.sent, 2); // Chandra's notification and Komal's email
  assert.deepEqual(mail.sent.map((m) => m.to), ['koarora6@example.com']);
  assert.equal(fake.sent.length, 1);
  assert.deepEqual(await rows(), [
    { username: 'avckiran', slot: 'morning', channel: 'push', status: 'sent', error: null },
    { username: 'koarora6', slot: 'morning', channel: 'email', status: 'sent', error: null },
  ]);
});

test('the notification says what the email subject says and never names a task', async () => {
  await deviceFor('avckiran');
  await setPush('avckiran', ['morning']);
  const mail = fakeMailer();
  await runner('2026-10-27T12:05:00Z', { mailer: mail }).tick();
  const { payload, options } = fake.sent[0];
  const email = mail.sent.find((m) => m.to === 'avckiran@example.com');
  assert.equal(payload.title, email.subject);
  assert.equal(payload.tag, 'radar-morning');
  assert.equal(typeof payload.body, 'string');
  assert.equal(options.topic, 'radar-morning');
  assert.equal(options.ttlSeconds, 6 * 3600);
  const titles = (await pg.query('select title from items')).rows.map((r) => r.title);
  const text = `${payload.title} ${payload.body}`;
  for (const t of titles) assert.ok(!text.includes(t), `"${t}" must not be on the lock screen`);
  assert.deepEqual(pushPayload({ subject: 'S', preheader: 'P', slot: 'evening' }), { title: 'S', body: 'P', tag: 'radar-evening' });
});

test('email and notification for the same slot are separate: both go out once, even after a restart', async () => {
  await deviceFor('avckiran');
  await setPush('avckiran', ['morning']);
  const mail = fakeMailer();
  for (const t of ['12:05', '12:20', '15:00']) await runner(`2026-10-27T${t}:00Z`, { mailer: mail }).tick();
  assert.equal(mail.sent.length, 2);
  assert.equal(fake.sent.length, 1);
  assert.equal((await rows()).filter((r) => r.username === 'avckiran').length, 2);
});

test('a notification goes to every device the person has, and only to theirs', async () => {
  const phone = await deviceFor('avckiran', 'iPhone');
  const mac = await deviceFor('avckiran', 'Mac');
  await deviceFor('koarora6', 'Her phone');
  await setPush('avckiran', ['morning']);
  await runner('2026-10-27T12:05:00Z').tick();
  assert.deepEqual(fake.sent.map((s) => s.endpoint).sort(), [phone.subscription.endpoint, mac.subscription.endpoint].sort());
});

test('what Komal turns off stays off, and Chandra’s choices do not leak into hers', async () => {
  const hers = await deviceFor('koarora6');
  const his = await deviceFor('avckiran');
  await setPush('avckiran', ['morning', 'afternoon']);
  await pg.query(`update users set digest_afternoon_enabled = true where username = 'avckiran'`);
  await pg.query(`update users set digest_afternoon_enabled = false, digest_afternoon_push = false, digest_morning_push = false where username = 'koarora6'`);
  const mail = fakeMailer();
  await runner('2026-10-27T12:05:00Z', { mailer: mail }).tick();
  await runner('2026-10-27T18:05:00Z', { mailer: mail }).tick();
  assert.deepEqual(fake.sent.map((s) => `${s.endpoint === his.subscription.endpoint ? 'chandra' : 'komal'}:${s.payload.tag}`), ['chandra:radar-morning', 'chandra:radar-afternoon']);
  assert.ok(!fake.sent.some((s) => s.endpoint === hers.subscription.endpoint));
  const komalMail = mail.sent.filter((m) => m.to === 'koarora6@example.com');
  assert.equal(komalMail.length, 1, 'only her morning email, no afternoon email and no notification');
  assert.doesNotMatch(komalMail[0].subject, /^Afternoon/);
});

test('the master switch turns off notifications too', async () => {
  await deviceFor('avckiran');
  await setPush('avckiran', ['morning', 'afternoon', 'evening']);
  await pg.query(`update users set digest_enabled = false`);
  await runner('2026-10-27T12:05:00Z').tick();
  await runner('2026-10-27T22:05:00Z').tick();
  assert.equal(fake.sent.length, 0);
  assert.equal((await rows()).length, 0);
});

test('notifications arrive at the same times as the emails', async () => {
  await deviceFor('avckiran');
  await setPush('avckiran', ['morning', 'afternoon', 'evening']);
  await pg.query(`update users set digest_afternoon_time = '15:30', digest_evening_time = '20:00' where username = 'avckiran'`);
  await runner('2026-10-27T11:59:00Z').tick();
  assert.equal(fake.sent.length, 0);
  await runner('2026-10-27T12:00:00Z').tick();
  assert.deepEqual(fake.sent.map((s) => s.payload.tag), ['radar-morning']);
  await runner('2026-10-27T19:00:00Z').tick(); // 3:00 PM
  assert.equal(fake.sent.length, 1);
  await runner('2026-10-27T19:30:00Z').tick(); // 3:30 PM
  await runner('2026-10-28T00:00:00Z').tick(); // 8:00 PM
  assert.deepEqual(fake.sent.map((s) => s.payload.tag), ['radar-morning', 'radar-afternoon', 'radar-evening']);
  assert.match(fake.sent[1].payload.title, /^Afternoon: /);
});

test('afternoon and evening notifications are skipped when nothing needs you; the morning one still comes', async () => {
  await deviceFor('avckiran');
  await setPush('avckiran', ['morning', 'afternoon', 'evening']);
  await withEmptyList(async () => {
    await runner('2026-10-27T12:05:00Z').tick();
    assert.deepEqual(fake.sent.map((s) => s.payload.tag), ['radar-morning']);
    assert.equal(fake.sent[0].payload.title, 'Nothing on the list today');
    await runner('2026-10-27T18:05:00Z').tick();
    await runner('2026-10-27T22:05:00Z').tick();
    assert.equal(fake.sent.length, 1);
    assert.equal((await rows()).filter((x) => x.channel === 'push' && x.status === 'quiet').length, 2);
  });
});

test('no device yet: nothing is sent, and turning notifications on later the same morning still delivers it once', async () => {
  await setPush('avckiran', ['morning']);
  await runner('2026-10-27T12:05:00Z').tick();
  assert.equal(fake.sent.length, 0);
  const row = (await rows()).find((x) => x.channel === 'push');
  assert.equal(row.status, 'skipped');
  assert.match(row.error, /No device/);
  await deviceFor('avckiran');
  await runner('2026-10-27T12:20:00Z').tick();
  await runner('2026-10-27T12:35:00Z').tick();
  assert.equal(fake.sent.length, 1);
  assert.equal((await rows()).find((x) => x.channel === 'push').status, 'sent');
});

test('a device the push service no longer knows is forgotten; the others still get it', async () => {
  const dead = await deviceFor('avckiran', 'Old iPad');
  const live = await deviceFor('avckiran', 'iPhone');
  await setPush('avckiran', ['morning']);
  fake.failing.set(dead.subscription.endpoint, 410);
  await runner('2026-10-27T12:05:00Z').tick();
  assert.deepEqual(fake.sent.map((s) => s.endpoint), [live.subscription.endpoint]);
  assert.deepEqual((await settings()).me.pushDevices.map((d) => d.label), ['iPhone']);
});

test('when every device is gone, the notification is logged as skipped, not as sent', async () => {
  const only = await deviceFor('avckiran');
  await setPush('avckiran', ['morning']);
  fake.failing.set(only.subscription.endpoint, 404);
  const r = await runner('2026-10-27T12:05:00Z').tick();
  assert.equal(r.sent, 2, 'the two emails; nothing for the notification');
  assert.equal((await rows()).find((x) => x.channel === 'push').status, 'skipped');
  assert.equal((await settings()).me.pushDevices.length, 0);
});

test('a push service that keeps failing is retried once straight away, logged as failed, and recovers later', async () => {
  const dev = await deviceFor('avckiran');
  await setPush('avckiran', ['morning']);
  fake.failing.set(dev.subscription.endpoint, 500);
  const r = await runner('2026-10-27T12:05:00Z').tick();
  assert.equal(r.failed, 1);
  const row = (await rows()).find((x) => x.channel === 'push');
  assert.equal(row.status, 'failed');
  assert.match(row.error, /500/);
  assert.match((await pg.query('select last_error from push_subscriptions')).rows[0].last_error, /500/);
  fake.failing.clear();
  await runner('2026-10-27T12:20:00Z').tick();
  assert.equal(fake.sent.length, 1);
  assert.equal((await rows()).find((x) => x.channel === 'push').status, 'sent');
  assert.equal((await pg.query('select last_error from push_subscriptions')).rows[0].last_error, null);
});

test('a broken mail account does not stop notifications', async () => {
  await deviceFor('avckiran');
  await setPush('avckiran', ['morning']);
  const r = await runner('2026-10-27T12:05:00Z', { mailer: fakeMailer({ alwaysFail: true }) }).tick();
  assert.equal(fake.sent.length, 1);
  assert.equal(r.failed, 2, 'both emails failed');
  assert.equal((await rows()).find((x) => x.username === 'avckiran' && x.channel === 'push').status, 'sent');
});

test('without the server’s keys (no pusher) the notification switches are ignored and email carries on', async () => {
  await deviceFor('avckiran');
  await setPush('avckiran', ['morning']);
  const r = await runner('2026-10-27T12:05:00Z', { pusher: null }).tick();
  assert.equal(r.sent, 2);
  assert.equal(fake.sent.length, 0);
  assert.deepEqual((await rows()).map((x) => x.channel), ['email', 'email']);
});

test('notifications work for someone with no email address, and with no mail account at all', async () => {
  await deviceFor('koarora6');
  await setPush('koarora6', ['morning']);
  await pg.query(`update users set email = null where username = 'koarora6'`);
  const r = await runner('2026-10-27T12:05:00Z', { mailer: null }).tick();
  assert.equal(r.sent, 1);
  assert.equal(fake.sent.length, 1);
  assert.deepEqual((await rows()).map((x) => `${x.username}:${x.channel}`), ['koarora6:push']);
});

test('lateness is judged per notification, like the emails', async () => {
  await deviceFor('avckiran');
  await setPush('avckiran', ['morning', 'afternoon']);
  await pg.query(`update users set digest_afternoon_enabled = true where username = 'avckiran'`);
  const r = await runner('2026-10-27T20:30:00Z').tick(); // 4:30 PM: morning is 8.5 hours late, afternoon is 2.5
  assert.equal(fake.sent.length, 1);
  assert.equal(fake.sent[0].payload.tag, 'radar-afternoon');
  const morning = (await rows()).filter((x) => x.username === 'avckiran' && x.slot === 'morning').map((x) => `${x.channel}:${x.status}`);
  assert.deepEqual(morning, ['email:skipped', 'push:skipped']);
  assert.ok(r.skipped >= 2);
});
