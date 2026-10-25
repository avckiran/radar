import { config } from './config.js';
import { createPool } from './db.js';
import { createApp } from './app.js';

// The API starts even without a database so /health can say what is wrong.
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

const app = createApp({ db, corsOrigins: config.corsOrigins });
app.listen(config.port, () => console.log(`RADAR API listening on http://localhost:${config.port}`));
