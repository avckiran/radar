import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addRecent } from '../src/lib/recentSearches.js';

test('recent searches keep the newest first, without repeats, at most six', () => {
  let list = [];
  for (const q of ['one', 'two', 'three', 'four', 'five', 'six', 'seven']) list = addRecent(list, q);
  assert.deepEqual(list, ['seven', 'six', 'five', 'four', 'three', 'two']);
  assert.deepEqual(addRecent(list, ' TWO '), ['TWO', 'seven', 'six', 'five', 'four', 'three']);
});

test('very short searches are not remembered', () => {
  assert.deepEqual(addRecent(['abc'], 'a'), ['abc']);
  assert.deepEqual(addRecent(['abc'], '   '), ['abc']);
});
