/* Beast — service worker
 * Cache-first app shell for offline installability. Bump CACHE_NAME on every
 * deploy that changes index.html, the manifest, icons, or fonts — the old
 * cache is deleted on activate so updates never get stuck.
 *
 * Scope: same-origin app-shell assets ONLY. Any cross-origin request
 * (Firebase, Firestore, gstatic, Google Fonts, etc.) is left completely
 * untouched — this worker never calls respondWith() for those, so Cloud
 * Sync keeps working exactly as it does today, online or off.
 */
const CACHE_NAME = 'beast-v2';

// Precached on install. Paths are relative to this file's own scope, which
// works whether the app is deployed at a domain root or in a subfolder
// (e.g. username.github.io/beast/) — do not add a leading slash to any of
// these.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './fonts/public-sans-400.woff2',
  './fonts/public-sans-500.woff2',
  './fonts/public-sans-600.woff2',
  './fonts/public-sans-700.woff2',
  './fonts/fraunces-500.woff2',
  './fonts/fraunces-600.woff2',
  './fonts/fraunces-700.woff2'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Add each shell file independently rather than cache.addAll(), so a
      // single missing/renamed asset (e.g. a font file not added yet)
      // doesn't abort precaching of everything else.
      return Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[sw] precache skipped:', url, err && err.message ? err.message : err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only ever handle same-origin GET requests. Everything else — Firebase
  // Auth, Firestore, any other cross-origin API — passes straight through
  // to the network, untouched, exactly as if this service worker didn't
  // exist.
  if (req.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // Only cache well-formed, successful, same-origin (basic) responses.
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => {
        // Offline and not cached — for navigations, fall back to the
        // cached shell so the app still opens instead of showing a
        // browser error page.
        if (req.mode === 'navigate') {
          return caches.match('./index.html');
        }
        throw new Error('Network unavailable and no cache entry for ' + req.url);
      });
    })
  );
});

// Lets the page trigger an immediate takeover of a waiting new version
// (see the postMessage('SKIP_WAITING') call added next to the page's
// service-worker registration in index.html).
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
