// TEMPORARY until sign-in (Task 9): there is one household, so use it.
export async function getCurrentContext(db) {
  const hh = await db.query('select id, name from households order by created_at limit 1');
  if (!hh.rows[0]) return null;
  const owner = await db.query(
    'select display_name from users where household_id = $1 and is_owner order by created_at limit 1',
    [hh.rows[0].id]
  );
  return {
    householdId: hh.rows[0].id,
    householdName: hh.rows[0].name,
    user: { displayName: owner.rows[0]?.display_name ?? '' },
  };
}
