import { withTransaction } from './db.js';
import { isValidYmd, todayInZone } from './dates.js';
import { HttpError, isUuid } from './errors.js';

export { HttpError, isUuid };

export const ACTIONS = ['done', 'snooze', 'waiting', 'reopen'];

const CLEARED = { snoozed_until: null, waiting_on: null, follow_up_date: null, waiting_since: null };

function moved() {
  return new HttpError(409, 'That item has already changed. The list has been refreshed.');
}

// "Done, and keep following up": the optional extra that creates a new follow-up item (see applyTransition)
function planFollowUp(raw, today) {
  if (raw === undefined || raw === null || raw === false) return null;
  const input = raw && typeof raw === 'object' ? raw : {};
  const waitingOn = typeof input.waitingOn === 'string' ? input.waitingOn.trim() : '';
  if (waitingOn.length > 200) throw new HttpError(400, 'Keep “following up with” under 200 characters.');
  const checkBack = input.checkBack ?? null;
  if (checkBack !== null && !isValidYmd(checkBack)) throw new HttpError(400, 'That check-back date isn’t valid.');
  if (checkBack !== null && checkBack < today) throw new HttpError(400, 'Pick a check-back date from today on.');
  return { waitingOn: waitingOn || null, checkBack };
}

export function planTransition(action, item, body, { now, timeZone }) {
  const today = todayInZone(now, timeZone);
  const input = body && typeof body === 'object' ? body : {};
  const from = item.state;

  if (action === 'done') {
    if (item.kind !== 'action' || from === 'done') throw moved();
    const note = typeof input.note === 'string' ? input.note.trim() : '';
    if (note.length > 1000) throw new HttpError(400, 'Keep the note under 1000 characters.');
    const followUp = planFollowUp(input.followUp, today);
    return {
      patch: { ...CLEARED, state: 'done', completed_at: now },
      event: { type: 'completed', from, to: 'done', note: note || null, data: {} },
      followUp,
    };
  }

  if (action === 'snooze') {
    if (item.kind !== 'action' || !['active', 'waiting', 'snoozed'].includes(from)) throw moved();
    if (!isValidYmd(input.until)) throw new HttpError(400, 'Pick a date to snooze until.');
    if (input.until <= today) throw new HttpError(400, 'Pick a date after today.');
    return {
      patch: { ...CLEARED, state: 'snoozed', snoozed_until: input.until },
      event: { type: 'state_change', from, to: 'snoozed', data: { until: input.until } },
    };
  }

  if (action === 'waiting') {
    if (item.kind !== 'action' || !['active', 'snoozed'].includes(from)) throw moved();
    const waitingOn = typeof input.waitingOn === 'string' ? input.waitingOn.trim() : '';
    if (waitingOn.length > 200) throw new HttpError(400, 'Keep “following up with” under 200 characters.');
    const followUp = input.followUp ?? null;
    if (followUp !== null && !isValidYmd(followUp)) throw new HttpError(400, 'That follow-up date isn’t valid.');
    if (followUp !== null && followUp < today) throw new HttpError(400, 'Pick a follow-up date from today on.');
    return {
      patch: { ...CLEARED, state: 'waiting', waiting_on: waitingOn || null, follow_up_date: followUp, waiting_since: now },
      event: {
        type: 'state_change',
        from,
        to: 'waiting',
        note: waitingOn ? `Marked Follow-up with ${waitingOn}` : 'Marked Follow-up',
        data: { waitingOn: waitingOn || null, followUp },
      },
    };
  }

  if (action === 'reopen') {
    if (item.kind !== 'action' || !['waiting', 'snoozed', 'done'].includes(from)) throw moved();
    const to = item.segment_id ? 'active' : 'inbox';
    return {
      patch: { ...CLEARED, state: to, completed_at: null },
      event: { type: 'state_change', from, to, data: {} },
    };
  }

  throw new HttpError(404, 'Not found');
}

