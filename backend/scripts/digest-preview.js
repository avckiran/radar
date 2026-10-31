// Writes each digest variant (HTML and plain text) to backend/digest-preview/ so you can open them in a browser.
//   npm run digest:preview             made-up sample data
//   npm run digest:preview -- --live   each person's real digest, from the database, as of right now
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config.js';
import { createPool } from '../src/db.js';
import { buildDigest } from '../src/digest/content.js';
import { loadDigestData } from '../src/digest/data.js';
import { renderEmail } from '../src/digest/render.js';
import { SAMPLE_HOUSEHOLD, SAMPLE_USER, SAMPLE_VARIANTS, sampleInputs } from '../src/digest/sampleData.js';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'digest-preview');
fs.mkdirSync(out, { recursive: true });
const written = [];
const sendTimesOf = (p) => ['morning', 'afternoon', 'evening'].filter((n) => p[`digest_${n}_enabled`]).map((n) => p[`${n}_time`]);

function write(name, model) {
  const email = renderEmail(model);
  fs.writeFileSync(path.join(out, `${name}.html`), email.html);
  fs.writeFileSync(path.join(out, `${name}.txt`), email.text);
  written.push(`${name}  (${model.variant}, subject: ${email.subject})`);
}

if (process.argv.includes('--live')) {
  if (!config.databaseUrl) {
    console.error('DATABASE_URL is not set in backend/.env.');
    process.exit(1);
  }
  const db = createPool(config);
  try {
    const now = new Date();
    const people = await db.query(
      `select u.username, u.display_name, coalesce(u.email, 'no-email-saved@example.com') as email,
              u.digest_morning_enabled, to_char(u.digest_time, 'HH24:MI') as morning_time,
              u.digest_afternoon_enabled, to_char(u.digest_afternoon_time, 'HH24:MI') as afternoon_time,
              u.digest_evening_enabled, to_char(u.digest_evening_time, 'HH24:MI') as evening_time, h.id as hid, h.name, h.time_zone, h.nudge_days
         from users u join households h on h.id = u.household_id order by u.created_at, u.username`
    );
    for (const p of people.rows) {
      const data = await loadDigestData(db, p.hid, now);
      write(
        `live-${p.username}`,
        buildDigest({
          ...data,
          user: { displayName: p.display_name, email: p.email, digestTime: p.morning_time, sendTimes: sendTimesOf(p) },
          household: { name: p.name, timeZone: p.time_zone, nudgeDays: p.nudge_days },
          now,
          appUrl: config.appUrl,
        })
      );
    }
  } finally {
    await db.end();
  }
} else {
  for (const variant of SAMPLE_VARIANTS) {
    const { data, now } = sampleInputs(variant);
    write(variant, buildDigest({ ...data, user: SAMPLE_USER, household: SAMPLE_HOUSEHOLD, now, appUrl: 'https://radar.example/app' }));
  }
  // The afternoon and evening emails use the same layouts with their own subject and intro
  for (const slot of ['afternoon', 'evening']) {
    const { data, now } = sampleInputs('normal');
    write(`normal-${slot}`, buildDigest({ ...data, user: { ...SAMPLE_USER, sendTimes: ['08:00', '14:00', '18:00'] }, household: SAMPLE_HOUSEHOLD, now, appUrl: 'https://radar.example/app', slot }));
  }
}
console.log(`Wrote to ${path.relative(process.cwd(), out) || '.'}:`);
for (const line of written) console.log(`  ${line}`);
