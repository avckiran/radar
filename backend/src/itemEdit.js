import { withTransaction } from './db.js';
import { isValidYmd, todayInZone } from './dates.js';
import { HttpError, isUuid } from './errors.js';
import { dayWithDate } from './history.js';
import { LIMITS, domainOf, normalizeUrl } from './capture.js';
import { findSegmentFor } from './segmentRules.js';

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function limit(label, value, max) {
  if (value.length > max) throw new HttpError(400, `${label} is too long (${max} characters at most).`);
}

async function lockItem(tx, householdId, itemId) {
  if (!isUuid(itemId)) throw new HttpError(404, 'Item not found.');
  const found = await tx.query(
    `select id, kind, state, segment_id, title, body, url, description, due_date, follow_up_date, waiting_since
       from items where id = $1 and household_id = $2 and deleted_at is null for update`,
    [itemId, householdId]
  );
  if (!found.rows[0]) throw new HttpError(404, 'Item not found.');
  return found.rows[0];
}

function addEvent(tx, { householdId, actorId, itemId, type, from = null, to = null, note = null, data = {} }) {
  return tx.query(
    `insert into item_events (item_id, household_id, type, from_state, to_state, note, data, actor_id, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, clock_timestamp())`,
    [itemId, householdId, type, from, to, note, JSON.stringify(data), actorId]
  );
}

export function planEdit(item, input) {
  const fields = input && typeof input === 'object' ? input : {};
  const changes = {};
  const notes = [];
  const has = (key) => Object.prototype.hasOwnProperty.call(fields, key);
  const reject = (what) => {
    throw new HttpError(400, `${what} can’t be changed on ${item.kind === 'action' ? 'an action' : `a ${item.kind}`}.`);
  };

  if (has('dueDate') && item.kind !== 'action') reject('A due date');
  if (has('description') && item.kind !== 'link') reject('A description');
  if (has('url') && item.kind === 'note') reject('A link');
  if (has('body') && item.kind === 'link') reject('Notes');

  if (has('title')) {
    const title = clean(fields.title);
    limit('The title', title, LIMITS.title);
    if (!title && item.kind === 'action') throw new HttpError(400, 'Add a title so you can find this later.');
    if (title !== item.title && title) {
      changes.title = title;
      notes.push({ field: 'title', text: `Changed title to “${title}”`, from: item.title, to: title });
    } else if (!title && item.kind !== 'action') {
      const fallback = item.kind === 'link' ? domainOf(item.url) : item.title;
      if (fallback !== item.title) {
        changes.title = fallback;
        notes.push({ field: 'title', text: `Changed title to “${fallback}”`, from: item.title, to: fallback });
      }
    }
  }

  if (has('body')) {
    const body = clean(fields.body);
    limit('The note', body, LIMITS.body);
    if (body !== (item.body ?? '')) {
      changes.body = body || null;
      notes.push({ field: 'body', text: item.kind === 'note' ? 'Edited the note' : 'Edited notes' });
    }
  }

  if (has('description')) {
    const description = clean(fields.description);
    limit('The description', description, LIMITS.description);
    if (description !== (item.description ?? '')) {
      changes.description = description || null;
      notes.push({ field: 'description', text: 'Edited the description' });
    }
  }

  if (has('url')) {
    const raw = clean(fields.url);
    let url = null;
    if (raw) {
      url = normalizeUrl(raw);
      if (!url) throw new HttpError(400, 'That doesn’t look like a web address. Try something like example.com.');
    } else if (item.kind === 'link') {
      throw new HttpError(400, 'A link needs a web address.');
    }
    if (url !== (item.url ?? null)) {
      changes.url = url;
      notes.push({ field: 'url', text: url ? `Changed link to ${domainOf(url)}` : 'Removed the link', from: item.url, to: url });
    }
  }

  if (has('dueDate')) {
    const due = fields.dueDate === '' ? null : (fields.dueDate ?? null);
    if (due !== null && (!isValidYmd(due) || due < '2000-01-01' || due > '2100-12-31')) {
      throw new HttpError(400, 'That due date isn’t valid.');
    }
    if (due !== (item.due_date ?? null)) {
      changes.due_date = due;
      notes.push({ field: 'dueDate', text: due ? `Changed due date to ${dayWithDate(due)}` : 'Removed the due date', from: item.due_date, to: due });
    }
  }

  return { changes, notes, segmentId: has('segmentId') ? fields.segmentId : undefined };
}

