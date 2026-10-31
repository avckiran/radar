// Emails a digest to the owner so you can see it in your real mail app.
//   npm run digest:send-test              the owner's real digest, as of right now
//   npm run digest:send-test -- --sample  the three sample variants (normal, empty, all clear)
//   add  --to someone@example.com  to send somewhere else
// This does not count as the day's digest.
import { config } from '../src/config.js';
import { createPool } from '../src/db.js';
import { buildDigest } from '../src/digest/content.js';
import { loadDigestData } from '../src/digest/data.js';
import { createMailer } from '../src/digest/mailer.js';
import { renderEmail } from '../src/digest/render.js';
import { SAMPLE_HOUSEHOLD, SAMPLE_USER, SAMPLE_VARIANTS, sampleInputs } from '../src/digest/sampleData.js';

const mailer = createMailer(config);
if (!mailer) {
  console.error('Email is not set up. Put SMTP_USER and SMTP_PASS in backend/.env (see .env.example), then try again.');
  process.exit(1);
}
const toIndex = process.argv.indexOf('--to');
const override = toIndex > 0 ? process.argv[toIndex + 1] : null;
const sample = process.argv.includes('--sample');

try {
  await mailer.verify();
} catch (err) {
  console.error(`Could not sign in to the mail account: ${err.message}`);
  console.error('Check SMTP_USER and SMTP_PASS. For Gmail the password must be an app password, not the normal one.');
  process.exit(1);
}

let db;
try {
  if (sample) {
    if (!override) {
      console.error('Sample mode needs somewhere to send: add  --to you@example.com');
      process.exit(1);
    }
    for (const variant of SAMPLE_VARIANTS) {
      const { data, now } = sampleInputs(variant);
      const email = renderEmail(buildDigest({ ...data, user: { ...SAMPLE_USER, email: override }, household: SAMPLE_HOUSEHOLD, now, appUrl: config.appUrl }));
      await mailer.send({ to: override, ...email, subject: `[Sample] ${email.subject}` });
      console.log(`Sent sample: ${email.subject}`);
    }
  } else {
    if (!config.databaseUrl) {
      console.error('DATABASE_URL is not set in backend/.env.');
      process.exit(1);
    }
    db = createPool(config);
    const found = await db.query(
      `select u.display_name, u.email, to_char(u.digest_time, 'HH24:MI') as digest_time, h.id as hid, h.name, h.time_zone, h.nudge_days
         from users u join households h on h.id = u.household_id
        where u.is_owner order by u.created_at, u.username limit 1`
    );
    const owner = found.rows[0];
    const to = override || owner?.email;
    if (!owner || !to) {
      console.error('The owner has no email address yet. Set RADAR_EMAIL_AVCKIRAN in backend/.env and run: npm run auth:sync -w backend');
      process.exit(1);
    }
    const now = new Date();
    const data = await loadDigestData(db, owner.hid, now);
    const email = renderEmail(
      buildDigest({
        ...data,
        user: { displayName: owner.display_name, email: to, digestTime: owner.digest_time },
        household: { name: owner.name, timeZone: owner.time_zone, nudgeDays: owner.nudge_days },
        now,
        appUrl: config.appUrl,
      })
    );
    await mailer.send({ to, ...email, subject: `[Test] ${email.subject}` });
    console.log(`Sent a ${email.subject.toLowerCase()} test to ${to.replace(/^(.).*(@.*)$/, '$1***$2')}.`);
  }
} catch (err) {
  console.error(`Sending failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await db?.end();
}
