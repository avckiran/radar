import { Router } from 'express';
import { getCurrentContext } from '../household.js';
import { ACTIONS, applyTransition } from '../lifecycle.js';

export function itemsRouter({ db, now = () => new Date() }) {
  const router = Router();

  for (const action of ACTIONS) {
    router.post(`/:id/${action}`, async (req, res) => {
      if (!db) return res.status(503).json({ error: 'The database is not configured.' });
      const ctx = await getCurrentContext(db);
      if (!ctx) return res.status(503).json({ error: 'No household yet. Run: npm run db:migrate, then npm run db:seed' });
      const result = await applyTransition(db, {
        householdId: ctx.householdId,
        actorId: ctx.user.id,
        itemId: req.params.id,
        action,
        body: req.body,
        timeZone: ctx.timeZone,
        now: now(),
      });
      res.json(result);
    });
  }

  return router;
}
