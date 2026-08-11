/* ============================================================================
   Beast — Service Worker
   Purely additive PWA layer: app-shell offline caching + a safe, user-driven
   update flow. This file implements the counterpart to the registration code
   already in index.html (search for 'serviceWorker' there), which expects:
     - a new SW to install and sit WAITING (not auto-activate) while the old
       one still controls the page, so it can show an "update available" toast
     - a 'SKIP_WAITING' postMessage to trigger activation on demand
     - the new SW claiming clients on activate, which fires 'controllerchange'
       in the page and triggers a one-time reload

   All paths are relative to the SW's own scope (via `new URL(path, self.
   registration.scope)`), so this works whether the app is hosted at a
   domain root or under a GitHub Pages project path like /beast/.
   ========================================================================== */

const CACHE_VERSION = 'beast-v1';
const STATIC_CACHE = `beast-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `beast-runtime-${CACHE_VERSION}`;
const FONT_CACHE = 'beast-fonts-v1'; // not tied to app version — fonts should
                                      // survive app updates, not re-download every deploy

// Everything that makes up the installable app shell. This is intentionally
// a short, explicit list — we do not blindly cache arbitrary URLs.
const SHELL_PATHS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];

const scopeUrl = (path) => new URL(path, self.registration.scope).toString();

/* ---- Install ---------------------------------------------------------------
   Precache the shell. Deliberately does NOT call skipWaiting() here — a
   newly installed worker should sit in the 'waiting' state while an older
   one still controls the page, so the page can offer the person a clean
   "update available" prompt instead of switching versions under them
   mid-session. Activation only happens via the SKIP_WAITING message below. */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    // addAll fails the whole install if any single request 404s — for a
    // single-file app the shell list is small and known-good, but guard
    // per-file anyway so one bad icon path can never block offline support.
    await Promise.all(SHELL_PATHS.map(async (path) => {
      try {
        const res = await fetch(new Request(scopeUrl(path), { cache: 'reload' }));
        if (res && res.ok) await cache.put(scopeUrl(path), res);
      } catch (_) { /* offline first install, or a path 404s — non-fatal */ }
    }));
  })());
});

/* ---- Activate ----------------------------------------------------------
   Clean up any cache from a previous version, then take control of open
   pages immediately (clientsClaim) so the update — once the person accepts
   it — applies without needing a second navigation. */
self.addEventListener('activate', (event) => {
  const keep = new Set([STATIC_CACHE, RUNTIME_CACHE, FONT_CACHE]);
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith('beast-') && !keep.has(n)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

/* ---- Update trigger ------------------------------------------------------
   index.html calls reg.waiting.postMessage('SKIP_WAITING') from
   window.__beastApplyUpdate() when the person accepts the update toast. */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

/* ---- Fetch routing -------------------------------------------------------
   Four lanes:
   1. Navigations (loading index.html itself) — network-first, so people
      online get the latest build, falling back to the cached shell offline.
   2. Google Fonts (stylesheet + woff2 files) — stale-while-revalidate, so
      previously loaded fonts keep working offline while staying fresh.
   3. Firebase / any other cross-origin API traffic — left completely alone.
      Cloud sync is optional and already fails gracefully in-app; a service
      worker has no business caching auth tokens or Firestore documents.
   4. Same-origin static assets (the shell files, or anything added later
      under this scope) — cache-first with a network fallback that
      opportunistically fills the runtime cache. */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // never intercept writes

  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstShell(request));
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
    return;
  }

  if (url.origin !== self.location.origin) {
    return; // Firebase, gstatic firebasejs SDK, or any other third party: network as normal, untouched
  }

  event.respondWith(cacheFirstStatic(request));
});

async function networkFirstShell(request) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(scopeUrl('./index.html'), fresh.clone());
    return fresh;
  } catch (_) {
    const cached = await cache.match(scopeUrl('./index.html')) || await cache.match(scopeUrl('./'));
    if (cached) return cached;
    return new Response('Beast is offline and this page has not been cached yet. Reconnect once to enable offline access.', {
      status: 503, headers: { 'Content-Type': 'text/plain' }
    });
  }
}

async function cacheFirstStatic(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      const runtime = await caches.open(RUNTIME_CACHE);
      runtime.put(request, fresh.clone());
    }
    return fresh;
  } catch (_) {
    const runtimeHit = await (await caches.open(RUNTIME_CACHE)).match(request);
    if (runtimeHit) return runtimeHit;
    throw new Error('offline and not cached: ' + request.url);
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkFetch = fetch(request).then((res) => {
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  return cached || (await networkFetch) || new Response('', { status: 504 });
}
