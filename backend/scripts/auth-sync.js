// Puts the passwords from backend/.env into the database (as scrambled hashes) and signs those people out everywhere.
// Run it after changing RADAR_PASSWORD_<USERNAME> in backend/.env:  npm run auth:sync
import bcrypt from 'bcryptjs';
import { config } from '../src/config.js';
import { createPool } from '../src/db.js';
import { MIN_PASSWORD, hashPassword, passwordProblem } from '../src/auth.js';

// Names used in the first sample data; renamed once to the real usernames
const RENAMES = { chandra: 'avckiran', komal: 'koarora6' };

if (!config.databaseUrl) {
  console.error('DATABASE_URL is not set. Copy backend/.env.example to backend/.env first.');
  process.exit(1);
}
if (!config.jwtSecret || config.jwtSecret.length < 32) {
  console.error('JWT_SECRET is missing or shorter than 32 characters. See backend/.env.example for how to make one.');
  process.exitCode = 1;
}

let db;
try {
  db = createPool(config);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
const client = await db.connect().catch((err) => {
  console.error('Could not connect:', err.code || '', err.message);
  process.exit(1);
});

try {
  await client.query('begin');
  const users = (await client.query('select id, username, password_hash, email from users order by created_at, username')).rows;

  for (const user of users) {
    const wanted = RENAMES[user.username.toLowerCase()];
    if (!wanted) continue;
    const taken = users.some((u) => u.username.toLowerCase() === wanted);
    if (taken) continue;
    await client.query('update users set username = $2, updated_at = now() where id = $1', [user.id, wanted]);
    console.log(`Renamed ${user.username} to ${wanted}.`);
    user.username = wanted;
  }

  const results = [];
  for (const user of users) {
    const emailName = `RADAR_EMAIL_${user.username.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
    const email = (process.env[emailName] || '').trim();
    if (email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        results.push({ username: user.username, result: `${emailName} is not a valid address` });
        process.exitCode = 1;
      } else if ((user.email || '').toLowerCase() !== email.toLowerCase()) {
        await client.query('update users set email = $2, updated_at = now() where id = $1', [user.id, email]);
        results.push({ username: user.username, result: `email set (${email.replace(/^(.).*(@.*)$/, '$1***$2')})` });
      }
    }
    const name = `RADAR_PASSWORD_${user.username.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
    const password = process.env[name];
    if (!password) {
      results.push({ username: user.username, result: user.password_hash ? 'kept the existing password' : `NO PASSWORD: set ${name}` });
      continue;
    }
    const problem = passwordProblem(password);
    if (problem) {
      results.push({ username: user.username, result: `${name} not used. ${problem}` });
      process.exitCode = 1;
      continue;
    }
    if (user.password_hash && (await bcrypt.compare(password, user.password_hash))) {
      results.push({ username: user.username, result: 'unchanged' });
      continue;
    }
    await client.query('update users set password_hash = $2, updated_at = now() where id = $1', [user.id, hashPassword(password)]);
    await client.query('update auth_sessions set revoked_at = now() where user_id = $1 and revoked_at is null', [user.id]);
    results.push({ username: user.username, result: user.password_hash ? 'password changed, signed out everywhere' : 'password set' });
  }
  await client.query('commit');
  console.table(results);
  console.log(`Passwords need at least ${MIN_PASSWORD} characters. Nothing secret was printed.`);
} catch (err) {
  await client.query('rollback').catch(() => {});
  if (err.code === '42P01') console.error('A table is missing. Run: npm run db:migrate');
  else console.error('Sync failed:', err.code || '', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await db.end();
}
