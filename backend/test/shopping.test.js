import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../src/app.js';
import { openContext } from './helpers.js';
import { HttpError } from '../src/errors.js';
import { buildSeed } from '../src/seedData.js';
import { loadExport } from '../src/exporter.js';
import { loadDigestData } from '../src/digest/data.js';
import { activeListTitles, addItem, archiveList, copyList, createList, deleteItem, deleteList, listShopping, loadList, reopenList, updateItem, updateList } from '../src/shopping.js';

// Shopping lists against a real Postgres engine (PGlite) with the real migrations
const NOW = new Date('2026-10-26T15:00:00Z');
const OTHER_HH = '99999999-9999-4999-8999-999999999999';
const OTHER_USER = '88888888-8888-4888-8888-888888888888';
let pg, db, seed, ctx, other, server, base, counter = 0;

async function insert(table, row) {
  const cols = Object.keys(row);
  const vals = cols.map((c) => (row[c] !== null && typeof row[c] === 'object' && !(row[c] instanceof Date) ? JSON.stringify(row[c]) : row[c]));
  await pg.query(`insert into ${table} (${cols.join(', ')}) values (${cols.map((_, i) => '$' + (i + 1)).join(', ')})`, vals);
}

// Made-up but valid ids, one per call
function id() {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
}

async function newList(title = 'Whole Foods', texts = [], c = ctx, note) {
  const made = await createList(db, c, { id: id(), title, note, items: texts });
  return made.list;
}

const open = (list) => list.items.filter((i) => !i.checked).map((i) => i.text);
const fails = (promise, status, pattern) =>
  assert.rejects(promise, (e) => e instanceof HttpError && e.status === status && (!pattern || pattern.test(e.message)));

