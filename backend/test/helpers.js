// Tests that use a pretend database skip sign-in: this stands in for it and always "signs in" the first owner.
export function openContext(db) {
  return async (req, res, next) => {
    const hh = await db.query('select id, name, time_zone, nudge_days from households order by created_at limit 1');
    const household = hh.rows[0];
    if (!household) return res.status(503).json({ error: 'No household yet. Run: npm run db:migrate, then npm run db:seed' });
    const owner = await db.query(
      'select id, display_name, is_owner from users where household_id = $1 and is_owner order by created_at limit 1',
      [household.id]
    );
    const user = owner.rows[0];
    req.ctx = {
      householdId: household.id,
      householdName: household.name,
      timeZone: household.time_zone,
      nudgeDays: household.nudge_days,
      user: { id: user?.id ?? null, displayName: user?.display_name ?? '', isOwner: Boolean(user?.is_owner) },
    };
    next();
  };
}
