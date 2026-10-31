import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { HttpError } from './errors.js';
import { createLimiter } from './rateLimit.js';

export const MIN_PASSWORD = 10;
export const SESSION_HOURS = 12;
export const KEEP_DAYS = 30;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores anything past this
const BAD_LOGIN = 'Username or password is incorrect.';

// Compared against when the username is unknown, so a wrong username takes as long as a wrong password
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

export function hashPassword(password, rounds = 12) {
  return bcrypt.hashSync(password, rounds);
}

export function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) return 'Use fewer than 72 characters.';
  return null;
}

function unauthorized(message = 'Please sign in.') {
  return new HttpError(401, message);
}

function publicUser(row) {
  return { id: row.id, username: row.username, displayName: row.display_name, isOwner: row.is_owner };
}

export function readBearer(req) {
  const header = req.get('authorization') || '';
  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(header);
  return match ? match[1] : null;
}

export function createAuth({ db, secret, now = () => new Date() }) {
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must be set to at least 32 characters.');

  const byAddressAndName = createLimiter({ max: 5, windowMs: 15 * 60 * 1000, now: () => now().getTime() });
  const byAddress = createLimiter({ max: 25, windowMs: 15 * 60 * 1000, now: () => now().getTime() });

  function sign(userId, sessionId, expiresAt) {
    return jwt.sign(
      { sub: userId, sid: sessionId, iat: Math.floor(now().getTime() / 1000), exp: Math.floor(expiresAt.getTime() / 1000) },
      secret,
      { algorithm: 'HS256' }
    );
  }

  function verify(token) {
    try {
      return jwt.verify(token, secret, { algorithms: ['HS256'], clockTimestamp: Math.floor(now().getTime() / 1000) });
    } catch {
      return null;
    }
  }

  // Every /api route after sign-in goes through this: it sets req.ctx to the person and their own household
  async function authenticate(req, res, next) {
    const token = readBearer(req);
    const claims = token && verify(token);
    if (!claims || typeof claims.sid !== 'string' || typeof claims.sub !== 'string') throw unauthorized();
    let found;
    try {
      found = await db.query(
        `select s.id as session_id, s.expires_at, u.id, u.household_id, u.username, u.display_name, u.is_owner,
                h.name as household_name, h.time_zone, h.nudge_days
           from auth_sessions s
           join users u on u.id = s.user_id
           join households h on h.id = u.household_id
          where s.id = $1::uuid and s.user_id = $2::uuid and s.revoked_at is null and s.expires_at > $3::timestamptz`,
        [claims.sid, claims.sub, now()]
      );
    } catch (err) {
      // A token with a malformed id is just not valid
      if (err.code === '22P02') throw unauthorized();
      throw err;
    }
    const row = found.rows[0];
    if (!row) throw unauthorized();
    req.ctx = {
      householdId: row.household_id,
      householdName: row.household_name,
      timeZone: row.time_zone,
      nudgeDays: row.nudge_days,
      sessionId: row.session_id,
      sessionExpiresAt: row.expires_at,
      user: { id: row.id, username: row.username, displayName: row.display_name, isOwner: row.is_owner },
    };
    next();
  }

  async function login(req, res) {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!username || !password || username.length > 100 || password.length > 200) throw new HttpError(400, 'Enter your username and password.');

    const address = req.ip || 'unknown';
    const key = `${address}|${username}`;
    const wait = Math.max(byAddressAndName.retryAfter(key), byAddress.retryAfter(address));
    if (wait > 0) {
      res.set('Retry-After', String(wait));
      const minutes = Math.ceil(wait / 60);
      throw new HttpError(429, `Too many tries. Wait ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} and try again.`);
    }

    const found = await db.query(
      'select id, username, display_name, is_owner, password_hash from users where lower(username) = $1',
      [username]
    );
    const user = found.rows[0];
    const good = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
    if (!user || !user.password_hash || !good) {
      byAddressAndName.fail(key);
      byAddress.fail(address);
      throw unauthorized(BAD_LOGIN);
    }

    byAddressAndName.clear(key);
    const keep = body.keepSignedIn === true;
    const expiresAt = new Date(now().getTime() + (keep ? KEEP_DAYS * 24 : SESSION_HOURS) * 3600 * 1000);
    const session = await db.query(
      'insert into auth_sessions (user_id, expires_at, created_at) values ($1, $2, $3) returning id',
      [user.id, expiresAt, now()]
    );
    await db
      .query(`delete from auth_sessions where expires_at < $1::timestamptz - interval '7 days'`, [now()])
      .catch(() => {});
    res.json({ token: sign(user.id, session.rows[0].id, expiresAt), expiresAt: expiresAt.toISOString(), user: publicUser(user) });
  }

  async function logout(req, res) {
    await db.query('update auth_sessions set revoked_at = $2 where id = $1 and revoked_at is null', [req.ctx.sessionId, now()]);
    res.json({ ok: true });
  }

  function me(req, res) {
    const { ctx } = req;
    res.json({
      user: ctx.user,
      household: { name: ctx.householdName },
      expiresAt: new Date(ctx.sessionExpiresAt).toISOString(),
    });
  }

  return { authenticate, login, logout, me };
}
