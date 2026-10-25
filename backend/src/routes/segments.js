import { Router } from 'express';
import { getCurrentContext } from '../household.js';
import { todayInZone } from '../dates.js';
import { HttpError, isUuid } from '../errors.js';
import { COMPLETED_BY, ITEM_COLUMNS, ITEM_JOINS } from '../queries.js';
import { buildSegmentView, doneRows, DONE_PAGE } from '../rules/segmentView.js';

export function segmentsRouter({ db, now = () => new Date() }) {
  const router = Router();

  router.get('/', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'The database is not configured.' });
    const ctx = await getCurrentContext(db);
    if (!ctx) {
      return res.status(503).json({ error: 'No household yet. Run: npm run db:migrate, then npm run db:seed' });
    }
    const segments = await db.query(
      `select s.id, s.name, s.color, s.sort_order as "sortOrder", s.protected,
              count(i.id) filter (
                where i.kind = 'action'
                  and (i.state = 'active' or (i.state = 'snoozed' and i.snoozed_until <= $2::date))
              )::int as "activeCount"
         from segments s
         left join items i on i.segment_id = s.id and i.deleted_at is null
        where s.household_id = $1 and s.deleted_at is null
        group by s.id
        order by s.sort_order, s.name`,
      [ctx.householdId, todayInZone(now(), ctx.timeZone)]
    );
    const inbox = await db.query(
      `select count(*)::int as n from items
        where household_id = $1 and state = 'inbox' and deleted_at is null`,
      [ctx.householdId]
    );
    res.json({
      household: { name: ctx.householdName },
      today: todayInZone(now(), ctx.timeZone),
      user: ctx.user,
      inboxCount: inbox.rows[0].n,
      segments: segments.rows,
    });
  });

  async function loadSegment(ctx, id) {
    if (!isUuid(id)) throw new HttpError(404, 'Segment not found.');
    const found = await db.query(
      'select id, name, color from segments where id = $1 and household_id = $2 and deleted_at is null',
      [id, ctx.householdId]
    );
    if (!found.rows[0]) throw new HttpError(404, 'Segment not found.');
    return found.rows[0];
  }

  router.get('/:id', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'The database is not configured.' });
    const ctx = await getCurrentContext(db);
    if (!ctx) return res.status(503).json({ error: 'No household yet. Run: npm run db:migrate, then npm run db:seed' });
    const segment = await loadSegment(ctx, req.params.id);
    const params = [segment.id, ctx.householdId];
    const open = await db.query(
      `select ${ITEM_COLUMNS}
         from items i
         ${ITEM_JOINS}
        where i.segment_id = $1 and i.household_id = $2 and i.deleted_at is null and i.state not in ('done', 'inbox')`,
      params
    );
    const done = await db.query(
      `select ${ITEM_COLUMNS}, doer.display_name as completed_by
         from items i
         ${ITEM_JOINS}
         ${COMPLETED_BY}
        where i.segment_id = $1 and i.household_id = $2 and i.deleted_at is null and i.state = 'done'
        order by i.completed_at desc nulls last, i.title
        limit ${DONE_PAGE}`,
      params
    );
    const count = await db.query(
      `select count(*)::int as n from items
        where segment_id = $1 and household_id = $2 and deleted_at is null and state = 'done'`,
      params
    );
    res.json(
      buildSegmentView({
        segment,
        items: open.rows,
        doneCount: count.rows[0].n,
        doneItems: done.rows,
        now: now(),
        timeZone: ctx.timeZone,
      })
    );
  });

  router.get('/:id/done', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'The database is not configured.' });
    const ctx = await getCurrentContext(db);
    if (!ctx) return res.status(503).json({ error: 'No household yet. Run: npm run db:migrate, then npm run db:seed' });
    const segment = await loadSegment(ctx, req.params.id);
    const offset = Math.max(0, Math.min(100000, Number.parseInt(req.query.offset, 10) || 0));
    const rows = await db.query(
      `select ${ITEM_COLUMNS}, doer.display_name as completed_by
         from items i
         ${ITEM_JOINS}
         ${COMPLETED_BY}
        where i.segment_id = $1 and i.household_id = $2 and i.deleted_at is null and i.state = 'done'
        order by i.completed_at desc nulls last, i.title
        limit ${DONE_PAGE} offset ${offset}`,
      [segment.id, ctx.householdId]
    );
    res.json({ items: doneRows(rows.rows, ctx.timeZone) });
  });

  return router;
}
