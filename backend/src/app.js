import express from 'express';
import cors from 'cors';
import { segmentsRouter } from './routes/segments.js';
import { homeRouter } from './routes/home.js';
import { itemsRouter } from './routes/items.js';
import { inboxRouter } from './routes/inbox.js';
import { searchRouter } from './routes/search.js';
import { settingsRouter } from './routes/settings.js';
import { HttpError } from './errors.js';
import { contextMiddleware } from './context.js';

// Short hints only: never echo the connection string
function explainDbError(err) {
  const code = err.code || '';
  const msg = String(err.message || '');
  if (code === '42P01') return 'The database tables are missing. Run: npm run db:migrate';
  if (code === '28P01') return 'The database rejected the password. Check DATABASE_URL.';
  if (/tenant or user not found/i.test(msg))
    return 'Supabase did not recognise the user. The username should look like postgres.<project-ref>.';
  if (['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH'].includes(code) || /timeout/i.test(msg))
    return 'Cannot reach the database host. Check DATABASE_URL and use the Session pooler string.';
  return `Database error${code ? ` (code ${code})` : ''}. See the API console for details.`;
}

export function createApp({ db, corsOrigins, now }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: corsOrigins, exposedHeaders: ['Content-Disposition'] }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', async (req, res) => {
    const database = { ok: false };
    if (!db) {
      database.error = 'DATABASE_URL is not set in backend/.env';
    } else {
      const started = Date.now();
      try {
        const time = await db.query('select now() as server_time');
        database.serverTime = time.rows[0].server_time;
        database.latencyMs = Date.now() - started;

        const hh = await db.query('select count(*)::int as n from households');
        database.households = hh.rows[0].n;
        database.ok = true;
      } catch (err) {
        console.error('Health check database error:', err.code || '', err.message);
        database.error = explainDbError(err);
      }
    }
    res.status(database.ok ? 200 : 503).json({ status: database.ok ? 'ok' : 'degraded', database });
  });

  // Task 9 replaces this with sign-in: every /api route gets its user and household from here
  app.use('/api', contextMiddleware(db));

  app.use('/api/segments', segmentsRouter({ db, now }));
  app.use('/api/home', homeRouter({ db, now }));
  app.use('/api/inbox', inboxRouter({ db, now }));
  app.use('/api/items', itemsRouter({ db, now }));
  app.use('/api/search', searchRouter({ db, now }));
  app.use('/api', settingsRouter({ db, now }));

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));

  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
      return res.status(400).json({ error: 'That request couldn’t be read.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });
  return app;
}
