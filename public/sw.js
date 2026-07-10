// MERKEN Service Worker
// Handles PWA offline support (caching) + Web Push notifications.
//
// Caching strategy:
//   - Navigations (HTML)      -> network-first, fall back to cached shell, then /offline
//   - Static assets (_next,   -> stale-while-revalidate (content-hashed, safe to cache)
//     scripts, styles, fonts,
//     images, manifest)
//   - API / auth requests     -> never handled here (network-only; data goes through
//                                IndexedDB + the sync queue)
//   - Cross-origin requests   -> left to the browser (Supabase, Google Fonts, ads, AI, etc.)
//
// Bump SW_VERSION whenever the caching logic changes so old caches are purged on activate.

const SW_VERSION = 'v1';
const CACHE_PREFIX = 'scanvocab-';
const PRECACHE = `${CACHE_PREFIX}precache-${SW_VERSION}`;
const RUNTIME = `${CACHE_PREFIX}runtime-${SW_VERSION}`;
const ACTIVE_CACHES = new Set([PRECACHE, RUNTIME]);

const OFFLINE_URL = '/offline';
const DEFAULT_NOTIFICATION_URL = '/';

// Minimal shell assets that must be available offline even before the user
// has visited the corresponding pages. Kept small and stable so install is fast
// and resilient (each asset is fetched independently so one 404 can't break install).
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

function isStaticAsset(url, request) {
  if (url.pathname.startsWith('/_next/static/')) return true;
  if (url.pathname.startsWith('/_next/image')) return true;
  if (url.pathname === '/manifest.json') return true;

  const destination = request.destination;
  if (
    destination === 'style' ||
    destination === 'script' ||
    destination === 'font' ||
    destination === 'image'
  ) {
    return true;
  }

  return /\.(?:js|css|woff2?|ttf|otf|png|jpe?g|gif|svg|webp|avif|ico)$/i.test(url.pathname);
}

async function networkFirstNavigation(request) {
  const runtime = await caches.open(RUNTIME);

  try {
    const response = await fetch(request);
    // Cache successful, non-opaque navigations so the shell loads offline next time.
    if (response && response.ok && response.type === 'basic') {
      runtime.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    const cached = await runtime.match(request);
    if (cached) return cached;

    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;

    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function staleWhileRevalidate(request) {
  const runtime = await caches.open(RUNTIME);
  const cached = await runtime.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response && response.ok && response.type === 'basic') {
        runtime.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => undefined);

  return cached || (await networkFetch) || Response.error();
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
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isStaticAsset(url, request)) {
    event.respondWith(staleWhileRevalidate(request));
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
