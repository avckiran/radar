import dotenv from 'dotenv';

dotenv.config({ quiet: true });

export const config = {
  port: Number(process.env.PORT) || 3001,
  databaseUrl: process.env.DATABASE_URL || '',

  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // Signs sign-in tokens. At least 32 characters; keep it secret and never change it casually (it signs everyone out)
  jwtSecret: process.env.JWT_SECRET || '',
  // Number of proxies in front of the API (1 on most hosts) so the sign-in limit sees the real address
  trustProxy: Number.parseInt(process.env.TRUST_PROXY, 10) || 0,
  dbSslCaPath: process.env.DB_SSL_CA_PATH || '',
};
