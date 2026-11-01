import dotenv from 'dotenv';

dotenv.config({ quiet: true });

export const config = {
  port: Number(process.env.PORT) || 3001,
  // Which network address to listen on. Empty means all (fine on your computer). The server unit sets 127.0.0.1 so only the proxy on the same machine can reach it.
  host: process.env.HOST || '',
  databaseUrl: process.env.DATABASE_URL || '',

  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // Signs sign-in tokens. At least 32 characters; keep it secret and never change it casually (it signs everyone out)
  jwtSecret: process.env.JWT_SECRET || '',
  // Number of proxies in front of the API (1 on most hosts) so the sign-in limit sees the real address
  trustProxy: Number.parseInt(process.env.TRUST_PROXY, 10) || 0,
  // Daily digest email (Gmail: smtp.gmail.com with an app password). Leave SMTP_USER and SMTP_PASS empty to switch it off.
  smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
  smtpPort: Number(process.env.SMTP_PORT) || 465,
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  mailFrom: process.env.MAIL_FROM || '',
  // Where links in emails point: the address of the front end (GitHub Pages)
  appUrl: process.env.APP_URL || 'http://localhost:5173',
  dbSslCaPath: process.env.DB_SSL_CA_PATH || '',
};
