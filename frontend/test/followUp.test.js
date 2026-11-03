import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMPTY_FOLLOW_UP, doneBody, followUpValues } from '../src/lib/followUp.js';

const here = path.dirname(fileURLToPath(import.meta.url));

test('follow-up choices turn into a check-back date', () => {
  const today = '2026-11-03';
  assert.deepEqual(followUpValues(EMPTY_FOLLOW_UP, today), { waitingOn: '', checkBack: null, invalid: false });
  assert.equal(followUpValues({ ...EMPTY_FOLLOW_UP, choice: 'three-days' }, today).checkBack, '2026-11-06');
  assert.equal(followUpValues({ ...EMPTY_FOLLOW_UP, choice: 'one-week' }, today).checkBack, '2026-11-10');
  assert.equal(followUpValues({ waitingOn: '  Mom ', choice: 'none', custom: '' }, today).waitingOn, 'Mom');
});

test('a picked date must be there and not in the past', () => {
  const today = '2026-11-03';
  assert.equal(followUpValues({ ...EMPTY_FOLLOW_UP, choice: 'pick', custom: '' }, today).invalid, true);
  assert.equal(followUpValues({ ...EMPTY_FOLLOW_UP, choice: 'pick', custom: '2026-11-01' }, today).invalid, true);
  const ok = followUpValues({ ...EMPTY_FOLLOW_UP, choice: 'pick', custom: '2026-11-20' }, today);
  assert.equal(ok.invalid, false);
  assert.equal(ok.checkBack, '2026-11-20');
});

test('the done request only carries what was chosen', () => {
  assert.deepEqual(doneBody('', null), {});
  assert.deepEqual(doneBody('paid online', null), { note: 'paid online' });
  assert.deepEqual(doneBody('', { waitingOn: 'Bank', checkBack: '2026-11-10', invalid: false }), { followUp: { waitingOn: 'Bank', checkBack: '2026-11-10' } });
});

test('text boxes are 16px on touch screens so iPhones do not zoom in when you tap them', () => {
  const css = fs.readFileSync(path.join(here, '../src/styles/a11y.css'), 'utf8');
  const block = css.match(/@media \(pointer: coarse\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(block, 'the touch-screen rule is missing');
  assert.match(block[1], /textarea/);
  assert.match(block[1], /font-size:\s*16px/);
});
