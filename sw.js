// Offline-Cache. Neue Version = APP_VERSION in version.js hochzählen.
importScripts('version.js');

const PREFIX = 'wandelbar-kasse-';
const CACHE = PREFIX + self.APP_VERSION;
const DATEIEN = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './kern.js',
  './version.js',
  './vendor/qrcode.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(DATEIEN.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n.startsWith(PREFIX) && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE)
      .then((c) => c.match(req, { ignoreSearch: true }))
      .then((treffer) => treffer || fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))),
  );
});
