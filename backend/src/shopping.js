import { withTransaction } from './db.js';
import { HttpError, isUuid } from './errors.js';
import { todayInZone } from './dates.js';

// Shopping lists: one list per store or purpose. Everything is scoped to the household taken from the sign-in.
// A list archives itself when it has at least one item and every item is checked. It can also be archived by hand.
// Nothing is removed for good: deleting a list or an item only sets deleted_at.
export const LIMITS = { title: 80, note: 500, item: 200, items: 300 };

const NOT_FOUND = 'That shopping list wasn’t found. It may have been deleted.';
const ITEM_NOT_FOUND = 'That item wasn’t found. It may have been deleted.';
const ARCHIVED = 'This list is archived. Make a new list from it to keep shopping.';

function oneLine(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

export function cleanTitle(raw) {
  const title = oneLine(raw);
  if (!title) throw new HttpError(400, 'Give the list a title, like the store’s name.');
  if (title.length > LIMITS.title) throw new HttpError(400, `The title is too long (${LIMITS.title} characters at most).`);
  return title;
}

export function cleanNote(raw) {
  const note = typeof raw === 'string' ? raw.trim() : '';
  if (note.length > LIMITS.note) throw new HttpError(400, `The note is too long (${LIMITS.note} characters at most).`);
  return note || null;
}

export function cleanItemText(raw) {
  const text = oneLine(raw);
  if (!text) throw new HttpError(400, 'Write the item first.');
  if (text.length > LIMITS.item) throw new HttpError(400, `That item is too long (${LIMITS.item} characters at most).`);
  return text;
}

function cleanItems(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new HttpError(400, 'That request couldn’t be read.');
  if (raw.length > LIMITS.items) throw new HttpError(400, `A list can hold ${LIMITS.items} items at most.`);
  return raw.map(cleanItemText);
}

function requireListId(id) {
  if (!isUuid(id)) throw new HttpError(404, NOT_FOUND);
}

function shapeList(row, timeZone) {
  return {
    id: row.id,
    title: row.title,
    note: row.note,
    createdOn: todayInZone(row.created_at, timeZone),
    createdBy: row.created_by ?? null,
    archived: Boolean(row.archived_at),
    archivedOn: row.archived_at ? todayInZone(row.archived_at, timeZone) : null,
    total: row.total,
    checked: row.checked,
  };
}

const SUMMARY_SQL = `
  select l.id, l.title, l.note, l.created_at, l.archived_at, cu.display_name as created_by,
         count(i.id)::int as total, count(i.checked_at)::int as checked
    from shopping_lists l
    left join users cu on cu.id = l.created_by
    left join shopping_items i on i.list_id = l.id and i.deleted_at is null
   where l.household_id = $1 and l.deleted_at is null`;
const SUMMARY_GROUP = ` group by l.id, cu.display_name`;

// All lists, open ones newest first, then archived ones with the most recently archived first
export async function listShopping(db, ctx) {
  const res = await db.query(`${SUMMARY_SQL}${SUMMARY_GROUP} order by l.created_at desc, l.id`, [ctx.householdId]);
  const lists = res.rows.map((r) => shapeList(r, ctx.timeZone));
  return {
    open: lists.filter((l) => !l.archived),
    archived: lists.filter((l) => l.archived).sort((a, b) => b.archivedOn.localeCompare(a.archivedOn)),
  };
}

// One list with its items: open items first in the order they were added, checked items below
export async function loadList(db, ctx, id) {
  requireListId(id);
  const head = await db.query(`${SUMMARY_SQL} and l.id = $2${SUMMARY_GROUP}`, [ctx.householdId, id]);
  if (!head.rows[0]) throw new HttpError(404, NOT_FOUND);
  const items = await db.query(
    `select i.id, i.text, i.checked_at, i.seq::float8 as pos, ab.display_name as added_by, cb.display_name as checked_by
       from shopping_items i
       left join users ab on ab.id = i.created_by
       left join users cb on cb.id = i.checked_by
      where i.list_id = $1 and i.household_id = $2 and i.deleted_at is null
      order by (i.checked_at is not null), i.seq`,
    [id, ctx.householdId]
  );
  return {
    ...shapeList(head.rows[0], ctx.timeZone),
    items: items.rows.map((r) => ({ id: r.id, text: r.text, checked: Boolean(r.checked_at), pos: r.pos, addedBy: r.added_by ?? null, checkedBy: r.checked_by ?? null })),
  };
}

// Locks the list row so two people checking the last items at the same moment cannot archive it twice
async function lockList(tx, ctx, id) {
  requireListId(id);
  const res = await tx.query(
    `select id, title, note, archived_at from shopping_lists where id = $1 and household_id = $2 and deleted_at is null for update`,
    [id, ctx.householdId]
  );
  if (!res.rows[0]) throw new HttpError(404, NOT_FOUND);
  return res.rows[0];
}

async function insertItems(tx, ctx, listId, texts) {
  for (const text of texts) {
    await tx.query(`insert into shopping_items (list_id, household_id, text, created_by) values ($1, $2, $3, $4)`, [listId, ctx.householdId, text, ctx.user.id]);
  }
}

// Archive the list if it has items and all of them are checked. Returns true when it just got archived.
async function archiveIfComplete(tx, ctx, listId) {
  const res = await tx.query(
    `update shopping_lists
        set archived_at = now(), archived_by = $3, updated_at = now()
      where id = $1 and household_id = $2 and archived_at is null
        and exists (select 1 from shopping_items where list_id = $1 and deleted_at is null)
        and not exists (select 1 from shopping_items where list_id = $1 and deleted_at is null and checked_at is null)
      returning id`,
    [listId, ctx.householdId, ctx.user.id]
  );
  return res.rows.length > 0;
}

// The browser makes the list ID, so sending the same request twice never makes two lists
async function insertList(tx, ctx, { id, title, note, items }) {
  const inserted = await tx.query(
    `insert into shopping_lists (id, household_id, title, note, created_by) values ($1, $2, $3, $4, $5) on conflict (id) do nothing returning id`,
    [id, ctx.householdId, title, note, ctx.user.id]
  );
  if (inserted.rows[0]) {
    await insertItems(tx, ctx, id, items);
    return true;
  }
  const existing = await tx.query(`select id from shopping_lists where id = $1 and household_id = $2`, [id, ctx.householdId]);
  if (!existing.rows[0]) throw new HttpError(409, 'That list ID is already in use.');
  return false;
}

export async function createList(db, ctx, input) {
  const raw = input && typeof input === 'object' ? input : {};
  if (!isUuid(raw.id)) throw new HttpError(400, 'That request is missing a list ID.');
  const list = { id: raw.id, title: cleanTitle(raw.title), note: cleanNote(raw.note), items: cleanItems(raw.items) };
  return withTransaction(db, async (tx) => {
    const created = await insertList(tx, ctx, list);
    return { created, list: await loadList(tx, ctx, list.id) };
  });
}

export async function updateList(db, ctx, id, input) {
  const raw = input && typeof input === 'object' ? input : {};
  const hasTitle = raw.title !== undefined;
  const hasNote = raw.note !== undefined;
  if (!hasTitle && !hasNote) throw new HttpError(400, 'Nothing to change.');
  const title = hasTitle ? cleanTitle(raw.title) : null;
  const note = hasNote ? cleanNote(raw.note) : null;
  return withTransaction(db, async (tx) => {
    const current = await lockList(tx, ctx, id);
    if (current.archived_at) throw new HttpError(409, ARCHIVED);
    await tx.query(`update shopping_lists set title = $3, note = $4, updated_at = now() where id = $1 and household_id = $2`, [
      id,
      ctx.householdId,
      hasTitle ? title : current.title,
      hasNote ? note : current.note,
    ]);
    return { list: await loadList(tx, ctx, id) };
  });
}

export async function deleteList(db, ctx, id) {
  return withTransaction(db, async (tx) => {
    await lockList(tx, ctx, id);
    await tx.query(`update shopping_lists set deleted_at = now(), updated_at = now() where id = $1 and household_id = $2`, [id, ctx.householdId]);
    return { ok: true };
  });
}

export async function addItem(db, ctx, listId, input) {
  const raw = input && typeof input === 'object' ? input : {};
  if (!isUuid(raw.id)) throw new HttpError(400, 'That request is missing an item ID.');
  const text = cleanItemText(raw.text);
  return withTransaction(db, async (tx) => {
    const current = await lockList(tx, ctx, listId);
    if (current.archived_at) throw new HttpError(409, ARCHIVED);
    const count = await tx.query(`select count(*)::int as n from shopping_items where list_id = $1 and deleted_at is null`, [listId]);
    if (count.rows[0].n >= LIMITS.items) throw new HttpError(400, `A list can hold ${LIMITS.items} items at most.`);
    const inserted = await tx.query(
      `insert into shopping_items (id, list_id, household_id, text, created_by) values ($1, $2, $3, $4, $5) on conflict (id) do nothing returning id`,
      [raw.id, listId, ctx.householdId, text, ctx.user.id]
    );
    if (!inserted.rows[0]) {
      const same = await tx.query(`select id from shopping_items where id = $1 and list_id = $2 and household_id = $3`, [raw.id, listId, ctx.householdId]);
      if (!same.rows[0]) throw new HttpError(409, 'That item ID is already in use.');
    }
    return { list: await loadList(tx, ctx, listId), archived: false };
  });
}

// Edit the text and/or tick or untick an item. Ticking the last open item archives the list.
export async function updateItem(db, ctx, listId, itemId, input) {
  const raw = input && typeof input === 'object' ? input : {};
  const hasText = raw.text !== undefined;
  const hasChecked = raw.checked !== undefined;
  if (!hasText && !hasChecked) throw new HttpError(400, 'Nothing to change.');
  if (hasChecked && typeof raw.checked !== 'boolean') throw new HttpError(400, 'That request couldn’t be read.');
  const text = hasText ? cleanItemText(raw.text) : null;
  if (!isUuid(itemId)) throw new HttpError(404, ITEM_NOT_FOUND);
  return withTransaction(db, async (tx) => {
    const current = await lockList(tx, ctx, listId);
    if (current.archived_at) throw new HttpError(409, ARCHIVED);
    const updated = await tx.query(
      `update shopping_items
          set text = coalesce($4, text),
              checked_at = case when $5::boolean is null then checked_at when $5 then coalesce(checked_at, now()) else null end,
              checked_by = case when $5::boolean is null then checked_by when $5 then coalesce(checked_by, $6::uuid) else null end,
              updated_at = now()
        where id = $1 and list_id = $2 and household_id = $3 and deleted_at is null
        returning id`,
      [itemId, listId, ctx.householdId, text, hasChecked ? raw.checked : null, ctx.user.id]
    );
    if (!updated.rows[0]) throw new HttpError(404, ITEM_NOT_FOUND);
    const archived = hasChecked && raw.checked ? await archiveIfComplete(tx, ctx, listId) : false;
    return { list: await loadList(tx, ctx, listId), archived };
  });
}

export async function deleteItem(db, ctx, listId, itemId) {
  if (!isUuid(itemId)) throw new HttpError(404, ITEM_NOT_FOUND);
  return withTransaction(db, async (tx) => {
    const current = await lockList(tx, ctx, listId);
    if (current.archived_at) throw new HttpError(409, ARCHIVED);
    const removed = await tx.query(
      `update shopping_items set deleted_at = now(), updated_at = now() where id = $1 and list_id = $2 and household_id = $3 and deleted_at is null returning id`,
      [itemId, listId, ctx.householdId]
    );
    if (!removed.rows[0]) throw new HttpError(404, ITEM_NOT_FOUND);
    // Removing the only unchecked item can finish the list
    const archived = await archiveIfComplete(tx, ctx, listId);
    return { list: await loadList(tx, ctx, listId), archived };
  });
}

async function itemTexts(tx, ctx, listId, { onlyOpen }) {
  const res = await tx.query(
    `select text from shopping_items
      where list_id = $1 and household_id = $2 and deleted_at is null ${onlyOpen ? 'and checked_at is null' : ''}
      order by seq`,
    [listId, ctx.householdId]
  );
  return res.rows.map((r) => r.text);
}

function newListFields(raw, fallback) {
  if (!raw || typeof raw !== 'object' || !isUuid(raw.id)) throw new HttpError(400, 'That request is missing a list ID.');
  return {
    id: raw.id,
    title: raw.title === undefined ? fallback.title : cleanTitle(raw.title),
    note: raw.note === undefined ? fallback.note : cleanNote(raw.note),
  };
}

// Archive by hand. With copyOpen, the items that are still unchecked are copied into a new list first;
// the archived list keeps all of its items as a record.
export async function archiveList(db, ctx, id, input) {
  const raw = input && typeof input === 'object' ? input : {};
  const copyOpen = raw.copyOpen === true;
  return withTransaction(db, async (tx) => {
    const current = await lockList(tx, ctx, id);
    let newListId = null;
    if (copyOpen) {
      const fields = newListFields(raw.newList, current);
      const texts = await itemTexts(tx, ctx, id, { onlyOpen: true });
      if (texts.length) {
        await insertList(tx, ctx, { ...fields, items: texts });
        newListId = fields.id;
      }
    }
    if (!current.archived_at) {
      await tx.query(`update shopping_lists set archived_at = now(), archived_by = $3, updated_at = now() where id = $1 and household_id = $2`, [id, ctx.householdId, ctx.user.id]);
    }
    return {
      list: await loadList(tx, ctx, id),
      newList: newListId ? await loadList(tx, ctx, newListId) : null,
    };
  });
}

// Used by Undo after a list archived itself: opens it again and, if asked, unticks the item that was just ticked
export async function reopenList(db, ctx, id, input) {
  const raw = input && typeof input === 'object' ? input : {};
  return withTransaction(db, async (tx) => {
    const current = await lockList(tx, ctx, id);
    if (current.archived_at) {
      await tx.query(`update shopping_lists set archived_at = null, archived_by = null, updated_at = now() where id = $1 and household_id = $2`, [id, ctx.householdId]);
    }
    if (raw.uncheckItemId != null) {
      if (!isUuid(raw.uncheckItemId)) throw new HttpError(404, ITEM_NOT_FOUND);
      await tx.query(
        `update shopping_items set checked_at = null, checked_by = null, updated_at = now() where id = $1 and list_id = $2 and household_id = $3 and deleted_at is null`,
        [raw.uncheckItemId, id, ctx.householdId]
      );
    }
    return { list: await loadList(tx, ctx, id) };
  });
}

// "New list from this one": every item is copied, unchecked, into a new list
export async function copyList(db, ctx, id, input) {
  const raw = input && typeof input === 'object' ? input : {};
  return withTransaction(db, async (tx) => {
    const current = await lockList(tx, ctx, id);
    const fields = newListFields(raw, current);
    const texts = await itemTexts(tx, ctx, id, { onlyOpen: false });
    const created = await insertList(tx, ctx, { ...fields, items: texts });
    return { created, list: await loadList(tx, ctx, fields.id) };
  });
}

// Titles of the lists that are not archived, oldest first (the email mentions them)
export async function activeListTitles(db, householdId) {
  const res = await db.query(
    `select title from shopping_lists where household_id = $1 and deleted_at is null and archived_at is null order by created_at, id`,
    [householdId]
  );
  return res.rows.map((r) => r.title);
}
