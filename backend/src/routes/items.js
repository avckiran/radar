import { Router } from 'express';
import { getCurrentContext } from '../household.js';
import { ACTIONS, applyTransition } from '../lifecycle.js';
import { createItem } from '../capture.js';
import { sortItem } from '../sort.js';
import { deleteItem, logFollowUp, resetFollowUp, updateItem } from '../itemEdit.js';
import { loadDetail } from '../itemDetail.js';

export function itemsRouter({ db, now = () => new Date() }) {
  const router = Router();

  async function context(res) {
    if (!db) {
      res.status(503).json({ error: 'The database is not configured.' });
      return null;
    }
    const ctx = await getCurrentContext(db);
    if (!ctx) res.status(503).json({ error: 'No household yet. Run: npm run db:migrate, then npm run db:seed' });
    return ctx;
  }

  router.get('/:id', async (req, res) => {
    const ctx = await context(res);
    if (ctx) res.json(await loadDetail(db, ctx, req.params.id, now()));
  });

  router.patch('/:id', async (req, res) => {
    const ctx = await context(res);
    if (!ctx) return;
    await updateItem(db, { householdId: ctx.householdId, actorId: ctx.user.id }, req.params.id, req.body);
    res.json(await loadDetail(db, ctx, req.params.id, now()));
  });

  router.delete('/:id', async (req, res) => {
    const ctx = await context(res);
    if (ctx) res.json(await deleteItem(db, { householdId: ctx.householdId, actorId: ctx.user.id }, req.params.id));
  });

  router.post('/:id/follow-ups', async (req, res) => {
    const ctx = await context(res);
    if (!ctx) return;
    await logFollowUp(db, { householdId: ctx.householdId, actorId: ctx.user.id }, req.params.id, req.body);
    res.status(201).json(await loadDetail(db, ctx, req.params.id, now()));
  });

  router.post('/:id/follow-up-date', async (req, res) => {
    const ctx = await context(res);
    if (!ctx) return;
    await resetFollowUp(db, { householdId: ctx.householdId, actorId: ctx.user.id, timeZone: ctx.timeZone }, req.params.id, req.body, now());
    res.json(await loadDetail(db, ctx, req.params.id, now()));
  });

  router.post('/', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'The database is not configured.' });
    const ctx = await getCurrentContext(db);
    if (!ctx) return res.status(503).json({ error: 'No household yet. Run: npm run db:migrate, then npm run db:seed' });
    const result = await createItem(db, { householdId: ctx.householdId, actorId: ctx.user.id }, req.body);
    res.status(result.created ? 201 : 200).json(result);
  });

  router.post('/:id/sort', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'The database is not configured.' });
    const ctx = await getCurrentContext(db);
    if (!ctx) return res.status(503).json({ error: 'No household yet. Run: npm run db:migrate, then npm run db:seed' });
    const result = await sortItem(db, {
      householdId: ctx.householdId,
      actorId: ctx.user.id,
      itemId: req.params.id,
      segmentId: req.body?.segmentId,
      dueDate: req.body?.dueDate,
    });
    res.json(result);
  });

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
