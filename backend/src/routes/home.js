import { Router } from 'express';
import { buildHome } from '../rules/home.js';
import { COMPLETED_BY, ITEM_COLUMNS, ITEM_JOINS } from '../queries.js';

export function homeRouter({ db, now = () => new Date() }) {
  const router = Router();

  router.get('/', async (req, res) => {
    const ctx = req.ctx;

    const segments = await db.query(
      `select id, name, color from segments
        where household_id = $1 and deleted_at is null
        order by sort_order, name`,
      [ctx.householdId]
    );
    const open = await db.query(
      `select ${ITEM_COLUMNS}
         from items i
         ${ITEM_JOINS}
        where i.household_id = $1 and i.deleted_at is null and i.state <> 'done'`,
      [ctx.householdId]
    );
    const done = await db.query(
      `select ${ITEM_COLUMNS}, doer.display_name as completed_by
         from items i
         ${ITEM_JOINS}
         ${COMPLETED_BY}
        where i.household_id = $1 and i.deleted_at is null and i.state = 'done'
        order by i.completed_at desc nulls last
        limit 5`,
      [ctx.householdId]
    );

    res.json({
      household: { name: ctx.householdName },
      user: ctx.user,
      ...buildHome({
        openItems: open.rows,
        doneItems: done.rows,
        segments: segments.rows,
        now: now(),
        timeZone: ctx.timeZone,
        nudgeDays: ctx.nudgeDays,
      }),
    });
  });

  return router;
}
