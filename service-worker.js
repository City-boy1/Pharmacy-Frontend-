const CACHE_NAME = 'pharmacy-app-shell-v3';
// Only the static shell — NOT api calls or data. Your app already has its own
// offline data layer (db.js / sync.js), this cache is just so the app itself
// (html/css/js/icons) can load instantly and even open with no connection.
const APP_SHELL = [
  '/pages/login.html',
  '/css/variables.css',
  '/css/layout.css',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  // NOTE: no self.skipWaiting() here on purpose — the new worker waits until
  // the user confirms via the update banner (see js/pwa-update.js).
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never cache API calls — always go to network so data stays live/accurate.
  if (request.url.includes('/api/')) return;

  // Only handle GET — POST/PUT/DELETE must always hit the network directly.
  if (request.method !== 'GET') return;

  // Page navigations (loading/reloading an .html page): network-first, so
  // edits/deploys show up immediately when online. Falls back to the cached
  // copy only when offline — this is what keeps the app usable for weeks
  // with no connection, without ever serving stale pages while online.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Everything else (CSS/JS/icons): cache-first, since these only change on
  // deploy and CACHE_NAME is bumped then.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (response.ok && request.url.startsWith(self.location.origin)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          return new Response('Offline and this page has not been cached yet.', {
            status: 503,
            statusText: 'Offline',
            headers: { 'Content-Type': 'text/plain' },
          });
        });
    })
  );
});