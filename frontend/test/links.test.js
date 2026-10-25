import { test } from 'node:test';
import assert from 'node:assert/strict';
import { domainOf, looksLikeUrl } from '../src/lib/links.js';
import { newId } from '../src/lib/ids.js';

test('web addresses are recognised, ordinary titles are not', () => {
  for (const yes of ['https://example.com/a', 'http://example.com', 'www.example.com', 'example.com/path?x=1', 'news.bbc.co.uk']) {
    assert.equal(looksLikeUrl(yes), true, yes);
  }
  for (const no of ['', 'Call the plumber', 'buy milk.', 'e.g.', 'version 2.0', 'a.b', 'hello']) {
    assert.equal(looksLikeUrl(no), false, no);
  }
});

test('domain drops www and works without a scheme', () => {
  assert.equal(domainOf('https://www.nytimes.com/x'), 'nytimes.com');
  assert.equal(domainOf('example.com/a'), 'example.com');
  assert.equal(domainOf('not a link'), '');
});

test('ids look like UUIDs and differ', () => {
  const a = newId();
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(a, newId());
});
