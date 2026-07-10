// MERKEN Service Worker
// Handles PWA offline support + Web Push notifications.
//
// Caching strategy (deliberately conservative to guarantee the app never gets
// stranded on a stale/broken shell):
//   - Navigations (HTML)      -> network-ONLY. On success the browser always gets a
//                                fresh document (identical to having no SW, so the
//                                online experience can never break). Only when the
//                                network fails do we serve the dedicated /offline page.
//                                We never serve a cached app shell, because Next.js
//                                pre-renders "/" as a loading screen that only becomes
//                                the app after its JS chunks hydrate — serving a cached
//                                shell whose chunk hashes changed on a later deploy would
//                                strand the page on that loading screen.
//   - Immutable static assets -> cache-first. Only /_next/static/** and /_next/image are
//                                content-hashed (safe to cache forever) plus a tiny
//                                precache list (icons, manifest, offline page).
//   - API / auth / RSC        -> never handled here (network-only; data goes through
//                                IndexedDB + the sync queue).
//   - Cross-origin requests   -> left to the browser (Supabase, Google Fonts, ads, AI...).
//
// Bump SW_VERSION whenever the caching logic changes so old caches are purged on activate.

const SW_VERSION = 'v2';
const CACHE_PREFIX = 'scanvocab-';
const PRECACHE = `${CACHE_PREFIX}precache-${SW_VERSION}`;
const RUNTIME = `${CACHE_PREFIX}runtime-${SW_VERSION}`;
const ACTIVE_CACHES = new Set([PRECACHE, RUNTIME]);

const OFFLINE_URL = '/offline';
const DEFAULT_NOTIFICATION_URL = '/';

// Small, stable shell assets fetched at install so the offline fallback is always
// available. The /offline page is statically pre-rendered, so its HTML shows the
// offline message even if its JS chunks are not cached.
const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    await Promise.all(
      PRECACHE_URLS.map(async (url) => {
        try {
          const response = await fetch(new Request(url, { cache: 'reload' }));
          if (response && response.ok) {
            await cache.put(url, response.clone());
          }
        } catch {
          // Ignore individual precache failures — offline support degrades
          // gracefully rather than blocking the whole install.
        }
      })
    );
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Purge every cache that isn't part of the current version. Bumping
    // SW_VERSION therefore clears any stale app-shell cached by older workers.
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith(CACHE_PREFIX) && !ACTIVE_CACHES.has(name))
        .map((name) => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});

// ---------------------------------------------------------------------------
// Fetch / caching
// ---------------------------------------------------------------------------

// Only content-hashed Next.js output is safe to cache forever. Everything else
// (HTML shells, dynamic assets) is left to the network so we never serve stale.
function isImmutableAsset(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/_next/image');
}

function isPrecachedAsset(url) {
  return PRECACHE_URLS.includes(url.pathname);
}

// Network-only navigation with an offline-page fallback. Never returns a cached
// app shell, so a chunk-hash mismatch across deploys can never strand the app.
async function navigateOrOffline(request) {
  try {
    return await fetch(request);
  } catch {
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok && response.type === 'basic') {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const fallback = await cache.match(request);
    if (fallback) return fallback;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET; let the browser deal with everything else (POST, etc.).
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Only same-origin. Cross-origin (Supabase, Google Fonts, AI, ads) goes to network.
  if (url.origin !== self.location.origin) return;

  // Never intercept API / auth / server actions — those must stay network-only.
  if (url.pathname.startsWith('/api/')) return;

  // Skip Next.js RSC / data payloads so we never serve stale server components.
  if (request.headers.get('RSC') === '1' || url.searchParams.has('_rsc')) return;

  // Skip range requests (media streaming) — the browser handles these better.
  if (request.headers.has('range')) return;

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(navigateOrOffline(request));
    return;
  }

  if (isImmutableAsset(url)) {
    event.respondWith(cacheFirst(request, RUNTIME));
    return;
  }

  if (isPrecachedAsset(url)) {
    event.respondWith(cacheFirst(request, PRECACHE));
  }
});

// ---------------------------------------------------------------------------
// Web Push
// ---------------------------------------------------------------------------

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
