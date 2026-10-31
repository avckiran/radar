import { todayInZone } from '../dates.js';
import { renderEmail } from './render.js';
import { buildDigest } from './content.js';
import { loadDigestData } from './data.js';

// A digest goes out any time after the person's send time, but not after this many hours late
export const LATE_HOURS = 6;
export const TICK_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 6; // per day, counting retries, so a broken mail account does not try forever
const STALE_SENDING_MINUTES = 10;
export const SLOTS = ['morning', 'afternoon', 'evening'];

function minutesOfDay(now, timeZone) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((x) => [x.type, x.value])
  );
  return Number(p.hour) * 60 + Number(p.minute);
}

function hhmmToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function digestFor({ data, user, household, now, appUrl, slot }) {
  return buildDigest({ ...data, user, household, now, appUrl, slot });
}

// Writing the claim BEFORE sending is what makes "never twice" true even if the server stops mid-send:
// a restart finds the row and leaves it alone.
async function claim(db, userId, localDate, slot, now) {
  const fresh = await db.query(
    `insert into digest_log (user_id, local_date, slot, status, attempts, claimed_at, sent_at)
     values ($1, $2, $3, 'sending', 0, $4, $4)
     on conflict (user_id, local_date, slot) do nothing
     returning id`,
    [userId, localDate, slot, now]
  );
  if (fresh.rows.length) return true;
  const again = await db.query(
    `update digest_log set status = 'sending', claimed_at = $4, error = null
      where user_id = $1 and local_date = $2 and slot = $3
        and (status = 'skipped' or (status = 'failed' and attempts < $5))
      returning id`,
    [userId, localDate, slot, now, MAX_ATTEMPTS]
  );
  return again.rows.length > 0;
}

export function createDigestRunner({ db, mailer, appUrl, now = () => new Date(), retryDelayMs = 60_000, log = console }) {
  let running = false;

  async function sendOne({ user, household, slot, now: at, cache }) {
    if (!cache.has(household.id)) cache.set(household.id, await loadDigestData(db, household.id, at));
    const model = digestFor({ data: cache.get(household.id), user, household, now: at, appUrl, slot });
    // Afternoon and evening only come when something needs attention. The morning email always comes.
    if (slot !== 'morning' && model.needsYou === 0) return { quiet: true, attempts: 0 };
    const email = renderEmail(model);
    let attempts = 0;
    let lastError = null;
    for (let tryNo = 0; tryNo < 2; tryNo++) {
      attempts += 1;
      try {
        await mailer.send({ to: user.email, ...email });
        return { ok: true, attempts, variant: model.variant };
      } catch (err) {
        lastError = err;
        if (tryNo === 0 && retryDelayMs > 0) await new Promise((r) => setTimeout(r, retryDelayMs));
      }
    }
    return { ok: false, attempts, error: String(lastError?.message || lastError).slice(0, 300) };
  }

  async function tick() {
    if (running) return { sent: 0, skipped: 0, failed: 0, quiet: 0, busy: true };
    running = true;
    const summary = { sent: 0, skipped: 0, failed: 0, quiet: 0 };
    try {
      const at = now();
      // A claim older than this means the server stopped mid-send. We cannot know whether it went out, so it is not retried.
      await db.query(
        `update digest_log set status = 'failed', attempts = $2,
                error = 'The server stopped while sending. Not retried, so it can never go out twice.'
          where status = 'sending' and claimed_at < $1::timestamptz - make_interval(mins => $3)`,
        [at, MAX_ATTEMPTS, STALE_SENDING_MINUTES]
      );

      const people = await db.query(
        `select u.id, u.username, u.display_name, u.email,
                u.digest_morning_enabled, to_char(u.digest_time, 'HH24:MI') as morning_time,
                u.digest_afternoon_enabled, to_char(u.digest_afternoon_time, 'HH24:MI') as afternoon_time,
                u.digest_evening_enabled, to_char(u.digest_evening_time, 'HH24:MI') as evening_time,
                h.id as household_id, h.name as household_name, h.time_zone, h.nudge_days
           from users u join households h on h.id = u.household_id
          where u.digest_enabled and u.email is not null
          order by u.created_at, u.username`
      );
      const cache = new Map();
      for (const row of people.rows) {
        const household = { id: row.household_id, name: row.household_name, timeZone: row.time_zone, nudgeDays: row.nudge_days };
        const slots = SLOTS.filter((name) => row[`digest_${name}_enabled`]).map((name) => ({ name, time: row[`${name}_time`] }));
        const user = {
          id: row.id,
          displayName: row.display_name,
          email: row.email,
          digestTime: row.morning_time,
          sendTimes: slots.map((x) => x.time),
        };
        const localDate = todayInZone(at, household.timeZone);
        const nowMin = minutesOfDay(at, household.timeZone);

        for (const { name: slot, time } of slots) {
          const sendAt = hhmmToMinutes(time);
          if (nowMin < sendAt) continue;

          if (nowMin > sendAt + LATE_HOURS * 60) {
            const seen = await db.query('select 1 from digest_log where user_id = $1 and local_date = $2 and slot = $3', [user.id, localDate, slot]);
            if (!seen.rows.length) {
              await db.query(
                `insert into digest_log (user_id, local_date, slot, status, attempts, error, claimed_at, sent_at)
                 values ($1, $2, $3, 'skipped', 0, $4, $5, $5) on conflict (user_id, local_date, slot) do nothing`,
                [user.id, localDate, slot, `Too late: the server was not running within ${LATE_HOURS} hours of the send time.`, at]
              );
              summary.skipped += 1;
              log.warn?.(`The ${slot} digest for ${row.username} was skipped: more than ${LATE_HOURS} hours past the send time.`);
            }
            continue;
          }

          if (!(await claim(db, user.id, localDate, slot, at))) continue;
          let result;
          try {
            result = await sendOne({ user, household, slot, now: at, cache });
          } catch (err) {
            result = { ok: false, attempts: 1, error: String(err.message || err).slice(0, 300) };
          }
          if (result.quiet) {
            await db.query(
              `update digest_log set status = 'quiet', error = 'Nothing needed attention, so no email was sent.'
                where user_id = $1 and local_date = $2 and slot = $3`,
              [user.id, localDate, slot]
            );
            summary.quiet += 1;
          } else if (result.ok) {
            await db.query(
              `update digest_log set status = 'sent', attempts = attempts + $2, sent_at = $3, error = null
                where user_id = $1 and local_date = $4 and slot = $5`,
              [user.id, result.attempts, now(), localDate, slot]
            );
            summary.sent += 1;
            log.log?.(`The ${slot} digest was sent to ${row.username} (${result.variant}).`);
          } else {
            await db.query(
              `update digest_log set status = 'failed', attempts = attempts + $2, error = $3
                where user_id = $1 and local_date = $4 and slot = $5`,
              [user.id, result.attempts, result.error, localDate, slot]
            );
            summary.failed += 1;
            log.error?.(`The ${slot} digest for ${row.username} failed: ${result.error}`);
          }
        }
      }
    } finally {
      running = false;
    }
    return summary;
  }

  return { tick };
}

export function startDigestScheduler(runner, { intervalMs = TICK_MS, firstDelayMs = 20_000, log = console } = {}) {
  const run = () => runner.tick().catch((err) => log.error(`Digest check failed: ${err.code || ''} ${err.message}`));
  const first = setTimeout(run, firstDelayMs);
  const timer = setInterval(run, intervalMs);
  first.unref?.();
  timer.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
