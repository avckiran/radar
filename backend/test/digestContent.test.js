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

function model(variant, tweak, extra = {}) {
  const { now, data } = sampleInputs(variant);
  const d = tweak ? tweak(structuredClone(data)) : data;
  return buildDigest({ ...d, user: SAMPLE_USER, household: SAMPLE_HOUSEHOLD, now, appUrl: APP_URL, ...extra });
}

test('the three variants are picked by what is on the list', () => {
  assert.equal(model('normal').variant, 'normal');
  assert.equal(model('allclear').variant, 'allclear');
  assert.equal(model('empty').variant, 'empty');
});

test('normal day: overdue first, due this week, follow-ups, inbox count, up to 5 next-week items', () => {
  const m = model('normal');
  assert.deepEqual(m.overdue.map((r) => r.title), ['Renew car registration']);
  assert.ok(m.thisWeek.length >= 2);
  // every open follow-up is listed, not only the ones due a nudge; the one past its check-back date leads
  assert.deepEqual(m.followUps.map((r) => r.title), ['Insurance claim reimbursement', 'Contractor quote for the deck', 'Reply from school about forms']);
  assert.equal(m.followUps[0].sub, 'with the insurer · check back now');
  assert.equal(m.followUps[0].tone, 'late');
  assert.equal(m.followUps[1].label, '2 days open');
  assert.equal(m.followUps[2].sub, null);
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

test('all clear: warm, no next-week preview, follow-ups still listed, one line for the inbox', () => {
  const m = model('allclear');
  assert.equal(m.nextWeek, undefined);
  assert.equal(m.looseEnds.inboxCount, 2);
  assert.equal(m.looseEnds.followUps.length, 1);
  assert.ok(m.finished.titles.length > 0);
  const text = renderText(m);
  assert.doesNotMatch(text, /Next up/i);
});

test('rows carry the segment name and color, a short label and no creator name', () => {
  const m = model('normal');
  const r = m.overdue[0];
  assert.equal(r.segment.name, 'General / Administrative');
  assert.equal(r.label, '2 days late');
  assert.equal(r.tone, 'late');
  const email = renderEmail(m);
  assert.match(email.html, /border-left:4px solid/);
  assert.match(email.html, /General \/ Administrative/);
  assert.doesNotMatch(email.html, /by Dev|by Maya/);
  assert.doesNotMatch(email.text, /by Dev|by Maya/);
  // section order: Overdue, Due this week, Follow-up needed, then the button
  const order = ['Overdue &middot;', 'Due this week &middot;', 'Follow-up needed &middot;', 'Open RADAR'].map((x) => email.html.indexOf(x));
  assert.ok(order.every((n) => n > 0) && [...order].sort((a, b) => a - b).join() === order.join());
  assert.match(email.text, /FOLLOW-UP NEEDED \(3\)/);
  assert.doesNotMatch(email.html + email.text, /Waiting|WAITING/);
});

test('all clear and empty emails still list open follow-ups', () => {
  const clear = renderEmail(model('allclear'));
  assert.match(clear.html, /Follow-up needed &middot; 1/);
  assert.match(clear.text, /FOLLOW-UP NEEDED \(1\)/);
  const none = renderEmail(model('empty'));
  assert.doesNotMatch(none.html, /Follow-up needed/);
});

test('a section with more than 15 rows says how many are left', () => {
  const m = model('normal', (d) => {
    for (let i = 0; i < 18; i += 1) d.openItems.push({ ...d.openItems[0], id: `x${i}`, title: `Late thing ${i}` });
    return d;
  });
  assert.equal(m.overdue.length, 15);
  assert.equal(m.overdueMore, 4);
  assert.match(renderEmail(m).html, /\+ 4 more in RADAR/);
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

test('afternoon and evening emails name themselves; the morning one does not', () => {
  assert.match(model('normal').subject, /^6 things need you/);
  assert.match(model('normal', null, { slot: 'afternoon' }).subject, /^Afternoon: 6 things need you this week$/);
  assert.match(model('normal', null, { slot: 'evening' }).subject, /^Evening: /);
  assert.match(model('normal').intro, /^Here’s what needs you today/);
  assert.match(model('normal', null, { slot: 'afternoon' }).intro, /^Here’s what still needs you today/);
  assert.match(model('allclear', null, { slot: 'evening' }).subject, /^Evening: All clear/);
});

test('needsYou counts overdue, due this week and waiting nudges, so quiet days can be spotted', () => {
  assert.equal(model('normal').needsYou, 4);
  assert.equal(model('allclear').needsYou, 1);
  assert.equal(model('empty').needsYou, 0);
});

test('the footer lists every time the person gets an email', () => {
  const three = renderEmail(model('normal'));
  assert.match(three.text, /You get this email at 8:00 AM Eastern/);
  const { now, data } = sampleInputs('normal');
  const m = buildDigest({ ...data, user: { ...SAMPLE_USER, sendTimes: ['08:00', '14:00', '18:00'] }, household: SAMPLE_HOUSEHOLD, now, appUrl: APP_URL });
  const email = renderEmail(m);
  assert.match(email.text, /You get these emails at 8:00 AM, 2:00 PM and 6:00 PM Eastern/);
  assert.match(email.html, /You get these emails at 8:00 AM, 2:00 PM and 6:00 PM Eastern/);
});
