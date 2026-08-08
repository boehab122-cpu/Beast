// sw.js — Beast app-shell cache.
//
// Contract this file has to satisfy (see index.html's registration block):
//   - index.html calls navigator.serviceWorker.register('sw.js') and listens
//     for `updatefound` -> a new worker reaching `installed` while an old one
//     already controls the page. That only happens if THIS worker does NOT
//     call self.skipWaiting() during install — it has to sit in `waiting`
//     until told otherwise.
//   - index.html's window.__beastApplyUpdate() posts the plain string
//     'SKIP_WAITING' to the waiting worker. This file must listen for that
//     exact message and call self.skipWaiting() in response, or the "new
//     version available" toast has no way to actually apply the update.
//   - Once skipWaiting() runs and this worker activates, index.html's
//     `controllerchange` listener reloads the page once — so activate()
//     claiming clients is what makes that reload pick up the new shell.

const CACHE_VERSION = 'v1';
const CACHE_NAME = `beast-shell-${CACHE_VERSION}`;

// The offline app shell: the document itself, the manifest + icons it
// references, and every font file the @font-face rules point at. Firebase's
// gstatic imports are deliberately NOT here — that's a live, optional CDN
// dependency (see prompt notes), not part of the installable shell.
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './fonts/public-sans-400.woff2',
  './fonts/public-sans-500.woff2',
  './fonts/public-sans-600.woff2',
  './fonts/public-sans-700.woff2',
  './fonts/fraunces-500.woff2',
  './fonts/fraunces-600.woff2',
  './fonts/fraunces-700.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // cache.add() per-asset (not cache.addAll) so one missing/renamed file
      // can't abort precaching of the rest of the shell — a stale icon
      // shouldn't cost you offline text and fonts.
      Promise.all(
        SHELL_ASSETS.map((asset) =>
          cache.add(asset).catch((err) => {
            console.warn('[sw] failed to precache', asset, err);
          })
        )
      )
    )
    // Deliberately no self.skipWaiting() here — see contract note above.
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('beast-shell-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);

  // Cross-origin requests (Firebase's gstatic.com imports, etc.) are a live
  // network dependency with nothing to do with the app shell — leave them
  // completely alone and let the browser handle them normally.
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          // Refresh the cache in the background so the shell stays current
          // without ever blocking on the network.
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          // Offline and not in cache. For a navigation, fall back to the
          // shell document rather than surfacing a browser error page.
          if (cached) return cached;
          if (request.mode === 'navigate') return caches.match('./index.html');
          return undefined;
        });

      // Cache-first: serve instantly from cache when we have it.
      return cached || networkFetch;
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
