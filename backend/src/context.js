import { getCurrentContext } from './household.js';

// Puts the signed-in person and their household on req.ctx for every /api route
export function contextMiddleware(db) {
  return async (req, res, next) => {
    if (!db) return res.status(503).json({ error: 'The database is not configured.' });
    const ctx = await getCurrentContext(db);
    if (!ctx) return res.status(503).json({ error: 'No household yet. Run: npm run db:migrate, then npm run db:seed' });
    req.ctx = ctx;
    next();
  };
}
