import { test } from 'node:test';
import assert from 'node:assert/strict';
import { archivedLabel, createdLabel, itemsLeftText, openCount, overviewSubtitle, progress, sortItems, withChecked, withNewItem, withText, withoutItem } from '../src/lib/shopping.js';

const item = (id, text, pos, checked = false) => ({ id, text, pos, checked, addedBy: 'Chandra', checkedBy: null });
const list = (items) => ({
  id: 'l1',
  title: 'Whole Foods',
  total: items.length,
  checked: items.filter((i) => i.checked).length,
  items,
});

test('checked items sink below the open ones, and each group keeps the order items were added in', () => {
  const sorted = sortItems([item('c', 'Bread', 3, true), item('a', 'Milk', 1), item('d', 'Eggs', 4), item('b', 'Apples', 2, true)]);
  assert.deepEqual(sorted.map((i) => i.text), ['Milk', 'Eggs', 'Apples', 'Bread']);
});

test('ticking and unticking moves the item and updates the counts without touching the original list', () => {
  const start = list([item('a', 'Milk', 1), item('b', 'Eggs', 2), item('c', 'Bread', 3)]);
  const ticked = withChecked(start, 'a', true);
  assert.deepEqual(ticked.items.map((i) => [i.text, i.checked]), [['Eggs', false], ['Bread', false], ['Milk', true]]);
  assert.deepEqual([ticked.total, ticked.checked], [3, 1]);
  assert.equal(start.items[0].checked, false);
  const back = withChecked(ticked, 'a', false);
  assert.deepEqual(back.items.map((i) => i.text), ['Milk', 'Eggs', 'Bread']);
  assert.equal(back.checked, 0);
});

test('adding, renaming and removing items', () => {
  let l = list([item('a', 'Milk', 5, true), item('b', 'Eggs', 7)]);
  l = withNewItem(l, { id: 'n', text: 'Tea', addedBy: 'Komal' });
  assert.deepEqual(l.items.map((i) => i.text), ['Eggs', 'Tea', 'Milk']);
  assert.equal(l.items[1].pos, 8);
  assert.equal(l.total, 3);
  l = withText(l, 'n', 'Green tea');
  assert.equal(l.items[1].text, 'Green tea');
  l = withoutItem(l, 'a');
  assert.deepEqual([l.total, l.checked], [2, 0]);
  assert.equal(withNewItem(list([]), { id: 'x', text: 'First' }).items[0].pos, 1);
});

test('progress says what is done in plain words', () => {
  assert.deepEqual(progress(list([])), { pct: 0, label: 'No items yet' });
  assert.deepEqual(progress(list([item('a', 'a', 1), item('b', 'b', 2, true), item('c', 'c', 3, true)])), { pct: 67, label: '2 of 3 done' });
  assert.deepEqual(progress(list([item('a', 'a', 1, true)])), { pct: 100, label: 'All done' });
  assert.equal(openCount(list([item('a', 'a', 1), item('b', 'b', 2, true)])), 1);
  assert.equal(itemsLeftText(list([item('a', 'a', 1)])), '1 item left');
  assert.equal(itemsLeftText(list([item('a', 'a', 1), item('b', 'b', 2)])), '2 items left');
});

test('created and archived dates show the year only when it is not this year', () => {
  assert.equal(createdLabel({ createdOn: '2026-11-05' }, '2026-11-09'), 'Created Nov 5');
  assert.equal(archivedLabel({ archivedOn: '2026-11-09' }, '2026-11-09'), 'Archived Nov 9');
  assert.equal(createdLabel({ createdOn: '2025-12-24' }, '2026-01-02'), 'Created Dec 24, 2025');
  assert.equal(createdLabel({ createdOn: '2026-11-05' }), 'Created Nov 5');
});

test('the overview subtitle counts open and archived lists', () => {
  assert.equal(overviewSubtitle({ open: [], archived: [] }), 'One list for each store or trip');
  assert.equal(overviewSubtitle({ open: [1, 2], archived: [] }), '2 open');
  assert.equal(overviewSubtitle({ open: [1], archived: [1, 2, 3] }), '1 open · 3 archived');
});
