import { config } from './config.js';
import { createPool } from './db.js';
import { createApp } from './app.js';

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

let app;
try {
  app = createApp({ db, corsOrigins: config.corsOrigins, jwtSecret: config.jwtSecret, trustProxy: config.trustProxy });
} catch (err) {
  console.error(`${err.message} Add it to backend/.env (see backend/.env.example).`);
  process.exit(1);
}
app.listen(config.port, () => console.log(`RADAR API listening on http://localhost:${config.port}`));
