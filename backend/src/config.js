// All settings come from environment variables (backend/.env in development).
// Nothing secret is ever hard-coded here.
import dotenv from 'dotenv';

// quiet: don't print a banner every start. Reads backend/.env (run from the backend folder).
dotenv.config({ quiet: true });

export const config = {
  port: Number(process.env.PORT) || 3001,
  databaseUrl: process.env.DATABASE_URL || '',
  // Comma-separated list of browser origins allowed to call this API.
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  dbSslCaPath: process.env.DB_SSL_CA_PATH || '',
};
