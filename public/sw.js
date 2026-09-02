/* public/sw.js
 *
 * Minimal offline Service Worker for Sell Product app shell.
 *
 * WHAT IS CACHED:
 *   - index.html (SPA shell)
 *   - JS / CSS bundles (same-origin, hashed filenames)
 *   - Logo SVG (same-origin)
 *   - /royal-golf/ base path root
 *
 * WHAT IS NEVER CACHED:
 *   - Supabase API responses (*.supabase.co or any REST/RPC calls)
 *   - Product images
 *   - Admin dynamic data
 *   - Product/inventory server data (handled by IndexedDB cache)
 *
 * STRATEGY:
 *   - Navigation requests (SPA): network-first, fallback to cached index.html
 *   - Static assets (same-origin JS/CSS/images): cache-first
 *   - Cross-origin requests: pass-through (never cached)
 *   - Supabase API: pass-through (never cached)
 *
 * CACHE VERSIONING:
 *   - Bump CACHE version on each deployment
 *   - Old caches are cleaned up on activate
 */

const CACHE_VERSION = 'v4'; // <-- bump this on each production release
const CACHE_NAME = `royal-shop-shell-${CACHE_VERSION}`;

const BASE = (() => {
  try {
    const scope = self.registration ? self.registration.scope : self.location.href;
    return new URL(scope).pathname.replace(/\/+$/, '/') || '/';
  } catch {
    return '/';
  }
})();

// Only pre-cache the minimal shell. Assets are cached on-demand.
const PRECACHE_URLS = [
  BASE,
  BASE + 'index.html',
];

// Install: pre-cache the shell and skip waiting immediately.
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  );
});

// Activate: delete ALL caches that don't match the current CACHE_NAME,
// then claim all clients so the new SW takes effect immediately.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Fetch handler
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // NEVER cache cross-origin requests (Supabase API, external CDNs, images)
  if (url.origin !== self.location.origin) return;

  // NEVER cache API-like requests (rest/v1, rpc, supabase)
  const path = url.pathname;
  if (
    path.includes('/rest/v1/') ||
    path.includes('/rpc/') ||
    path.includes('supabase') ||
    path.includes('/functions/')
  ) {
    return;
  }

  // SPA navigations: network-first, fallback to cached index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          return res;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match(BASE + 'index.html')) || (await cache.match(BASE)) || new Response('Offline', { status: 503 });
        }
      })()
    );
    return;
  }

  // Only cache same-origin static assets (JS, CSS, images within /royal-golf/)
  // We use cache-first strategy for assets that are likely hashed filenames.
  const pathname = url.pathname;
  const isStaticAsset =
    pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.webp') ||
    pathname.endsWith('.woff2') ||
    pathname.endsWith('.woff') ||
    pathname.endsWith('.ico');

  if (!isStaticAsset) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;

      try {
        const res = await fetch(req);
        if (res && res.status === 200 && res.type === 'basic') {
          // Cache successful same-origin static responses
          cache.put(req, res.clone());
        }
        return res;
      } catch {
        return cached || new Response('', { status: 404 });
      }
    })()
  );
});