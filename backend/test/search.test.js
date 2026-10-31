import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openContext } from './helpers.js';
import { buildTsQuery } from '../src/search.js';
import { buildSearchResult, toParts } from '../src/rules/searchView.js';

const M = '\u0001';
const E = '\u0002';
const NOW = new Date('2026-10-26T15:00:00Z');

test('typed words become a prefix query, and punctuation cannot break it', () => {
  assert.equal(buildTsQuery('insurance'), 'insurance:*');
  assert.equal(buildTsQuery('  Dentist   call '), 'dentist:* & call:*');
  assert.equal(buildTsQuery("mom's"), 'mom:*');
  assert.equal(buildTsQuery("'); drop table items; --"), 'drop:* & table:* & items:*');
  assert.equal(buildTsQuery('!!!'), '');
  assert.equal(buildTsQuery('a'), 'a:*');
  assert.equal(buildTsQuery('a b'), '');
});

test('marked text splits into plain and marked parts', () => {
  assert.deepEqual(toParts(`called ${M}insurance${E}, 3–5 days`), [
    { text: 'called ', mark: false },
    { text: 'insurance', mark: true },
    { text: ', 3–5 days', mark: false },
  ]);
  assert.deepEqual(toParts(''), []);
});

const base = {
  id: 'i1', kind: 'action', state: 'active', title: 'Pay card', title_marked: 'Pay card', body: null, url: null, description: null,
  due_date: null, snoozed_until: null, follow_up_date: null, waiting_since: null, created_at: NOW, segment_id: 's1',
  segment_name: 'Finances', segment_color: 'emerald', in_title: false, in_body: false, in_description: false,
};
const ctx = { today: '2026-10-26', timeZone: 'America/New_York', eventDay: 'Oct 18' };

test('a follow-up note match says where it matched, with the day and the name', () => {
  const r = buildSearchResult(
    { ...base, event_note: 'called insurance, 3–5 days', event_marked: `called ${M}insurance${E}, 3–5 days`, event_by: 'Chandra' },
    ctx
  );
  assert.equal(r.matchedIn, 'history');
  assert.equal(r.line.prefix, 'History note, Oct 18 · Chandra: “');
  assert.equal(r.line.suffix, '”');
  assert.deepEqual(r.line.parts.map((p) => [p.text, p.mark]), [['called ', false], ['insurance', true], [', 3–5 days', false]]);
  assert.equal(r.tag.label, 'Active');
});

test('a title match on a link shows its domain; notes matches show an excerpt with ellipses only when cut', () => {
  const link = buildSearchResult({ ...base, kind: 'link', title: 'Plans', title_marked: `${M}Plans${E}`, url: 'https://www.insure.example/x', in_title: true }, ctx);
  assert.equal(link.matchedIn, 'title');
  assert.equal(link.line.parts[0].text, 'Link · insure.example');
  assert.equal(link.tag, null);

  const cut = buildSearchResult({ ...base, kind: 'note', body: 'home and auto insurance policy numbers, renewal in May', body_marked: `auto ${M}insurance${E} policy`, in_body: true }, ctx);
  assert.equal(cut.matchedIn, 'notes');
  assert.equal(cut.line.prefix, 'Matched in notes: ');
  assert.equal(cut.line.lead, true);
  assert.equal(cut.line.trail, true);

  const whole = buildSearchResult({ ...base, kind: 'note', body: 'insurance numbers', body_marked: `${M}insurance${E} numbers`, in_body: true, in_title: true }, ctx);
  assert.equal(whole.line.prefix, null);
  assert.equal(whole.line.lead, false);
  assert.equal(whole.line.trail, false);
});

function fakeDb(rows) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('from households')) return { rows: [{ id: 'h1', name: 'Home', time_zone: 'America/New_York', nudge_days: 5 }] };
      if (sql.includes('from users')) return { rows: [{ id: 'u1', display_name: 'Chandra', is_owner: true }] };
      if (sql.includes('to_tsquery')) return { rows };
      throw new Error(`unexpected query: ${sql}`);
    },
  };
}

async function get(db, path) {
  const app = createApp({ authenticate: openContext(db), db, corsOrigins: [], now: () => NOW });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const res = await fetch(`http://localhost:${server.address().port}${path}`);
  const json = await res.json();
  await new Promise((r) => server.close(r));
  return { status: res.status, json };
}

test('GET /api/search is limited to the household and skips the database for short queries', async () => {
  const db = fakeDb([{ ...base, in_title: true, title_marked: `${M}Pay${E} card` }]);
  const hit = await get(db, '/api/search?q=pay');
  assert.equal(hit.status, 200);
  assert.equal(hit.json.results[0].title[0].mark, true);
  const call = db.calls.find((c) => c.sql.includes('to_tsquery'));
  assert.equal(call.params[0], 'h1');
  assert.equal(call.params[1], 'pay:*');
  assert.match(call.sql, /deleted_at is null/);

  const quiet = fakeDb([]);
  const none = await get(quiet, '/api/search?q=p');
  assert.deepEqual(none.json.results, []);
  assert.equal(quiet.calls.some((c) => c.sql.includes('to_tsquery')), false);
  assert.deepEqual((await get(quiet, '/api/search')).json.results, []);
});
