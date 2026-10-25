import express from 'express';
import cors from 'cors';
import { segmentsRouter } from './routes/segments.js';

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

export function createApp({ db, corsOrigins }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: corsOrigins }));

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

  app.use('/api/segments', segmentsRouter({ db }));

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });
  return app;
}
