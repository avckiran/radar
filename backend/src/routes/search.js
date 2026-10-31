import { Router } from 'express';
import { runSearch } from '../search.js';

export function searchRouter({ db, now = () => new Date() }) {
  const router = Router();

  router.get('/', async (req, res) => {
    const ctx = req.ctx;
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json(await runSearch(db, ctx, q, now()));
  });

  return router;
}
