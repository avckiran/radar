import { Router } from 'express';
import { getCurrentContext } from '../household.js';

export function segmentsRouter({ db }) {
  const router = Router();

  router.get('/', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'The database is not configured.' });
    const ctx = await getCurrentContext(db);
    if (!ctx) {
      return res.status(503).json({ error: 'No household yet. Run: npm run db:migrate, then npm run db:seed' });
    }
    const segments = await db.query(
      `select s.id, s.name, s.color, s.sort_order as "sortOrder", s.protected,
              count(i.id) filter (where i.kind = 'action' and i.state = 'active')::int as "activeCount"
         from segments s
         left join items i on i.segment_id = s.id and i.deleted_at is null
        where s.household_id = $1 and s.deleted_at is null
        group by s.id
        order by s.sort_order, s.name`,
      [ctx.householdId]
    );
    const inbox = await db.query(
      `select count(*)::int as n from items
        where household_id = $1 and state = 'inbox' and deleted_at is null`,
      [ctx.householdId]
    );
    res.json({
      household: { name: ctx.householdName },
      user: ctx.user,
      inboxCount: inbox.rows[0].n,
      segments: segments.rows,
    });
  });

  return router;
}