before(async () => {
  pg = new PGlite({ parsers: { 1082: (v) => v } });
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
  for (const f of fs.readdirSync(dir).sort()) await pg.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  seed = buildSeed({ now: NOW });
  await insert('households', seed.household);
  for (const u of seed.users) {
    const { key, ...row } = u;
    await insert('users', { ...row, password_hash: 'x' });
  }
  await insert('households', { id: OTHER_HH, name: 'Somebody else', time_zone: 'America/Chicago', nudge_days: 5 });
  await insert('users', { id: OTHER_USER, household_id: OTHER_HH, username: 'outsider', display_name: 'Outsider', is_owner: true, password_hash: 'x' });
  db = { query: (s, p) => pg.query(s, p), connect: async () => ({ query: (s, p) => pg.query(s, p), release() {} }) };
  ctx = { householdId: seed.household.id, timeZone: 'America/New_York', user: { id: seed.users[0].id, displayName: seed.users[0].display_name } };
  other = { householdId: OTHER_HH, timeZone: 'America/Chicago', user: { id: OTHER_USER, displayName: 'Outsider' } };

  const app = createApp({ authenticate: openContext(db), db, corsOrigins: ['http://localhost:5173'], now: () => NOW });
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  base = `http://localhost:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
});

test('a list has a title, an optional note and a created date; the same request twice makes one list', async () => {
  const listId = id();
  const first = await createList(db, ctx, { id: listId, title: '  Whole   Foods ', note: '  Guests visit  ' });
  assert.equal(first.created, true);
  assert.equal(first.list.title, 'Whole Foods');
  assert.equal(first.list.note, 'Guests visit');
  assert.match(first.list.createdOn, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(first.list.archived, false);
  assert.deepEqual([first.list.total, first.list.checked, first.list.items.length], [0, 0, 0]);
  assert.equal(first.list.createdBy, seed.users[0].display_name);
  const again = await createList(db, ctx, { id: listId, title: 'Whole Foods' });
  assert.equal(again.created, false);
  assert.equal((await pg.query('select count(*)::int n from shopping_lists where id = $1', [listId])).rows[0].n, 1);
  const noNote = await newList('Amazon');
  assert.equal(noNote.note, null);
});

test('titles, notes and items are checked', async () => {
  await fails(createList(db, ctx, { id: id(), title: '   ' }), 400, /title/);
  await fails(createList(db, ctx, { id: id(), title: 'x'.repeat(81) }), 400, /too long/);
  await fails(createList(db, ctx, { id: id(), title: 'ok', note: 'x'.repeat(501) }), 400, /too long/);
  await fails(createList(db, ctx, { title: 'No id' }), 400, /ID/);
  await fails(createList(db, ctx, { id: id(), title: 'ok', items: ['fine', '  '] }), 400, /item/);
  await fails(createList(db, ctx, { id: id(), title: 'ok', items: 'milk' }), 400);
  const list = await newList('Checks');
  await fails(addItem(db, ctx, list.id, { id: id(), text: 'x'.repeat(201) }), 400, /too long/);
  await fails(addItem(db, ctx, list.id, { text: 'no id' }), 400, /ID/);
  await fails(addItem(db, ctx, list.id, { id: id(), text: '' }), 400);
  await fails(addItem(db, ctx, 'not-a-uuid', { id: id(), text: 'milk' }), 404);
  await fails(addItem(db, ctx, id(), { id: id(), text: 'milk' }), 404);
});

test('items keep the order they were added in, and checked items drop to the bottom', async () => {
  const list = await newList('Order');
  const ids = {};
  for (const text of ['Milk', 'Eggs', 'Bread', 'Apples']) {
    ids[text] = id();
    await addItem(db, ctx, list.id, { id: ids[text], text });
  }
  let result = await updateItem(db, ctx, list.id, ids.Milk, { checked: true });
  assert.equal(result.archived, false);
  assert.deepEqual(result.list.items.map((i) => i.text), ['Eggs', 'Bread', 'Apples', 'Milk']);
  assert.equal(result.list.items[3].checked, true);
  assert.equal(result.list.items[3].checkedBy, seed.users[0].display_name);
  assert.deepEqual([result.list.total, result.list.checked], [4, 1]);
  result = await updateItem(db, ctx, list.id, ids.Milk, { checked: false });
  assert.deepEqual(result.list.items.map((i) => i.text), ['Milk', 'Eggs', 'Bread', 'Apples']);
  assert.equal(result.list.items[0].checkedBy, null);
  // adding the same item id again does not duplicate it
  await addItem(db, ctx, list.id, { id: ids.Eggs, text: 'Eggs' });
  assert.equal((await loadList(db, ctx, list.id)).items.length, 4);
  assert.equal((await loadList(db, ctx, list.id)).items[0].addedBy, seed.users[0].display_name);
});

test('an item can be renamed, and an edit does not tick or untick it', async () => {
  const list = await newList('Edit', ['Mik', 'Eggs']);
  const itemId = list.items[0].id;
  await updateItem(db, ctx, list.id, itemId, { checked: true });
  const renamed = await updateItem(db, ctx, list.id, itemId, { text: '  Milk  ' });
  assert.deepEqual(renamed.list.items.map((i) => [i.text, i.checked]), [['Eggs', false], ['Milk', true]]);
  await fails(updateItem(db, ctx, list.id, itemId, {}), 400, /Nothing/);
  await fails(updateItem(db, ctx, list.id, itemId, { checked: 'yes' }), 400);
  await fails(updateItem(db, ctx, list.id, itemId, { text: ' ' }), 400);
});

test('ticking the last open item archives the list with its date; an empty list never archives itself', async () => {
  const empty = await newList('Empty one');
  assert.equal((await listShopping(db, ctx)).open.some((l) => l.id === empty.id), true);

  const list = await newList('Walmart', ['Soap', 'Sponges']);
  const [a, b] = list.items;
  assert.equal((await updateItem(db, ctx, list.id, a.id, { checked: true })).archived, false);
  const done = await updateItem(db, ctx, list.id, b.id, { checked: true });
  assert.equal(done.archived, true);
  assert.equal(done.list.archived, true);
  assert.match(done.list.archivedOn, /^\d{4}-\d{2}-\d{2}$/);
  const all = await listShopping(db, ctx);
  assert.equal(all.open.some((l) => l.id === list.id), false);
  assert.equal(all.archived.some((l) => l.id === list.id), true);
  // ticking an already ticked item again does not archive anything new or change who ticked it
  assert.equal((await pg.query('select archived_by from shopping_lists where id = $1', [list.id])).rows[0].archived_by, seed.users[0].id);
});

test('deleting the only unchecked item finishes the list; deleting from a list with open items does not', async () => {
  const list = await newList('Delete', ['One', 'Two', 'Three']);
  const [one, two, three] = list.items;
  await updateItem(db, ctx, list.id, one.id, { checked: true });
  assert.equal((await deleteItem(db, ctx, list.id, two.id)).archived, false);
  const last = await deleteItem(db, ctx, list.id, three.id);
  assert.equal(last.archived, true);
  assert.deepEqual(last.list.items.map((i) => i.text), ['One']);
  // the removed items are only marked deleted
  assert.equal((await pg.query('select count(*)::int n from shopping_items where list_id = $1 and deleted_at is not null', [list.id])).rows[0].n, 2);
  // deleting the only item of a list leaves an empty list that stays open
  const solo = await newList('Solo', ['Only']);
  assert.equal((await deleteItem(db, ctx, solo.id, solo.items[0].id)).archived, false);
  await fails(deleteItem(db, ctx, solo.id, id()), 404, /item/);
  await fails(deleteItem(db, ctx, solo.id, 'nope'), 404);
});

test('an archived list is read only; Undo opens it again and unticks the item', async () => {
  const list = await newList('Archived rules', ['Soap']);
  const itemId = list.items[0].id;
  const done = await updateItem(db, ctx, list.id, itemId, { checked: true });
  assert.equal(done.archived, true);
  await fails(addItem(db, ctx, list.id, { id: id(), text: 'More' }), 409, /archived/);
  await fails(updateItem(db, ctx, list.id, itemId, { checked: false }), 409);
  await fails(deleteItem(db, ctx, list.id, itemId), 409);
  await fails(updateList(db, ctx, list.id, { title: 'New name' }), 409);
  const undone = await reopenList(db, ctx, list.id, { uncheckItemId: itemId });
  assert.equal(undone.list.archived, false);
  assert.equal(undone.list.archivedOn, null);
  assert.deepEqual([undone.list.total, undone.list.checked], [1, 0]);
  assert.equal((await pg.query('select archived_by from shopping_lists where id = $1', [list.id])).rows[0].archived_by, null);
  // reopening a list that is already open changes nothing
  assert.equal((await reopenList(db, ctx, list.id, {})).list.archived, false);
  await fails(reopenList(db, ctx, list.id, { uncheckItemId: 'nope' }), 404);
});

test('archive by hand, copying the unchecked items into a new list; the old list keeps everything', async () => {
  const list = await newList('Amazon', ['Batteries', 'Tape', 'Gift wrap'], ctx, 'Christmas');
  await updateItem(db, ctx, list.id, list.items[1].id, { checked: true });
  const newId = id();
  const result = await archiveList(db, ctx, list.id, { copyOpen: true, newList: { id: newId } });
  assert.equal(result.list.archived, true);
  assert.deepEqual(result.list.items.map((i) => i.text), ['Batteries', 'Gift wrap', 'Tape']);
  assert.deepEqual([result.list.total, result.list.checked], [3, 1]);
  assert.equal(result.newList.id, newId);
  assert.equal(result.newList.title, 'Amazon');
  assert.equal(result.newList.note, 'Christmas');
  assert.equal(result.newList.archived, false);
  assert.deepEqual(result.newList.items.map((i) => [i.text, i.checked]), [['Batteries', false], ['Gift wrap', false]]);
  // sending the same request again does not make a second list or duplicate items
  const again = await archiveList(db, ctx, list.id, { copyOpen: true, newList: { id: newId } });
  assert.deepEqual(again.newList.items.map((i) => i.text), ['Batteries', 'Gift wrap']);
  // a different title can be chosen
  const second = await newList('Costco', ['Paper towels']);
  const renamed = await archiveList(db, ctx, second.id, { copyOpen: true, newList: { id: id(), title: 'Costco, next trip', note: '' } });
  assert.equal(renamed.newList.title, 'Costco, next trip');
  assert.equal(renamed.newList.note, null);
});

test('archive by hand without copying, and with nothing left to copy', async () => {
  const list = await newList('Plain archive', ['A', 'B']);
  const plain = await archiveList(db, ctx, list.id, {});
  assert.equal(plain.list.archived, true);
  assert.equal(plain.newList, null);
  // archiving twice is harmless
  assert.equal((await archiveList(db, ctx, list.id, {})).list.archived, true);

  const nothing = await newList('Nothing to copy');
  const before = (await pg.query('select count(*)::int n from shopping_lists')).rows[0].n;
  const result = await archiveList(db, ctx, nothing.id, { copyOpen: true, newList: { id: id() } });
  assert.equal(result.newList, null);
  assert.equal((await pg.query('select count(*)::int n from shopping_lists')).rows[0].n, before);
  await fails(archiveList(db, ctx, nothing.id, { copyOpen: true }), 400, /ID/);

  const empty = await newList('Empty archive');
  assert.equal((await archiveList(db, ctx, empty.id, {})).list.archived, true);
});

test('a new list from an archived one copies every item, unchecked, and leaves the archive alone', async () => {
  const list = await newList('Whole Foods weekly', ['Milk', 'Eggs']);
  for (const item of list.items) await updateItem(db, ctx, list.id, item.id, { checked: true });
  assert.equal((await loadList(db, ctx, list.id)).archived, true);
  const newId = id();
  const copy = await copyList(db, ctx, list.id, { id: newId, title: 'Whole Foods, this week' });
  assert.equal(copy.created, true);
  assert.equal(copy.list.title, 'Whole Foods, this week');
  assert.equal(copy.list.archived, false);
  assert.deepEqual(copy.list.items.map((i) => [i.text, i.checked]), [['Milk', false], ['Eggs', false]]);
  const old = await loadList(db, ctx, list.id);
  assert.equal(old.archived, true);
  assert.deepEqual(old.items.map((i) => i.checked), [true, true]);
  assert.equal((await copyList(db, ctx, list.id, { id: newId })).created, false);
  assert.equal((await loadList(db, ctx, newId)).items.length, 2);
  const keepsTitle = await copyList(db, ctx, list.id, { id: id() });
  assert.equal(keepsTitle.list.title, 'Whole Foods weekly');
  await fails(copyList(db, ctx, list.id, {}), 400, /ID/);
});

test('title and note can be changed on an open list; deleting hides the list but keeps the rows', async () => {
  const list = await newList('Old name', ['Keep me'], ctx, 'old note');
  const renamed = await updateList(db, ctx, list.id, { title: 'New name' });
  assert.deepEqual([renamed.list.title, renamed.list.note], ['New name', 'old note']);
  const cleared = await updateList(db, ctx, list.id, { note: '' });
  assert.deepEqual([cleared.list.title, cleared.list.note], ['New name', null]);
  await fails(updateList(db, ctx, list.id, {}), 400, /Nothing/);
  await fails(updateList(db, ctx, list.id, { title: ' ' }), 400, /title/);
  assert.deepEqual(await deleteList(db, ctx, list.id), { ok: true });
  await fails(loadList(db, ctx, list.id), 404);
  await fails(deleteList(db, ctx, list.id), 404);
  await fails(addItem(db, ctx, list.id, { id: id(), text: 'late' }), 404);
  const all = await listShopping(db, ctx);
  assert.equal([...all.open, ...all.archived].some((l) => l.id === list.id), false);
  const rows = await pg.query('select deleted_at from shopping_lists where id = $1', [list.id]);
  assert.ok(rows.rows[0].deleted_at);
  assert.equal((await pg.query('select count(*)::int n from shopping_items where list_id = $1', [list.id])).rows[0].n, 1);
});

test('the overview splits open and archived lists and counts items', async () => {
  const list = await newList('Overview', ['A', 'B', 'C']);
  await updateItem(db, ctx, list.id, list.items[0].id, { checked: true });
  const all = await listShopping(db, ctx);
  const row = all.open.find((l) => l.id === list.id);
  assert.deepEqual([row.total, row.checked, row.archived], [3, 1, false]);
  assert.equal('items' in row, false);
  for (const l of all.archived) assert.ok(l.archivedOn);
  const archivedDates = all.archived.map((l) => l.archivedOn);
  assert.deepEqual(archivedDates, [...archivedDates].sort().reverse());
});

test('another household can neither see nor change these lists', async () => {
  const mine = await newList('Private list', ['Secret milk']);
  const theirs = await newList('Their list', ['Their eggs'], other);
  const snapshot = async () => JSON.stringify((await pg.query('select id, title, note, archived_at, deleted_at from shopping_lists where household_id = $1 order by id', [ctx.householdId])).rows)
    + JSON.stringify((await pg.query('select id, text, checked_at, deleted_at from shopping_items where household_id = $1 order by id', [ctx.householdId])).rows);
  const before = await snapshot();

  await fails(loadList(db, other, mine.id), 404);
  await fails(updateList(db, other, mine.id, { title: 'hacked' }), 404);
  await fails(deleteList(db, other, mine.id), 404);
  await fails(addItem(db, other, mine.id, { id: id(), text: 'sneaky' }), 404);
  await fails(updateItem(db, other, mine.id, mine.items[0].id, { checked: true }), 404);
  await fails(updateItem(db, other, theirs.id, mine.items[0].id, { checked: true }), 404);
  await fails(deleteItem(db, other, mine.id, mine.items[0].id), 404);
  await fails(archiveList(db, other, mine.id, {}), 404);
  await fails(reopenList(db, other, mine.id, {}), 404);
  await fails(copyList(db, other, mine.id, { id: id() }), 404);
  // a list ID that already belongs to another household is not reusable
  await fails(createList(db, other, { id: mine.id, title: 'Take over' }), 409);
  await fails(addItem(db, other, theirs.id, { id: mine.items[0].id, text: 'x' }), 409);
  assert.equal(await snapshot(), before);

  const seen = await listShopping(db, other);
  const text = JSON.stringify(seen);
  assert.ok(text.includes('Their list') && !text.includes('Private list'));
  assert.deepEqual(await activeListTitles(db, OTHER_HH), ['Their list']);
  assert.ok(!(await activeListTitles(db, ctx.householdId)).includes('Their list'));
});

test('activeListTitles lists the lists that are not archived or deleted, oldest first', async () => {
  const a = await newList('Zed first');
  const b = await newList('Alpha second', ['x']);
  const c = await newList('Gone');
  await deleteList(db, ctx, c.id);
  const mid = await newList('Finished', ['x']);
  await updateItem(db, ctx, mid.id, mid.items[0].id, { checked: true });
  await pg.query(`update shopping_lists set created_at = $2 where id = $1`, [a.id, '2020-01-01T00:00:00Z']);
  await pg.query(`update shopping_lists set created_at = $2 where id = $1`, [b.id, '2020-01-02T00:00:00Z']);
  const titles = await activeListTitles(db, ctx.householdId);
  assert.equal(titles[0], 'Zed first');
  assert.equal(titles[1], 'Alpha second');
  assert.ok(!titles.includes('Gone') && !titles.includes('Finished'));
});

test('the email data carries the open list titles', async () => {
  const data = await loadDigestData(db, ctx.householdId, NOW);
  assert.deepEqual(data.shoppingLists, await activeListTitles(db, ctx.householdId));
  assert.ok(data.shoppingLists.includes('Zed first'));
  assert.ok(!data.shoppingLists.includes('Finished'));
});

test('the export includes lists and items, with names and no passwords', async () => {
  const data = await loadExport(db, ctx, NOW);
  assert.ok(data.shoppingLists.length > 0 && data.shoppingItems.length > 0);
  const list = data.shoppingLists.find((l) => l.title === 'Amazon' && l.archivedAt);
  assert.ok(list.archivedAt);
  assert.equal(list.createdBy, seed.users[0].display_name);
  const item = data.shoppingItems.find((i) => i.text === 'Batteries');
  assert.equal(item.listTitle, 'Amazon');
  assert.ok(!JSON.stringify(data).includes('Their eggs'));
  assert.ok(!/password|\$2[aby]\$/i.test(JSON.stringify([data.shoppingLists, data.shoppingItems])));
});

// ---- through the HTTP routes ----

async function call(method, url, body) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

test('routes: make a list, add and tick items, auto-archive, undo, copy', async () => {
  const listId = id();
  let r = await call('POST', '/api/shopping', { id: listId, title: 'Whole Foods', note: 'Guests' });
  assert.equal(r.status, 201);
  assert.equal(r.body.list.title, 'Whole Foods');
  assert.equal((await call('POST', '/api/shopping', { id: listId, title: 'Whole Foods' })).status, 200);

  const itemId = id();
  r = await call('POST', `/api/shopping/${listId}/items`, { id: itemId, text: 'Bananas' });
  assert.equal(r.status, 201);
  assert.deepEqual(r.body.list.items.map((i) => i.text), ['Bananas']);

  r = await call('GET', '/api/shopping');
  assert.equal(r.status, 200);
  assert.ok(r.body.open.some((l) => l.id === listId && l.total === 1 && l.checked === 0));
  assert.ok(Array.isArray(r.body.archived));

  r = await call('PATCH', `/api/shopping/${listId}/items/${itemId}`, { text: 'Bananas, ripe' });
  assert.equal(r.body.list.items[0].text, 'Bananas, ripe');
  r = await call('PATCH', `/api/shopping/${listId}/items/${itemId}`, { checked: true });
  assert.equal(r.status, 200);
  assert.equal(r.body.archived, true);
  assert.equal((await call('GET', `/api/shopping/${listId}`)).body.list.archived, true);
  assert.equal((await call('PATCH', `/api/shopping/${listId}/items/${itemId}`, { checked: false })).status, 409);

  r = await call('POST', `/api/shopping/${listId}/reopen`, { uncheckItemId: itemId });
  assert.equal(r.body.list.archived, false);
  assert.equal(r.body.list.checked, 0);

  const copyId = id();
  r = await call('POST', `/api/shopping/${listId}/copy`, { id: copyId, title: 'Whole Foods again' });
  assert.equal(r.status, 201);
  assert.equal(r.body.list.items.length, 1);

  r = await call('POST', `/api/shopping/${listId}/archive`, { copyOpen: true, newList: { id: id() } });
  assert.equal(r.body.list.archived, true);
  assert.equal(r.body.newList.items.length, 1);

  r = await call('PATCH', `/api/shopping/${copyId}`, { title: 'Renamed', note: 'x' });
  assert.deepEqual([r.body.list.title, r.body.list.note], ['Renamed', 'x']);
  assert.deepEqual((await call('DELETE', `/api/shopping/${copyId}/items/${(await call('GET', `/api/shopping/${copyId}`)).body.list.items[0].id}`)).body.archived, false);
  assert.equal((await call('DELETE', `/api/shopping/${copyId}`)).status, 200);
  assert.equal((await call('GET', `/api/shopping/${copyId}`)).status, 404);
});

test('routes: mistakes get plain answers', async () => {
  assert.equal((await call('GET', '/api/shopping/not-an-id')).status, 404);
  assert.equal((await call('GET', `/api/shopping/${id()}`)).status, 404);
  const bad = await call('POST', '/api/shopping', { id: id(), title: '' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /title/);
  assert.equal((await call('POST', '/api/shopping', 'oops')).status, 400);
  assert.equal((await call('PATCH', `/api/shopping/${id()}`, { title: 'x' })).status, 404);
  assert.equal((await call('POST', `/api/shopping/${id()}/archive`, {})).status, 404);
});