export async function applyTransition(db, { householdId, actorId, itemId, action, body, timeZone, now = new Date() }) {
  if (!isUuid(itemId)) throw new HttpError(404, 'Item not found.');
  return withTransaction(db, async (tx) => {
    const found = await tx.query(
      `select id, kind, state, segment_id, title from items
        where id = $1 and household_id = $2 and deleted_at is null
        for update`,
      [itemId, householdId]
    );
    const item = found.rows[0];
    if (!item) throw new HttpError(404, 'Item not found.');

    const { patch, event, followUp } = planTransition(action, item, body, { now, timeZone });
    const followUpId = followUp ? await createFollowUp(tx, { householdId, actorId, item, followUp, now }) : null;
    if (followUpId) event.data = { ...event.data, followUpId };
    await tx.query(
      `update items
          set state = $2, snoozed_until = $3, waiting_on = $4, follow_up_date = $5,
              waiting_since = $6, completed_at = $7, updated_at = now()
        where id = $1`,
      [
        itemId,
        patch.state,
        patch.snoozed_until,
        patch.waiting_on,
        patch.follow_up_date,
        patch.waiting_since,
        patch.completed_at === undefined ? null : patch.completed_at,
      ]
    );
    await tx.query(
      `insert into item_events (item_id, household_id, type, from_state, to_state, note, data, actor_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [itemId, householdId, event.type, event.from, event.to, event.note ?? null, JSON.stringify(event.data), actorId]
    );
    if (action === 'reopen') await undoFollowUp(tx, { householdId, actorId, itemId, followUpId: body?.undoFollowUpId });
    return followUpId ? { id: itemId, state: patch.state, followUpId } : { id: itemId, state: patch.state };
  });
}

// The new item for "Done, and follow up". It lives in the same segment, with no due date. An item that has no
// segment (not sorted yet) gets a follow-up in the Inbox instead, because a follow-up needs a segment.
async function createFollowUp(tx, { householdId, actorId, item, followUp, now }) {
  const title = `Follow up: ${item.title}`.slice(0, 300);
  const state = item.segment_id ? 'waiting' : 'inbox';
  const inserted = await tx.query(
    `insert into items (household_id, segment_id, kind, state, title, waiting_on, follow_up_date, waiting_since, created_by)
     values ($1, $2, 'action', $3, $4, $5, $6, $7, $8) returning id`,
    [householdId, item.segment_id, state, title, state === 'waiting' ? followUp.waitingOn : null, state === 'waiting' ? followUp.checkBack : null, state === 'waiting' ? now : null, actorId]
  );
  const id = inserted.rows[0].id;
  const segment = item.segment_id ? await tx.query('select name from segments where id = $1', [item.segment_id]) : null;
  await tx.query(
    `insert into item_events (item_id, household_id, type, to_state, actor_id, data) values ($1, $2, 'created', $3, $4, $5)`,
    [id, householdId, state, actorId, JSON.stringify({ segmentName: segment?.rows[0]?.name ?? null, followUpOf: item.id, followUpOfTitle: item.title, waitingOn: followUp.waitingOn, checkBack: followUp.checkBack })]
  );
  return id;
}

// Undo of a "Done, and follow up": the follow-up that was created goes away again (it is only hidden, like any delete).
async function undoFollowUp(tx, { householdId, actorId, itemId, followUpId }) {
  if (!isUuid(followUpId)) return;
  const made = await tx.query(
    `select i.id from items i
       join item_events e on e.item_id = i.id and e.type = 'created' and e.data->>'followUpOf' = $3
      where i.id = $1 and i.household_id = $2 and i.deleted_at is null`,
    [followUpId, householdId, itemId]
  );
  if (!made.rows[0]) return;
  await tx.query('update items set deleted_at = now(), updated_at = now() where id = $1', [followUpId]);
  await tx.query(
    `insert into item_events (item_id, household_id, type, actor_id, data) values ($1, $2, 'deleted', $3, '{}')`,
    [followUpId, householdId, actorId]
  );
}
