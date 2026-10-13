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

// Fehlende Dateien nachladen. Der Cache kann auch später lückenhaft werden,
// z. B. wenn der Browser Speicher freiräumt oder jemand die Seitendaten löscht.
async function cacheFuellen() {
  const c = await caches.open(CACHE);
  const vorhanden = new Set((await c.keys()).map((r) => new URL(r.url).pathname));
  const fehlen = DATEIEN.filter((d) => !vorhanden.has(new URL(d, self.registration.scope).pathname));
  if (!fehlen.length) return { fehlen: 0 };
  await c.addAll(fehlen.map((u) => new Request(u, { cache: 'reload' })));
  return { fehlen: fehlen.length };
}

self.addEventListener('install', (e) => {
  e.waitUntil(cacheFuellen());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n.startsWith(PREFIX) && n !== CACHE).map((n) => caches.delete(n))))
      .then(cacheFuellen)
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
  if (e.data === 'cache-pruefen') e.waitUntil(cacheFuellen());
  if (e.data === 'status' && e.ports[0]) {
    e.waitUntil(
      cacheFuellen()
        .then(() => caches.open(CACHE))
        .then((c) => c.keys())
        .then((ks) => e.ports[0].postMessage({ version: self.APP_VERSION, cache: CACHE, dateien: ks.length }))
        .catch((err) => e.ports[0].postMessage({ version: self.APP_VERSION, cache: CACHE, fehler: String(err) })),
    );
  }
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const treffer = await c.match(req, { ignoreSearch: true });
    if (treffer) return treffer;
    try {
      const antwort = await fetch(req);
      // Lücke im Cache gleich schließen, damit die Seite offline vollständig bleibt
      if (antwort.ok && antwort.type === 'basic') c.put(req, antwort.clone()).catch(() => {});
      return antwort;
    } catch (fehler) {
      if (req.mode === 'navigate') {
        const seite = (await c.match('./index.html')) || (await c.match('./'));
        if (seite) return seite;
      }
      throw fehler;
    }
  })());
});
