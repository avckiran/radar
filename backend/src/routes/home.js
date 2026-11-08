import { Router } from 'express';
import { buildHome } from '../rules/home.js';
import { ITEM_COLUMNS, ITEM_JOINS } from '../queries.js';
import { listShopping } from '../shopping.js';

export function homeRouter({ db, now = () => new Date() }) {
  const router = Router();

  router.get('/', async (req, res) => {
    const ctx = req.ctx;

    const open = await db.query(
      `select ${ITEM_COLUMNS}
         from items i
         ${ITEM_JOINS}
        where i.household_id = $1 and i.deleted_at is null and i.state <> 'done'`,
      [ctx.householdId]
    );
    const shopping = await listShopping(db, ctx);

    res.json({
      household: { name: ctx.householdName },
      user: ctx.user,
      ...buildHome({
        openItems: open.rows,
        shoppingOpen: shopping.open,
        now: now(),
        timeZone: ctx.timeZone,
      }),
    });
  });

  return router;
}
