import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeed, seedId } from '../src/seedData.js';

const STATES = ['inbox', 'active', 'waiting', 'snoozed', 'done'];

test('seed ids are stable, so running the seed twice cannot duplicate rows', () => {
  assert.equal(seedId('item:car-reg'), seedId('item:car-reg'));
  assert.notEqual(seedId('item:car-reg'), seedId('item:hsa'));
  assert.match(seedId('x'), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const a = buildSeed({ now: new Date('2026-10-25T12:00:00Z') });
  const b = buildSeed({ now: new Date('2026-10-30T12:00:00Z') });
  assert.deepEqual(a.items.map((i) => i.id), b.items.map((i) => i.id));
});

test('the household has two owners and the five default segments', () => {
  const seed = buildSeed({ now: new Date('2026-10-25T12:00:00Z') });
  assert.deepEqual(seed.users.map((u) => u.display_name), ['Chandra', 'Komal']);
  assert.ok(seed.users.every((u) => u.is_owner));
  assert.deepEqual(seed.segments.map((s) => s.name), ['Finances', 'Health', 'Career', 'Future Plans', 'General / Administrative']);
  assert.deepEqual(seed.segments.map((s) => s.color), ['emerald', 'rose', 'blue', 'violet', 'slate']);
  assert.equal(seed.segments.filter((s) => s.protected).length, 1);
});

for (const day of ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']) {
  test(`seed covers every state and kind (today is ${day})`, () => {
    const now = new Date(`${day}T16:00:00Z`);
    const { items, today } = buildSeed({ now });
    assert.equal(today, day);
    assert.ok(items.length >= 25 && items.length <= 40, `about 25-35 items, got ${items.length}`);
    for (const state of STATES) assert.ok(items.some((i) => i.state === state), `missing state ${state}`);
    for (const kind of ['action', 'note', 'link']) assert.ok(items.some((i) => i.kind === kind), `missing kind ${kind}`);

    assert.ok(items.some((i) => i.state === 'active' && i.due_date < today), 'an overdue item');
    assert.ok(items.some((i) => i.due_date === today), 'an item due today');
    assert.ok(items.some((i) => i.due_date > today), 'items due later');
    assert.ok(items.some((i) => i.state === 'waiting' && i.follow_up_date < today), 'a Waiting item past its follow-up');
    assert.ok(items.some((i) => i.state === 'snoozed' && i.snoozed_until < today), 'a returned snooze');
    assert.ok(items.some((i) => i.state === 'snoozed' && i.snoozed_until > today), 'a snooze still asleep');
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 3600 * 1000);
    assert.ok(items.some((i) => i.state === 'inbox' && i.created_at < twoDaysAgo), 'an Inbox item unsorted 2+ days');
    assert.ok(items.some((i) => i.state === 'inbox' && i.created_at > twoDaysAgo), 'a fresh Inbox item');
  });
}

test('items respect the database rules', () => {
  const { items, segments } = buildSeed({ now: new Date('2026-10-25T12:00:00Z') });
  const segmentIds = new Set(segments.map((s) => s.id));
  for (const i of items) {
    if (['active', 'waiting', 'snoozed'].includes(i.state)) assert.ok(i.segment_id, `${i.title} needs a segment`);
    if (i.segment_id) assert.ok(segmentIds.has(i.segment_id));
    if (i.kind !== 'action') {
      assert.ok(['inbox', 'active'].includes(i.state), `${i.title}: notes and links are only inbox or active`);
      assert.equal(i.due_date, null);
    }
    if (i.kind === 'link') assert.ok(i.url);
    if (i.state === 'waiting') assert.ok(i.waiting_since && i.waiting_on);
    if (i.state === 'snoozed') assert.ok(i.snoozed_until);
  }
});

test('every item has a created event and events point at real items', () => {
  const { items, events } = buildSeed({ now: new Date('2026-10-25T12:00:00Z') });
  const ids = new Set(items.map((i) => i.id));
  for (const i of items) assert.ok(events.some((e) => e.item_id === i.id && e.type === 'created'), i.title);
  assert.ok(events.every((e) => ids.has(e.item_id)));
  assert.equal(new Set(events.map((e) => e.id)).size, events.length, 'event ids are unique');
  assert.ok(events.some((e) => e.type === 'follow_up'));
});
