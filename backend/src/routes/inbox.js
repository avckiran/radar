import { Router } from 'express';
import { buildInbox } from '../rules/inbox.js';

export function inboxRouter({ db, now = () => new Date() }) {
  const router = Router();

  router.get('/', async (req, res) => {
    const ctx = req.ctx;
    const result = await db.query(
      `select i.id, i.kind, i.title, i.url, i.created_at, u.display_name as creator
         from items i
         left join users u on u.id = i.created_by
        where i.household_id = $1 and i.state = 'inbox' and i.deleted_at is null
        order by i.created_at asc, i.title`,
      [ctx.householdId]
    );
    res.json({ user: ctx.user, ...buildInbox(result.rows, { now: now(), timeZone: ctx.timeZone }) });
  });

  return router;
}
