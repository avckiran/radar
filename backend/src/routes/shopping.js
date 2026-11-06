import { Router } from 'express';
import {
  addItem,
  archiveList,
  copyList,
  createList,
  deleteItem,
  deleteList,
  listShopping,
  loadList,
  reopenList,
  updateItem,
  updateList,
} from '../shopping.js';

export function shoppingRouter({ db }) {
  const router = Router();

  router.get('/', async (req, res) => {
    res.json(await listShopping(db, req.ctx));
  });

  router.post('/', async (req, res) => {
    const result = await createList(db, req.ctx, req.body);
    res.status(result.created ? 201 : 200).json(result);
  });

  router.get('/:id', async (req, res) => {
    res.json({ list: await loadList(db, req.ctx, req.params.id) });
  });

  router.patch('/:id', async (req, res) => {
    res.json(await updateList(db, req.ctx, req.params.id, req.body));
  });

  router.delete('/:id', async (req, res) => {
    res.json(await deleteList(db, req.ctx, req.params.id));
  });

  router.post('/:id/archive', async (req, res) => {
    res.json(await archiveList(db, req.ctx, req.params.id, req.body));
  });

  router.post('/:id/reopen', async (req, res) => {
    res.json(await reopenList(db, req.ctx, req.params.id, req.body));
  });

  router.post('/:id/copy', async (req, res) => {
    const result = await copyList(db, req.ctx, req.params.id, req.body);
    res.status(result.created ? 201 : 200).json(result);
  });

  router.post('/:id/items', async (req, res) => {
    res.status(201).json(await addItem(db, req.ctx, req.params.id, req.body));
  });

  router.patch('/:id/items/:itemId', async (req, res) => {
    res.json(await updateItem(db, req.ctx, req.params.id, req.params.itemId, req.body));
  });

  router.delete('/:id/items/:itemId', async (req, res) => {
    res.json(await deleteItem(db, req.ctx, req.params.id, req.params.itemId));
  });

  return router;
}
