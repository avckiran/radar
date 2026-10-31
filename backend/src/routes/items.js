import { Router } from 'express';
import { ACTIONS, applyTransition } from '../lifecycle.js';
import { createItem } from '../capture.js';
import { sortItem } from '../sort.js';
import { deleteItem, logFollowUp, resetFollowUp, updateItem } from '../itemEdit.js';
import { loadDetail } from '../itemDetail.js';
import { deleteArchived } from '../archive.js';

export function itemsRouter({ db, now = () => new Date() }) {
  const router = Router();

  // Registered before /:id so “archived” is not read as an item id
  router.delete('/archived', async (req, res) => {
    res.json(await deleteArchived(db, req.ctx, req.body));
  });

  router.get('/:id', async (req, res) => {
    res.json(await loadDetail(db, req.ctx, req.params.id, now()));
  });

  router.patch('/:id', async (req, res) => {
    const ctx = req.ctx;
    await updateItem(db, { householdId: ctx.householdId, actorId: ctx.user.id }, req.params.id, req.body);
    res.json(await loadDetail(db, ctx, req.params.id, now()));
  });

  router.delete('/:id', async (req, res) => {
    const ctx = req.ctx;
    res.json(await deleteItem(db, { householdId: ctx.householdId, actorId: ctx.user.id }, req.params.id));
  });

  router.post('/:id/follow-ups', async (req, res) => {
    const ctx = req.ctx;
    await logFollowUp(db, { householdId: ctx.householdId, actorId: ctx.user.id }, req.params.id, req.body);
    res.status(201).json(await loadDetail(db, ctx, req.params.id, now()));
  });

  router.post('/:id/follow-up-date', async (req, res) => {
    const ctx = req.ctx;
    await resetFollowUp(db, { householdId: ctx.householdId, actorId: ctx.user.id, timeZone: ctx.timeZone }, req.params.id, req.body, now());
    res.json(await loadDetail(db, ctx, req.params.id, now()));
  });

  router.post('/', async (req, res) => {
    const ctx = req.ctx;
    const result = await createItem(db, { householdId: ctx.householdId, actorId: ctx.user.id }, req.body);
    res.status(result.created ? 201 : 200).json(result);
  });

  router.post('/:id/sort', async (req, res) => {
    const ctx = req.ctx;
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
      const ctx = req.ctx;
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