export async function updateItem(db, { householdId, actorId }, itemId, input) {
  await withTransaction(db, async (tx) => {
    const item = await lockItem(tx, householdId, itemId);
    const plan = planEdit(item, input);
    const events = [...plan.notes.map((n) => ({ type: 'edited', note: n.text, data: { field: n.field, from: n.from ?? null, to: n.to ?? null } }))];
    const sets = { ...plan.changes };

    if (plan.segmentId !== undefined && plan.segmentId !== item.segment_id) {
      if (plan.segmentId === null || plan.segmentId === '') {
        if (item.state !== 'inbox') throw new HttpError(400, 'Pick a segment. Active items need one.');
      } else {
        const segment = await findSegmentFor(tx, householdId, plan.segmentId, item.kind);
        sets.segment_id = segment.id;
        if (item.state === 'inbox') {
          sets.state = 'active';
          events.push({
            type: 'state_change',
            from: 'inbox',
            to: 'active',
            data: { segmentId: segment.id, segmentName: segment.name },
          });
        } else {
          events.push({ type: 'edited', note: `Moved to ${segment.name}`, data: { field: 'segment', from: item.segment_id, to: segment.id } });
        }
      }
    }

    const columns = Object.keys(sets);
    if (columns.length === 0) return;
    const assignments = columns.map((c, i) => `${c} = $${i + 2}`).join(', ');
    await tx.query(`update items set ${assignments}, updated_at = now() where id = $1`, [itemId, ...columns.map((c) => sets[c])]);
    for (const e of events) await addEvent(tx, { householdId, actorId, itemId, ...e });
  });
}

export async function logFollowUp(db, { householdId, actorId }, itemId, input) {
  const note = clean(input?.note);
  if (!note) throw new HttpError(400, 'Write what happened first.');
  limit('The note', note, 1000);
  await withTransaction(db, async (tx) => {
    const item = await lockItem(tx, householdId, itemId);
    if (item.state !== 'waiting') throw new HttpError(409, 'This item isn’t waiting anymore.');
    await addEvent(tx, { householdId, actorId, itemId, type: 'follow_up', note, data: { kind: 'log' } });
    await tx.query('update items set updated_at = now() where id = $1', [itemId]);
  });
}

export async function resetFollowUp(db, { householdId, actorId, timeZone }, itemId, input, now = new Date()) {
  const date = input?.followUp ?? null;
  const today = todayInZone(now, timeZone);
  if (date !== null && !isValidYmd(date)) throw new HttpError(400, 'That follow-up date isn’t valid.');
  if (date !== null && date < today) throw new HttpError(400, 'Pick a follow-up date from today on.');
  await withTransaction(db, async (tx) => {
    const item = await lockItem(tx, householdId, itemId);
    if (item.state !== 'waiting') throw new HttpError(409, 'This item isn’t waiting anymore.');
    await tx.query('update items set follow_up_date = $2, updated_at = now() where id = $1', [itemId, date]);
    await addEvent(tx, {
      householdId,
      actorId,
      itemId,
      type: 'follow_up',
      note: date ? `Follow-up date set to ${dayWithDate(date)}` : 'Follow-up date cleared',
      data: { kind: 'reset', date },
    });
  });
}

export async function deleteItem(db, { householdId, actorId }, itemId) {
  await withTransaction(db, async (tx) => {
    const item = await lockItem(tx, householdId, itemId);
    await tx.query('update items set deleted_at = now(), updated_at = now() where id = $1', [itemId]);
    await addEvent(tx, { householdId, actorId, itemId, type: 'deleted', from: item.state });
  });
  return { id: itemId };
}
