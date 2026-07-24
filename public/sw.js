// MERKEN Service Worker
// Responsibilities: (1) Web Push notifications, (2) offline support via runtime caching.
//
// OFFLINE STRATEGY — why this is safe.
// A previous attempt at offline support used a cache-first app shell and broke the
// installed standalone PWA: because the service worker controls the PWA from launch,
// a cached shell HTML that referenced hashed JS chunks missing from the cache left
// the PWA stranded on its loading screen. To avoid ever repeating that, documents
// here are served NETWORK-FIRST:
//   - Navigations (documents)        -> network-first. Online = always the fresh
//     shell straight from the network (byte-for-byte identical to today's no-cache
//     behavior, so the chunk-mismatch stranding cannot recur). Offline = the last
//     document cached for that route, else the offline fallback page.
//   - Immutable build assets
//     (/_next/static/**)             -> cache-first. Their URLs are content-hashed,
//     so entries never go stale and old/new builds never collide.
//   - Other static assets
//     (icons, manifest, images, fonts) -> stale-while-revalidate.
//   - RSC payloads & other GETs      -> network-first with cache fallback.
//   - API / auth / cross-origin / non-GET -> never touched (always network).
// Net effect: caching only ADDS an offline fallback on top of today's online
// behavior; it never changes what an online launch loads.
//
// The activate handler also deletes every legacy `scanvocab-` cache so installs
// poisoned by the previous caching worker recover automatically on next launch.

const SW_VERSION = 'v1';
const CACHE_PREFIX = 'merken-';
const STATIC_CACHE = `${CACHE_PREFIX}static-${SW_VERSION}`; // immutable hashed build assets
const ASSET_CACHE = `${CACHE_PREFIX}assets-${SW_VERSION}`; // icons, manifest, images (SWR)
const PAGE_CACHE = `${CACHE_PREFIX}pages-${SW_VERSION}`; // navigations / RSC / misc GET
const CURRENT_CACHES = [STATIC_CACHE, ASSET_CACHE, PAGE_CACHE];
const LEGACY_CACHE_PREFIX = 'scanvocab-'; // poisoned caches from a prior worker
const OFFLINE_URL = '/offline.html';
const DEFAULT_NOTIFICATION_URL = '/';

// --- Lifecycle -------------------------------------------------------------

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(PAGE_CACHE);
      await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
    } catch {
      // Precaching the fallback is best-effort; never block activation on it.
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames.map((name) => {
        const isLegacy = name.startsWith(LEGACY_CACHE_PREFIX);
        const isStaleOwn = name.startsWith(CACHE_PREFIX) && !CURRENT_CACHES.includes(name);
        return isLegacy || isStaleOwn ? caches.delete(name) : undefined;
      })
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});

// --- Fetch / caching -------------------------------------------------------

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET; let the browser deal with POST/PUT/etc. directly.
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Cross-origin (AI APIs, Supabase, Stripe, analytics): never intercept.
  if (url.origin !== self.location.origin) return;

  // Dynamic / server endpoints must always hit the network.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/monitoring')
  ) {
    return;
  }

  // Immutable, content-hashed build output: cache-first.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Full-page navigations: network-first with an offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request));
    return;
  }

  // Icons / manifest / images / fonts: stale-while-revalidate.
  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
    return;
  }

  // RSC payloads and any other same-origin GET: network-first, cache fallback.
  event.respondWith(networkFirst(request, PAGE_CACHE));
});

function isStaticAsset(url) {
  return (
    url.pathname === '/manifest.json' ||
    /\.(?:png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot)$/i.test(url.pathname)
  );
}

// Only cache clean, complete, basic (same-origin) 200 responses. This excludes
// partial (206), redirected, and opaque responses that must not be replayed.
function isCacheable(response) {
  return Boolean(
    response &&
    response.status === 200 &&
    response.type !== 'opaque' &&
    !response.headers.has('Content-Range')
  );
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (isCacheable(response)) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return cached || Response.error();
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (isCacheable(response)) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (isCacheable(response)) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);
  return cached || (await network) || Response.error();
}

async function navigationHandler(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (isCacheable(response)) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cachedExact = await cache.match(request);
    if (cachedExact) return cachedExact;
    const cachedPath = await cache.match(new URL(request.url).pathname);
    if (cachedPath) return cachedPath;
    const offline = await cache.match(OFFLINE_URL);
    if (offline) return offline;
    throw error;
  }
}

// --- Web Push --------------------------------------------------------------

self.addEventListener('push', (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: 'MERKEN',
      body: event.data ? event.data.text() : '',
    };
  }

  const title = payload.title || 'MERKEN';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/icon-192.png',
    tag: payload.tag,
    data: {
      url: DEFAULT_NOTIFICATION_URL,
      ...(payload.data || {}),
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const requestedUrl = new URL(
    event.notification.data?.url || DEFAULT_NOTIFICATION_URL,
    self.location.origin
  );
  const targetUrl = requestedUrl.origin === self.location.origin
    ? requestedUrl.href
    : new URL(DEFAULT_NOTIFICATION_URL, self.location.origin).href;

  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    for (const client of clientsList) {
      if (client.url === targetUrl && 'focus' in client) {
        return client.focus();
      }
    }

    if (self.clients.openWindow) {
      return self.clients.openWindow(targetUrl);
    }
  })());
});
