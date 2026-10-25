// One shared Postgres connection pool. Only the backend ever talks to Supabase.
import fs from 'node:fs';
import pg from 'pg';

export function createPool(config) {
  let url;
  try {
    url = new URL(config.databaseUrl);
  } catch {
    // Don't echo the value back: it contains the password.
    throw new Error(
      'DATABASE_URL is not a valid URL. If the password has special characters, percent-encode them.'
    );
  }
  // The pg library would let "sslmode" in the URL override our ssl setting below, so remove it.
  url.searchParams.delete('sslmode');

  // Supabase requires an encrypted connection. Without its CA file we still encrypt but cannot
  // verify the server's identity; supply DB_SSL_CA_PATH at go-live to close that gap.
  const ssl = config.dbSslCaPath
    ? { ca: fs.readFileSync(config.dbSslCaPath, 'utf8'), rejectUnauthorized: true }
    : { rejectUnauthorized: false };

  const pool = new pg.Pool({
    connectionString: url.toString(),
    ssl,
    max: 5, // small on purpose: this is a two-person app on a free database
    connectionTimeoutMillis: 8000,
  });
  // An idle connection can be dropped by the server; log it instead of crashing.
  pool.on('error', (err) => console.error('Idle database connection error:', err.code || err.message));
  return pool;
}
