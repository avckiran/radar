import { withTransaction } from './db.js';
import { isValidYmd, todayInZone } from './dates.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ACTIONS = ['done', 'snooze', 'waiting', 'reopen'];

export function isUuid(value) {
  return typeof value === 'string' && UUID.test(value);
}

const CLEARED = { snoozed_until: null, waiting_on: null, follow_up_date: null, waiting_since: null };

function moved() {
  return new HttpError(409, 'That item has already changed. The list has been refreshed.');
}

export function planTransition(action, item, body, { now, timeZone }) {
  const today = todayInZone(now, timeZone);
  const input = body && typeof body === 'object' ? body : {};
  const from = item.state;

  if (action === 'done') {
    if (item.kind !== 'action' || from === 'done') throw moved();
    return {
      patch: { ...CLEARED, state: 'done', completed_at: now },
      event: { type: 'completed', from, to: 'done', data: {} },
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
    if (waitingOn.length > 200) throw new HttpError(400, 'Keep “waiting on” under 200 characters.');
    const followUp = input.followUp ?? null;
    if (followUp !== null && !isValidYmd(followUp)) throw new HttpError(400, 'That follow-up date isn’t valid.');
    if (followUp !== null && followUp < today) throw new HttpError(400, 'Pick a follow-up date from today on.');
    return {
      patch: { ...CLEARED, state: 'waiting', waiting_on: waitingOn || null, follow_up_date: followUp, waiting_since: now },
      event: { type: 'state_change', from, to: 'waiting', data: { waitingOn: waitingOn || null, followUp } },
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
      `select id, kind, state, segment_id from items
        where id = $1 and household_id = $2 and deleted_at is null
        for update`,
      [itemId, householdId]
    );
    const item = found.rows[0];
    if (!item) throw new HttpError(404, 'Item not found.');

    const { patch, event } = planTransition(action, item, body, { now, timeZone });
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
      `insert into item_events (item_id, household_id, type, from_state, to_state, data, actor_id)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [itemId, householdId, event.type, event.from, event.to, JSON.stringify(event.data), actorId]
    );
    return { id: itemId, state: patch.state };
  });
}
