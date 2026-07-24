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
//   - Google Fonts (Material Symbols icon font, text fonts) -> cache-first, even
//     though cross-origin, so icons don't render as raw ligature text offline.
//   - Public shared-wordbook reads (/api/shared-projects/share/**) -> network-first,
//     so a wordbook the user merely viewed (never imported) still opens offline.
//   - RSC payloads & other GETs      -> network-first with cache fallback.
//   - Other API / auth / cross-origin / non-GET -> never touched (always network).
// Net effect: caching only ADDS an offline fallback on top of today's online
// behavior; it never changes what an online launch loads.
//
// Caching is DISABLED on localhost/dev (see CACHING_ENABLED): Next.js dev chunks
// live at stable URLs whose bytes change every rebuild, so caching them would serve
// stale JS and break `npm run dev`. Production /_next/static/ is content-hashed and
// safe. Web Push still works in dev — only the fetch/caching path is gated.
//
// The activate handler deletes every legacy `scanvocab-` cache so installs poisoned
// by the previous caching worker recover automatically on next launch.

const SW_VERSION = 'v1';
const CACHE_PREFIX = 'merken-';
const STATIC_CACHE = `${CACHE_PREFIX}static-${SW_VERSION}`; // immutable hashed build assets
const ASSET_CACHE = `${CACHE_PREFIX}assets-${SW_VERSION}`; // icons, manifest, images (SWR)
const PAGE_CACHE = `${CACHE_PREFIX}pages-${SW_VERSION}`; // navigations / RSC / misc GET
const FONT_CACHE = `${CACHE_PREFIX}fonts-${SW_VERSION}`; // Google Fonts CSS + font files (icons)
const SHARED_CACHE = `${CACHE_PREFIX}shared-${SW_VERSION}`; // viewed shared-wordbook API responses
const CURRENT_CACHES = [STATIC_CACHE, ASSET_CACHE, PAGE_CACHE, FONT_CACHE, SHARED_CACHE];
const LEGACY_CACHE_PREFIX = 'scanvocab-'; // poisoned caches from a prior worker
const OFFLINE_URL = '/offline.html';
const DEFAULT_NOTIFICATION_URL = '/';

// Cross-origin Google Fonts hosts that serve the Material Symbols icon font and the
// text fonts. Handled explicitly (before the cross-origin bypass) so icons keep
// rendering offline instead of falling back to raw ligature text like "wifi_off".
const GOOGLE_FONTS_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

// Public shared-wordbook read endpoints. Caching their GET responses lets a wordbook
// the user merely *viewed* (never imported/saved) still open offline.
const SHARED_WORDBOOK_API_PREFIX = '/api/shared-projects/share/';

// Runtime caching is enabled everywhere EXCEPT localhost/dev. Next.js dev serves its
// chunks at stable URLs whose bytes change on every rebuild, so cache-first would
// pin stale JS and break `npm run dev`; production /_next/static/ is content-hashed
// and safe. Only the fetch/caching path is gated — Web Push registration is not.
const CACHING_ENABLED =
  self.location.hostname !== 'localhost' &&
  self.location.hostname !== '127.0.0.1' &&
  self.location.hostname !== '[::1]' &&
  !self.location.hostname.endsWith('.local');

// --- Lifecycle -------------------------------------------------------------

async function precacheOffline() {
  const cache = await caches.open(PAGE_CACHE);
  await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    if (!CACHING_ENABLED) return;
    try {
      await precacheOffline();
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
        // Off localhost: drop only stale (non-current) own caches. On localhost:
        // drop ALL own caches so a dev machine poisoned by an earlier build with
        // caching enabled recovers immediately.
        const isStaleOwn =
          name.startsWith(CACHE_PREFIX) && (!CACHING_ENABLED || !CURRENT_CACHES.includes(name));
        return isLegacy || isStaleOwn ? caches.delete(name) : undefined;
      })
    );
    // Re-assert the offline fallback so a single failed install precache does not
    // leave the branded offline page missing for the whole SW version.
    if (CACHING_ENABLED) {
      try {
        await precacheOffline();
      } catch {
        // best-effort
      }
    }
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

  // On localhost/dev, never cache (see CACHING_ENABLED) — pass through to network.
  if (!CACHING_ENABLED) return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Google Fonts (Material Symbols icon font + text fonts) are cross-origin but must
  // survive offline, or icons render as raw ligature text. Cache-first, allowing the
  // opaque stylesheet response. Handled before the generic cross-origin bypass.
  if (GOOGLE_FONTS_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirstAllowingOpaque(request, FONT_CACHE));
    return;
  }

  // Cross-origin (AI APIs, Supabase, Stripe, analytics): never intercept.
  if (url.origin !== self.location.origin) return;

  // Public shared-wordbook reads: cache so a viewed-but-unsaved shared wordbook opens
  // offline. Network-first keeps it fresh online. Handled before the /api/ bypass.
  if (url.pathname.startsWith(SHARED_WORDBOOK_API_PREFIX)) {
    event.respondWith(networkFirst(request, SHARED_CACHE));
    return;
  }

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

// Cache-first variant for Google Fonts. The stylesheet from fonts.googleapis.com is
// requested no-cors (an opaque, status-0 response); the font files from
// fonts.gstatic.com come back CORS (status 200). Both are effectively immutable per
// URL, so cache-first is correct and lets icons render offline.
async function cacheFirstAllowingOpaque(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && (response.status === 200 || response.type === 'opaque')) {
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
