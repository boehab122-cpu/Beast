// Beast service worker — app shell cache + update flow.
//
// Cache name MUST stay prefixed with "beast-static-" — window.beastPWADiagnostics()
// in index.html looks for that exact prefix. Bump the version suffix on every
// deploy so old caches get cleared and returning users pick up the new build.
const CACHE_NAME = 'beast-static-v1';

// Single-file app (all CSS/JS inline in index.html), so the shell is tiny —
// just the document, the manifest, and the two icons it references.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('beast-static-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// index.html already calls reg.waiting.postMessage('SKIP_WAITING') from its
// update-toast button — this is the other half of that handshake.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Navigations: network-first so people get the latest build while online,
  // falling back to the cached shell the moment they go offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Everything else (icons, fonts, manifest): cache-first, then network,
  // caching new successful responses as they arrive.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
