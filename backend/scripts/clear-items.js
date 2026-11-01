// One-time clean-up for going from test data to real use: removes EVERY item and its history.
// Keeps both people, passwords, settings, segments, sign-ins and the daily-email log.
//
//   npm run db:clear-items -w backend             shows what would be deleted (changes nothing)
//   npm run db:clear-items -w backend -- --yes    asks you to type a phrase, then deletes
//
// Before you run it for real: export your data from the app (Settings > Your data) and, on the server,
// run a backup (sudo systemctl start radar-backup). Deleted items cannot be brought back without a backup.
import readline from 'node:readline/promises';
import { config } from '../src/config.js';
import { createPool } from '../src/db.js';
import { clearItems, describeItems } from '../src/clearItems.js';

const PHRASE = 'DELETE ALL ITEMS';

if (!config.databaseUrl) {
  console.error('DATABASE_URL is not set. Copy backend/.env.example to backend/.env first.');
  process.exit(1);
}
let db;
try {
  db = createPool(config);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

try {
  const host = new URL(config.databaseUrl).hostname;
  const before = await describeItems(db);
  const states = Object.entries(before.byState).map(([k, v]) => `${v} ${k}`).join(', ') || 'none';
  console.log(`Database: ${host}`);
  console.log('');
  console.log('Would be deleted:');
  console.log(`  items:                 ${before.items} (${states}${before.deleted ? `, plus ${before.deleted} already deleted` : ''})`);
  console.log(`  history entries:       ${before.events}`);
  console.log('Stays as it is:');
  console.log(`  people: ${before.users}   segments: ${before.segments}   settings, passwords and sign-ins`);
  console.log('');

  if (!process.argv.includes('--yes')) {
    console.log('Nothing was changed. To go ahead, run again with:  -- --yes');
    process.exit(0);
  }
  if (before.items === 0 && before.events === 0) {
    console.log('There is nothing to delete.');
    process.exit(0);
  }
  if (!process.stdin.isTTY) {
    console.error('This needs you at the keyboard to type the confirmation phrase. Run it in a terminal.');
    process.exit(1);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`Type ${PHRASE} to confirm (anything else cancels): `)).trim();
  rl.close();
  if (answer !== PHRASE) {
    console.log('Cancelled. Nothing was changed.');
    process.exit(0);
  }

  const done = await clearItems(db, { expectedItems: before.items });
  const after = await describeItems(db);
  console.log('');
  console.log(`Deleted ${done.items} items and ${done.events} history entries.`);
  console.log(`Now: ${after.items} items, ${after.users} people, ${after.segments} segments. You can start fresh.`);
} catch (err) {
  console.error(`Stopped: ${err.message}`);
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
}
