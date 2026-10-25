import { Router } from 'express';
import { getCurrentContext } from '../household.js';
import { buildHome } from '../rules/home.js';

const ITEM_COLUMNS = `i.id, i.kind, i.state, i.title, i.due_date, i.snoozed_until, i.follow_up_date,
       i.waiting_since, i.created_at, i.completed_at, i.segment_id,
       s.name as segment_name, s.color as segment_color, u.display_name as creator`;

export function homeRouter({ db, now = () => new Date() }) {
  const router = Router();

  router.get('/', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'The database is not configured.' });
    const ctx = await getCurrentContext(db);
    if (!ctx) return res.status(503).json({ error: 'No household yet. Run: npm run db:migrate, then npm run db:seed' });

    const segments = await db.query(
      `select id, name, color from segments
        where household_id = $1 and deleted_at is null
        order by sort_order, name`,
      [ctx.householdId]
    );
    const open = await db.query(
      `select ${ITEM_COLUMNS}
         from items i
         left join segments s on s.id = i.segment_id
         left join users u on u.id = i.created_by
        where i.household_id = $1 and i.deleted_at is null and i.state <> 'done'`,
      [ctx.householdId]
    );
    const done = await db.query(
      `select ${ITEM_COLUMNS}, doer.display_name as completed_by
         from items i
         left join segments s on s.id = i.segment_id
         left join users u on u.id = i.created_by
         left join lateral (
           select a.display_name
             from item_events e join users a on a.id = e.actor_id
            where e.item_id = i.id and e.type = 'completed'
            order by e.created_at desc limit 1
         ) doer on true
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
