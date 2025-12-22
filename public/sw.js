/* public/sw.js
 * Minimal offline cache: caches same-origin GET responses after first load.
 * - Works offline once the app has been opened at least once online.
 */
const CACHE = 'royal-inventory-cache-v3';
const BASE = (() => {
  try {
    const scope = self.registration ? self.registration.scope : self.location.href;
    return new URL(scope).pathname.replace(/\/+$/, '/') || '/';
  } catch {
    return '/';
  }
})();

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll([BASE, BASE + 'index.html']);
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k))));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Only cache same-origin to avoid breaking external calls
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Network-first for SPA navigations to avoid stale index.html
    if (req.mode === 'navigate') {
      try {
        const res = await fetch(req);
        if (res && res.status === 200 && res.type === 'basic') {
          cache.put(BASE + 'index.html', res.clone());
        }
        return res;
      } catch {
        return (await cache.match(BASE + 'index.html')) || (await cache.match(BASE));
      }
    }

    const cached = await cache.match(req);
    if (cached) return cached;

    const res = await fetch(req);
    // Cache successful basic responses
    if (res && res.status === 200 && res.type === 'basic') {
      cache.put(req, res.clone());
    }
    return res;
  })());
});
