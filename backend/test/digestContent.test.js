import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDigest } from '../src/digest/content.js';
import { renderEmail, renderHtml, renderText } from '../src/digest/render.js';
import { SAMPLE_HOUSEHOLD, SAMPLE_USER, sampleInputs, SAMPLE_VARIANTS } from '../src/digest/sampleData.js';
import { EMAIL_COLORS } from '../src/digest/emailColors.js';
import { buildEmailColors } from '../scripts/build-email-colors.mjs';

const APP_URL = 'https://example.github.io/radar';
const here = path.dirname(fileURLToPath(import.meta.url));

function model(variant, tweak) {
  const { now, data } = sampleInputs(variant);
  const d = tweak ? tweak(structuredClone(data)) : data;
  return buildDigest({ ...d, user: SAMPLE_USER, household: SAMPLE_HOUSEHOLD, now, appUrl: APP_URL });
}

test('the three variants are picked by what is on the list', () => {
  assert.equal(model('normal').variant, 'normal');
  assert.equal(model('allclear').variant, 'allclear');
  assert.equal(model('empty').variant, 'empty');
});

test('normal day: overdue first, due this week, waiting, inbox count, up to 5 next-week items', () => {
  const m = model('normal');
  assert.deepEqual(m.overdue.map((r) => r.title), ['Renew car registration']);
  assert.ok(m.thisWeek.length >= 2);
  assert.equal(m.waiting.length, 1);
  assert.equal(m.inboxCount, 3);
  assert.ok(m.nextWeek.length > 0 && m.nextWeek.length <= 5);
  assert.match(m.subject, /things need you this week/);
  assert.match(m.preheader, /overdue/);
});

test('subject is singular for exactly one thing', () => {
  const m = model('normal', (d) => {
    d.openItems = d.openItems.filter((i) => i.id === 'a2');
    d.inboxCount = 0;
    return d;
  });
  assert.equal(m.subject, '1 thing needs you this week');
});

test('all clear: warm, no next-week preview, one line each for waiting and inbox', () => {
  const m = model('allclear');
  assert.equal(m.nextWeek, undefined);
  assert.equal(m.looseEnds.inboxCount, 2);
  assert.equal(m.looseEnds.waiting.length, 1);
  assert.ok(m.finished.titles.length > 0);
  const text = renderText(m);
  assert.doesNotMatch(text, /Next up/i);
});

test('empty day says the fixed sentence', () => {
  const email = renderEmail(model('empty'));
  assert.match(email.text, /Nothing on the list today\. Enjoy the day\./);
  assert.match(email.html, /Nothing on the list today/);
});

test('long lists are capped with a "more" count', () => {
  const m = model('normal', (d) => {
    for (let i = 0; i < 20; i++) {
      d.openItems.push({ ...d.openItems[1], id: `x${i}`, title: `Extra ${i}`, due_date: '2026-10-21' });
    }
    return d;
  });
  assert.equal(m.thisWeek.length, 15);
  assert.ok(m.thisWeekMore > 0);
  assert.match(renderText(m), /\+ \d+ more/);
});

test('titles are escaped in HTML and kept literal in text', () => {
  const m = model('normal', (d) => {
    d.openItems[0].title = '<script>alert("x")</script> & more';
    return d;
  });
  const { html, text } = renderEmail(m);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(text, /<script>alert\("x"\)<\/script> & more/);
});

test('every item links into the app and the footer explains the send time', () => {
  for (const v of SAMPLE_VARIANTS) {
    const { html, text } = renderEmail(model(v));
    assert.match(html, new RegExp(`${APP_URL}/settings`));
    assert.match(text, new RegExp(`${APP_URL}/settings`));
    assert.match(text, /maya@example\.com/);
    assert.match(text, /8:00 AM Eastern/);
  }
  const { html } = renderEmail(model('normal'));
  assert.match(html, new RegExp(`${APP_URL}/items/a1`));
});

test('the HTML has a dark-mode block and no unreplaced placeholders', () => {
  for (const v of SAMPLE_VARIANTS) {
    const html = renderHtml(model(v));
    assert.match(html, /prefers-color-scheme:\s*dark/);
    assert.match(html, /color-scheme/);
    assert.doesNotMatch(html, /undefined|\[object Object\]|NaN|\{\{/);
    assert.match(html, /<!doctype html>/i);
  }
});

test('the email colors copy matches the design tokens', () => {
  const tokens = JSON.parse(fs.readFileSync(path.join(here, '..', '..', 'frontend', 'design', 'tokens.json'), 'utf8'));
  assert.deepEqual(EMAIL_COLORS, buildEmailColors(tokens), 'Run: npm run digest:colors -w backend');
});
