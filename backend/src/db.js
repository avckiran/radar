import fs from 'node:fs';
import pg from 'pg';

// Return calendar dates as plain 'YYYY-MM-DD' strings instead of shifting them through the server's time zone
pg.types.setTypeParser(1082, (value) => value);

export function createPool(config) {
  let url;
  try {
    url = new URL(config.databaseUrl);
  } catch {

    throw new Error(
      'DATABASE_URL is not a valid URL. If the password has special characters, percent-encode them.'
    );
  }

  // pg would let sslmode in the URL override the ssl option below
  url.searchParams.delete('sslmode');

  // Encrypted but not identity-checked unless DB_SSL_CA_PATH is set (set it before go-live)
  const ssl = config.dbSslCaPath
    ? { ca: fs.readFileSync(config.dbSslCaPath, 'utf8'), rejectUnauthorized: true }
    : { rejectUnauthorized: false };

  const pool = new pg.Pool({
    connectionString: url.toString(),
    ssl,
    max: 5,
    connectionTimeoutMillis: 8000,
  });

  pool.on('error', (err) => console.error('Idle database connection error:', err.code || err.message));
  return pool;
}

export async function withTransaction(db, fn) {
  if (typeof db.connect !== 'function') return fn(db);
  const client = await db.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
