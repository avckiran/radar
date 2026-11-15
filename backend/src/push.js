import crypto from 'node:crypto';
import { HttpError } from './errors.js';

// Web push: the server sends a small encrypted message through the phone's or browser's own push service
// (Apple for Safari, Google for Chrome, Mozilla for Firefox, Microsoft for Edge) and the device shows it.
// Only those services may be used as the address to send to, so nobody can make the server call somewhere else.
const PUSH_HOSTS = [/(^|\.)push\.apple\.com$/, /^fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const LABEL_MAX = 40;
const TEST_GAP_MS = 5000;

export function base64url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

// A fresh pair of identification keys for the server (run once, keep the private key secret)
export function generateVapidKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = publicKey.export({ format: 'jwk' });
  const priv = privateKey.export({ format: 'jwk' });
  const uncompressed = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]);
  return { publicKey: base64url(uncompressed), privateKey: priv.d };
}

// A short, stable tag for a device, so Settings can tell which listed device is the one in your hand
export function deviceHash(endpoint) {
  return crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 16);
}

export function validateSubscription(input) {
  const sub = input && typeof input === 'object' ? input : {};
  const endpoint = typeof sub.endpoint === 'string' ? sub.endpoint : '';
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new HttpError(400, 'That device could not be saved.');
  }
  if (url.protocol !== 'https:' || endpoint.length > 2000 || !PUSH_HOSTS.some((re) => re.test(url.hostname))) {
    throw new HttpError(400, 'That device uses a notification service RADAR does not support.');
  }
  const p256dh = sub.keys?.p256dh;
  const auth = sub.keys?.auth;
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || !BASE64URL.test(p256dh) || !BASE64URL.test(auth) || p256dh.length > 200 || auth.length > 100) {
    throw new HttpError(400, 'That device could not be saved.');
  }
  return { endpoint, p256dh, auth };
}

function cleanLabel(value) {
  const label = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, LABEL_MAX) : '';
  return label || 'Device';
}

export async function saveSubscription(db, ctx, input) {
  const sub = validateSubscription(input?.subscription);
  const label = cleanLabel(input?.label);
  // The same device signing in as someone else takes the subscription over, so it never notifies the wrong person
  const res = await db.query(
    `insert into push_subscriptions (user_id, household_id, endpoint, p256dh, auth, label)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (endpoint) do update
       set user_id = excluded.user_id, household_id = excluded.household_id, p256dh = excluded.p256dh,
           auth = excluded.auth, label = excluded.label, last_error = null
     returning id, label, created_at`,
    [ctx.user.id, ctx.householdId, sub.endpoint, sub.p256dh, sub.auth, label]
  );
  return { id: res.rows[0].id, label: res.rows[0].label, hash: deviceHash(sub.endpoint) };
}

export async function removeSubscription(db, ctx, endpoint) {
  if (typeof endpoint !== 'string' || !endpoint) throw new HttpError(400, 'Which device?');
  await db.query('delete from push_subscriptions where endpoint = $1 and user_id = $2', [endpoint, ctx.user.id]);
  return { removed: true };
}

export async function removeDevice(db, ctx, id) {
  await db.query('delete from push_subscriptions where id = $1 and user_id = $2', [id, ctx.user.id]);
  return { removed: true };
}

export async function listDevices(db, ctx) {
  const res = await db.query(
    `select id, endpoint, label, created_at, last_success_at from push_subscriptions where user_id = $1 order by created_at, id`,
    [ctx.user.id]
  );
  return res.rows.map((r) => ({ id: r.id, label: r.label, hash: deviceHash(r.endpoint), addedAt: r.created_at, lastSuccessAt: r.last_success_at }));
}

// The notification text for one digest: the same headline and summary line as the email, and never the names of tasks
// (a notification can be read on a locked screen).
export function pushPayload(model) {
  return { title: model.subject, body: model.preheader, tag: `radar-${model.slot}` };
}

// The sender. Returns null when the server has no keys yet (push is then switched off everywhere).
export function createPusher({ publicKey, privateKey, subject }) {
  if (!publicKey || !privateKey || !subject) return null;
  let library = null;
  return {
    publicKey,
    // Resolves when the push service accepted the message; throws an error with a statusCode when it did not
    async send(subscription, payload, { ttlSeconds = 6 * 3600, topic } = {}) {
      library ??= (await import('web-push')).default;
      return library.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(payload), {
        TTL: ttlSeconds,
        urgency: 'high',
        topic,
        timeout: 15_000,
        vapidDetails: { subject, publicKey, privateKey },
      });
    },
  };
}

// Sends one message to every device a person has turned notifications on for. Devices the push service says are gone
// (404 or 410: app removed, notifications switched off) are forgotten.
export async function deliverPush({ db, pusher, userId, payload, topic, ttlSeconds, now = () => new Date() }) {
  const subs = await db.query('select id, endpoint, p256dh, auth from push_subscriptions where user_id = $1 order by created_at, id', [userId]);
  const result = { devices: subs.rows.length, sent: 0, gone: 0, failed: 0, error: null };
  for (const sub of subs.rows) {
    try {
      await pusher.send(sub, payload, { topic, ttlSeconds });
      result.sent += 1;
      await db.query('update push_subscriptions set last_success_at = $2, last_error = null where id = $1', [sub.id, now()]);
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        result.gone += 1;
        await db.query('delete from push_subscriptions where id = $1', [sub.id]);
      } else {
        result.failed += 1;
        result.error = `Push service answered ${err?.statusCode ?? 'with an error'}${err?.body ? `: ${String(err.body).slice(0, 120)}` : ''}`.slice(0, 300);
        await db.query('update push_subscriptions set last_error = $2 where id = $1', [sub.id, result.error]);
      }
    }
  }
  return result;
}

// "Send a test" in Settings. A short pause between tests so a stuck button cannot flood a phone.
export function createTestSender({ db, pusher, now = () => new Date() }) {
  const last = new Map();
  return async function sendTest(ctx) {
    if (!pusher) throw new HttpError(503, 'Notifications are not set up on the server yet.');
    const at = now().getTime();
    if (at - (last.get(ctx.user.id) ?? 0) < TEST_GAP_MS) throw new HttpError(429, 'Wait a few seconds before sending another test.');
    last.set(ctx.user.id, at);
    const result = await deliverPush({
      db,
      pusher,
      userId: ctx.user.id,
      payload: { title: 'RADAR test', body: 'Notifications are working on this device.', tag: 'radar-test' },
      topic: 'radar-test',
      ttlSeconds: 300,
      now,
    });
    return { devices: result.devices - result.gone, sent: result.sent, failed: result.failed };
  };
}
