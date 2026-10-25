// TEMPORARY until sign-in (Task 9): there is one household, so use it.
export async function getCurrentContext(db) {
  const hh = await db.query('select id, name, time_zone, nudge_days from households order by created_at limit 1');
  const household = hh.rows[0];
  if (!household) return null;
  const owner = await db.query(
    'select id, display_name, is_owner from users where household_id = $1 and is_owner order by created_at limit 1',
    [household.id]
  );
  const user = owner.rows[0];
  return {
    householdId: household.id,
    householdName: household.name,
    timeZone: household.time_zone,
    nudgeDays: household.nudge_days,
    user: { id: user?.id ?? null, displayName: user?.display_name ?? '', isOwner: Boolean(user?.is_owner) },
  };
}
