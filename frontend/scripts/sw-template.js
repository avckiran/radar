// RADAR service worker. It keeps the app's own files (screens, fonts, icons) so RADAR opens with no connection.
// It never touches the API: your data is only ever kept by the app itself, and is wiped when you sign out.
// It also shows the daily notifications the server sends (see the push handlers at the bottom).
// The two placeholders below are filled in by scripts/build-sw.mjs at build time.
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = `radar-shell-${VERSION}`;
const BASE = new URL(self.registration.scope).pathname; // "/" locally, "/radar/" on GitHub Pages
const INDEX = `${BASE}index.html`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((file) => `${BASE}${file}`)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('radar-shell-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Only our own files. The API lives on another address and is never cached here.
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  if (url.pathname === `${BASE}sw.js`) return;

  if (req.mode === 'navigate') {
    // Newest screens when there is a connection, the saved copy when there is not
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(INDEX, copy));
          }
          return res;
        })
        .catch(() => caches.match(INDEX).then((hit) => hit || Response.error()))
    );
    return;
  }

  // Files with a fingerprint in their name never change, so the saved copy is always right
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});

// Notifications from the server (web push). Safari takes the permission away from any site that receives a push and
// does not show something, so this always shows a notification, even when the message cannot be read.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'RADAR';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === 'string' ? data.body : '',
      tag: typeof data.tag === 'string' ? data.tag : undefined,
      icon: `${BASE}icons/icon-192.png`,
    })
  );
});

// Tapping a notification opens RADAR (Home), reusing a window that is already open
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const home = new URL(BASE, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(home));
      return open && 'focus' in open ? open.focus() : self.clients.openWindow(home);
    })
  );
});
