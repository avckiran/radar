import { Router } from 'express';
import { getCurrentContext } from '../household.js';
import { runSearch } from '../search.js';

export function searchRouter({ db, now = () => new Date() }) {
  const router = Router();

  router.get('/', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'The database is not configured.' });
    const ctx = await getCurrentContext(db);
    if (!ctx) return res.status(503).json({ error: 'No household yet. Run: npm run db:migrate, then npm run db:seed' });
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json(await runSearch(db, ctx, q, now()));
  });

  return router;
}
