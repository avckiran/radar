import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { precacheList, listFiles, buildSw } from '../scripts/build-sw.mjs';
import os from 'node:os';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function env({ seen = false, standalone = false, coarse = true, navStandalone = false, blocked = false } = {}) {
  const data = new Map(seen ? [['radar.install.seen', '1']] : []);
  globalThis.window = {
    localStorage: {
      getItem: (k) => {
        if (blocked) throw new Error('blocked');
        return data.get(k) ?? null;
      },
      setItem: (k, v) => {
        if (blocked) throw new Error('blocked');
        data.set(k, v);
      },
    },
    matchMedia: (q) => ({ matches: q.includes('standalone') ? standalone : q.includes('coarse') ? coarse : false }),
    navigator: { standalone: navStandalone },
  };
  return import(`../src/lib/install.js?${Math.random()}`);
}
beforeEach(() => {
  delete globalThis.window;
});

test('the Home Screen prompt shows once, on a touch device that has not installed RADAR', async () => {
  const fresh = await env();
  assert.equal(fresh.shouldShowInstallPrompt(), true);
  fresh.markInstallSeen();
  assert.equal(fresh.shouldShowInstallPrompt(), false, 'not again after Got it or Not now');
  assert.equal((await env({ seen: true })).shouldShowInstallPrompt(), false);
  assert.equal((await env({ standalone: true })).shouldShowInstallPrompt(), false, 'already installed');
  assert.equal((await env({ navStandalone: true })).shouldShowInstallPrompt(), false, 'iOS installed flag');
  assert.equal((await env({ coarse: false })).shouldShowInstallPrompt(), false, 'desktop with a mouse');
  assert.equal((await env({ blocked: true })).shouldShowInstallPrompt(), false, 'blocked storage: never nag');
});

test('the manifest lists real icons, relative addresses and the design colors', () => {
  const m = JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(m.name, 'RADAR');
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, './');
  assert.equal(m.scope, './');
  assert.equal(m.background_color, '#F2F3F6');
  assert.equal(m.theme_color, '#FFFFFF');
  const purposes = m.icons.map((i) => `${i.sizes}:${i.purpose}`).sort();
  assert.deepEqual(purposes, ['192x192:any', '512x512:any', '512x512:maskable']);
  for (const icon of m.icons) {
    assert.ok(!icon.src.startsWith('/'), `${icon.src} must be relative so it works under /radar/`);
    assert.ok(fs.existsSync(path.join(root, 'public', icon.src)), `${icon.src} exists`);
  }
});

test('the page head carries the install tags from the design notes', () => {
  const html = read('index.html');
  for (const needle of [
    'rel="manifest"',
    'name="apple-mobile-web-app-capable"',
    'name="apple-mobile-web-app-title" content="RADAR"',
    'name="apple-mobile-web-app-status-bar-style"',
    'name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)"',
    'name="theme-color" content="#161A20" media="(prefers-color-scheme: dark)"',
    'rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png"',
    'viewport-fit=cover',
  ]) {
    assert.ok(html.includes(needle), `index.html has ${needle}`);
  }
  for (const f of ['apple-touch-icon-180.png', 'apple-touch-icon-167.png', 'apple-touch-icon-152.png', 'apple-touch-icon-120.png', 'favicon-32.png']) {
    assert.ok(fs.existsSync(path.join(root, 'public', 'icons', f)), f);
  }
});

test('the offline file list leaves out the worker itself and the GitHub copy of the page', () => {
  assert.deepEqual(precacheList(['404.html', 'assets/a.js', 'assets/a.js.map', 'index.html', 'sw.js', 'icons/x.png']), ['assets/a.js', 'index.html', 'icons/x.png']);
});

test('only the Latin letters in the modern font format are saved ahead of time', () => {
  const fonts = [
    'assets/ibm-plex-sans-latin-400-normal-AAA.woff2',
    'assets/ibm-plex-sans-latin-400-normal-BBB.woff',
    'assets/ibm-plex-sans-cyrillic-400-normal-CCC.woff2',
    'assets/ibm-plex-sans-latin-ext-400-normal-DDD.woff2',
    'assets/ibm-plex-mono-latin-400-normal-EEE.woff2',
  ];
  assert.deepEqual(precacheList(fonts), ['assets/ibm-plex-sans-latin-400-normal-AAA.woff2', 'assets/ibm-plex-mono-latin-400-normal-EEE.woff2']);
});

test('the worker is built from the template with a fingerprint and the file list', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-dist-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<html>one</html>');
  fs.writeFileSync(path.join(dir, '404.html'), '<html>one</html>');
  fs.writeFileSync(path.join(dir, 'assets', 'app-123.js'), 'console.log(1)');
  const first = buildSw({ distDir: dir });
  const sw = fs.readFileSync(path.join(dir, 'sw.js'), 'utf8');
  assert.match(sw, new RegExp(`const VERSION = '${first.version}'`));
  assert.ok(sw.includes('"assets/app-123.js"') && sw.includes('"index.html"'));
  assert.ok(!sw.includes('"404.html"') && !sw.includes('__VERSION__') && !sw.includes('__PRECACHE__'));
  assert.deepEqual(listFiles(dir), ['404.html', 'assets/app-123.js', 'index.html', 'sw.js']);
  fs.writeFileSync(path.join(dir, 'assets', 'app-123.js'), 'console.log(2)');
  assert.notEqual(buildSw({ distDir: dir }).version, first.version, 'a changed file means a new cache');
});

test('the worker never touches the API, other sites, or anything but plain page reads', () => {
  const sw = read('scripts/sw-template.js');
  assert.match(sw, /req\.method !== 'GET'\) return/);
  assert.match(sw, /url\.origin !== self\.location\.origin/);
  assert.ok(!/\/api\//.test(sw.replace(/\/\/.*$/gm, '')), 'no API addresses in the worker code');
});
