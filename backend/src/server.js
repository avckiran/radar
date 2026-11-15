import { config } from './config.js';
import { createPool } from './db.js';
import { createApp } from './app.js';
import { createMailer } from './digest/mailer.js';
import { createDigestRunner, startDigestScheduler } from './digest/scheduler.js';
import { createPusher } from './push.js';

let db = null;
if (config.databaseUrl) {
  try {
    db = createPool(config);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
if (!db) console.warn('DATABASE_URL is not set. Copy backend/.env.example to backend/.env and fill it in.');

// Web push is on when the server has its keys (npm run push:keys). The push services need to know who to contact: APP_URL by default.
const pusher = createPusher({
  publicKey: config.vapidPublicKey,
  privateKey: config.vapidPrivateKey,
  subject: config.vapidSubject || (config.appUrl.startsWith('https://') ? config.appUrl : config.smtpUser ? `mailto:${config.smtpUser}` : ''),
});

let app;
try {
  app = createApp({ db, corsOrigins: config.corsOrigins, jwtSecret: config.jwtSecret, trustProxy: config.trustProxy, pusher });
} catch (err) {
  console.error(`${err.message} Add it to backend/.env (see backend/.env.example).`);
  process.exit(1);
}
const onListening = () => console.log(`RADAR API listening on http://${config.host || 'localhost'}:${config.port}`);
if (config.host) app.listen(config.port, config.host, onListening);
else app.listen(config.port, onListening);

// The daily digest and notifications run inside this server: every 15 minutes it looks for anyone whose send time has passed
const mailer = createMailer(config);
if (db && (mailer || pusher)) {
  startDigestScheduler(createDigestRunner({ db, mailer, pusher, appUrl: config.appUrl }));
  console.log(`Daily digest is on (checked every 15 minutes): email ${mailer ? 'on' : 'off'}, notifications ${pusher ? 'on' : 'off'}.`);
} else if (db) {
  console.warn('Daily digest is off: set SMTP_USER and SMTP_PASS in backend/.env (see .env.example).');
}
