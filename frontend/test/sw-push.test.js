import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// The service worker's notification handlers, run against a pretend browser. The rule that matters most:
// Safari takes the permission away from a site whose push does not show a notification, so every push must show one.
const template = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'sw-template.js'), 'utf8');

function load(scope = 'https://avckiran.github.io/radar/') {
  const handlers = {};
  const shown = [];
  const opened = [];
  const focused = [];
  let windows = [];
  const self = {
    registration: { scope, showNotification: async (title, options) => shown.push({ title, options }) },
    location: new URL(scope + 'sw.js'),
    addEventListener: (type, fn) => (handlers[type] = fn),
    skipWaiting() {},
    clients: {
      claim() {},
      matchAll: async () => windows,
      openWindow: async (url) => opened.push(url),
    },
  };
  const source = template.split('__VERSION__').join('test').split('__PRECACHE__').join('[]');
  vm.runInNewContext(source, { self, URL, caches: {}, Response: class {}, fetch() {} });
  return {
    shown,
    opened,
    focused,
    setWindows(list) {
      windows = list.map((url) => ({ url, focus: async () => focused.push(url) }));
    },
    push(data, { text } = {}) {
      let waited;
      handlers.push({
        data: data === undefined ? null : { json: () => (typeof data === 'string' ? JSON.parse(data) : data), text: () => text ?? '' },
        waitUntil: (p) => (waited = p),
      });
      return waited;
    },
    click() {
      let waited;
      const closed = [];
      handlers.notificationclick({ notification: { close: () => closed.push(true) }, waitUntil: (p) => (waited = p) });
      return waited.then(() => closed.length);
    },
  };
}

test('a push shows its title, text and tag, with the RADAR icon', async () => {
  const sw = load();
  await sw.push({ title: 'Afternoon: 3 things need you this week', body: '1 overdue · 2 due this week', tag: 'radar-afternoon' });
  assert.equal(sw.shown.length, 1);
  assert.equal(sw.shown[0].title, 'Afternoon: 3 things need you this week');
  assert.equal(sw.shown[0].options.body, '1 overdue · 2 due this week');
  assert.equal(sw.shown[0].options.tag, 'radar-afternoon');
  assert.equal(sw.shown[0].options.icon, '/radar/icons/icon-192.png');
});

test('every push shows something, even an empty or broken one', async () => {
  for (const make of [() => undefined, () => 'not json {', () => ({}), () => ({ title: 5, body: { a: 1 }, tag: 7 })]) {
    const sw = load();
    await sw.push(make());
    assert.equal(sw.shown.length, 1);
    assert.equal(sw.shown[0].title, 'RADAR');
    assert.equal(typeof sw.shown[0].options.body, 'string');
    assert.equal(sw.shown[0].options.tag, undefined);
  }
});

test('tapping a notification opens Home, or brings an open RADAR window forward', async () => {
  const none = load();
  assert.equal(await none.click(), 1, 'the notification is dismissed');
  assert.deepEqual(none.opened, ['https://avckiran.github.io/radar/']);
  const open = load();
  open.setWindows(['https://example.com/other', 'https://avckiran.github.io/radar/inbox']);
  await open.click();
  assert.deepEqual(open.focused, ['https://avckiran.github.io/radar/inbox']);
  assert.deepEqual(open.opened, []);
  const local = load('http://localhost:4173/');
  await local.click();
  assert.deepEqual(local.opened, ['http://localhost:4173/']);
});
