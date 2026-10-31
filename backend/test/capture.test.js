import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openContext } from './helpers.js';
import { domainOf, normalizeUrl, validateCapture } from '../src/capture.js';
import { HttpError } from '../src/lifecycle.js';

const ID = '11111111-1111-4111-8111-111111111111';
const SEG = '22222222-2222-4222-8222-222222222222';
const fails = (input, pattern) =>
  assert.throws(() => validateCapture(input), (e) => e instanceof HttpError && e.status === 400 && pattern.test(e.message));

test('links accept web addresses and add https when it is missing', () => {
  assert.equal(normalizeUrl('example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(normalizeUrl('  http://example.com  '), 'http://example.com/');
  assert.equal(normalizeUrl('example.com:8080/x'), 'https://example.com:8080/x');
  assert.equal(domainOf('https://www.nytimes.com/x'), 'nytimes.com');
});

test('links reject anything that is not a plain web address', () => {
  for (const bad of ['javascript:alert(1)', 'mailto:a@b.com', 'data:text/html,hi', 'ftp://example.com', 'not a url', 'localhost', '', null]) {
    assert.equal(normalizeUrl(bad), null, String(bad));
  }
});

test('an action needs a title; a due date must be real', () => {
  fails({ id: ID, kind: 'action', title: '   ' }, /title/);
  fails({ id: ID, kind: 'action', title: 'x', dueDate: '2026-02-30' }, /due date/);
  assert.equal(validateCapture({ id: ID, kind: 'action', title: ' Pay rent ', dueDate: '2026-10-30' }).dueDate, '2026-10-30');
  assert.equal(validateCapture({ id: ID, kind: 'action', title: 'Late', dueDate: '2026-01-01' }).dueDate, '2026-01-01');
});

test('an action can carry a link, which must be a web address', () => {
  assert.equal(validateCapture({ id: ID, kind: 'action', title: 'Read this', url: 'example.com/a' }).url, 'https://example.com/a');
  assert.equal(validateCapture({ id: ID, kind: 'action', title: 'No link', url: '  ' }).url, null);
  fails({ id: ID, kind: 'action', title: 'x', url: 'javascript:alert(1)' }, /web address/);
});

test('a note needs a title or a body; the title is taken from the body when missing', () => {
  fails({ id: ID, kind: 'note' }, /note/);
  const note = validateCapture({ id: ID, kind: 'note', body: '\n  First line here\nsecond line', dueDate: '2026-10-30' });
  assert.equal(note.title, 'First line here');
  assert.equal(note.dueDate, null);
});

test('a link uses its domain as the title and drops fields that do not belong', () => {
  const link = validateCapture({ id: ID, kind: 'link', url: 'www.example.com/read', description: ' good ', body: 'ignored' });
  assert.deepEqual([link.title, link.url, link.description, link.body], ['example.com', 'https://www.example.com/read', 'good', null]);
  fails({ id: ID, kind: 'link', url: 'nope' }, /web address/);
});

test('ids, kinds, segment ids and lengths are checked', () => {
  fails({ kind: 'action', title: 'x' }, /ID/);
  fails({ id: ID, kind: 'task', title: 'x' }, /Action, Note or Link/);
  fails({ id: ID, kind: 'action', title: 'x', segmentId: 'abc' }, /segment/);
  fails({ id: ID, kind: 'action', title: 'x'.repeat(301) }, /too long/);
  fails({ id: ID, kind: 'note', body: 'x'.repeat(20001) }, /too long/);
});

function fakeDb({ segment = { id: SEG, name: 'Finances', allowed_kinds: ['action', 'note', 'link'] }, existing = null } = {}) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push([sql, params]);
      if (sql.includes('from households')) return { rows: [{ id: 'h1', name: 'Home', time_zone: 'America/Chicago', nudge_days: 5 }] };
      if (sql.includes('from users where')) return { rows: [{ id: 'u1', display_name: 'Chandra', is_owner: true }] };
      if (sql.includes('from segments')) return { rows: segment ? [segment] : [] };
      if (sql.includes('insert into items')) {
        return { rows: existing ? [] : [{ id: params[0], kind: params[3], state: params[4], title: params[5], segmentId: params[2], dueDate: params[9] }] };
      }
      if (sql.includes('from items where id')) return { rows: existing ? [existing] : [] };
      return { rows: [] };
    },
  };
}

async function post(db, body) {
  const app = createApp({ authenticate: openContext(db), db, corsOrigins: [] });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const res = await fetch(`http://localhost:${server.address().port}/api/items`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  await new Promise((r) => server.close(r));
  return { status: res.status, json };
}

test('POST /api/items without a segment lands in the Inbox', async () => {
  const db = fakeDb();
  const { status, json } = await post(db, { id: ID, kind: 'action', title: 'Call plumber' });
  assert.equal(status, 201);
  assert.equal(json.item.state, 'inbox');
  assert.equal(json.created, true);
  const event = db.calls.find(([sql]) => sql.includes('insert into item_events'));
  assert.deepEqual([event[1][2], event[1][3]], ['inbox', 'u1']);
});

test('POST /api/items with a segment goes straight to Active', async () => {
  for (const kind of ['action', 'note', 'link']) {
    const { status, json } = await post(fakeDb(), { id: ID, kind, title: 'x', body: 'x', url: 'example.com', segmentId: SEG });
    assert.equal(status, 201);
    assert.equal(json.item.state, 'active');
    assert.equal(json.segmentName, 'Finances');
  }
});

test('sending the same id again returns the saved item and adds nothing', async () => {
  const existing = { id: ID, kind: 'action', state: 'inbox', title: 'Call plumber', segmentId: null, dueDate: null };
  const db = fakeDb({ existing });
  const { status, json } = await post(db, { id: ID, kind: 'action', title: 'Call plumber' });
  assert.equal(status, 200);
  assert.equal(json.created, false);
  assert.equal(json.item.title, 'Call plumber');
  assert.equal(db.calls.some(([sql]) => sql.includes('insert into item_events')), false);
});

test('unknown segments and kinds the segment refuses are explained', async () => {
  const missing = await post(fakeDb({ segment: null }), { id: ID, kind: 'action', title: 'x', segmentId: SEG });
  assert.equal(missing.status, 400);
  assert.match(missing.json.error, /segment/);
  const picky = fakeDb({ segment: { id: SEG, name: 'Health', allowed_kinds: ['action'] } });
  const refused = await post(picky, { id: ID, kind: 'note', title: 'x', segmentId: SEG });
  assert.equal(refused.status, 400);
  assert.match(refused.json.error, /Health doesn’t take notes/);
});
