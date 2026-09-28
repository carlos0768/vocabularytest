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
//   - RSC payloads (?_rsc= / RSC: 1) -> never touched (always network). See the
//     fetch handler for why caching them only cost navigation time.
//   - Other same-origin GETs         -> network-first with cache fallback.
//   - Media element loads (audio/video, byte-range) -> never touched. WebKit is
//     unreliable about playing media served through a worker.
//   - Other API / auth / cross-origin / non-GET -> never touched (always network).
// Net effect: caching only ADDS an offline fallback on top of today's online
// behavior; it never changes what an online launch loads.
//
// OFFLINE APP SHELL (see public/sw-offline-shell.js for the full rationale).
// Offline, Next.js turns every tap into a full navigation, and the worker used to
// have a document for almost none of them, so the app fell back to /offline.html.
// While online (on request from the page, at most every few hours) the worker now
// fetches one document per app route plus every build asset it references into
// SHELL_CACHE / STATIC_CACHE. Offline, a navigation is answered from that shell —
// dynamic routes get the requested id spliced in — so the real UI opens for every
// wordbook. The shell is fetched and completed as a unit, so a shell document is
// only ever served when all of its hashed chunks are cached: the stranding above
// cannot happen. Online navigations are untouched.
//
// Caching is DISABLED on localhost/dev (see CACHING_ENABLED): Next.js dev chunks
// live at stable URLs whose bytes change every rebuild, so caching them would serve
// stale JS and break `npm run dev`. Production /_next/static/ is content-hashed and
// safe. Web Push still works in dev — only the fetch/caching path is gated.
//
// The activate handler deletes every legacy `scanvocab-` cache so installs poisoned
// by the previous caching worker recover automatically on next launch.

// Offline app shell helpers. Guarded so that a failed import can only disable the
// shell — never the whole worker (Web Push, the existing offline fallback).
try {
  importScripts('/sw-offline-shell.js');
} catch {
  // handled by the null check below
}
const OfflineShell = self.MerkenOfflineShell || null;

const SW_VERSION = 'v1';
const CACHE_PREFIX = 'merken-';
const STATIC_CACHE = `${CACHE_PREFIX}static-${SW_VERSION}`; // immutable hashed build assets
const ASSET_CACHE = `${CACHE_PREFIX}assets-${SW_VERSION}`; // icons, manifest, images (SWR)
const PAGE_CACHE = `${CACHE_PREFIX}pages-${SW_VERSION}`; // navigations / misc GET
const FONT_CACHE = `${CACHE_PREFIX}fonts-${SW_VERSION}`; // Google Fonts CSS + font files (icons)
const SHARED_CACHE = `${CACHE_PREFIX}shared-${SW_VERSION}`; // viewed shared-wordbook API responses
const SHELL_CACHE = `${CACHE_PREFIX}shell-${SW_VERSION}`; // offline app shell documents
const CURRENT_CACHES = [STATIC_CACHE, ASSET_CACHE, PAGE_CACHE, FONT_CACHE, SHARED_CACHE, SHELL_CACHE];
// Bookkeeping for the offline shell (last refresh, prune generations). Stored as a
// JSON response in SHELL_CACHE under a path no real route can have.
const SHELL_META_URL = '/__merken-offline-shell-meta__';
const WARM_SHELL_MESSAGE = 'warm-offline-shell';
// Parallel downloads while filling the shell, so a refresh never saturates a
// phone connection.
const WARM_CONCURRENCY = 4;
const LEGACY_CACHE_PREFIX = 'scanvocab-'; // poisoned caches from a prior worker
const OFFLINE_URL = '/offline.html';
// Progressive enhancement for OFFLINE_URL: renders the requested wordbook straight
// from IndexedDB (see the header comment in public/offline-viewer.js). Precached with
// the fallback page so a wordbook the user never opened online still opens offline.
// It is a plain script with no build-hashed chunks, so it can never strand the PWA;
// if it is missing, offline.html degrades to its static notice.
const OFFLINE_VIEWER_URL = '/offline-viewer.js';
const PRECACHE_URLS = [OFFLINE_URL, OFFLINE_VIEWER_URL];
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
  await Promise.all(
    PRECACHE_URLS.map((url) => cache.add(new Request(url, { cache: 'reload' })))
  );
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
    return;
  }
  if (event.data && event.data.type === WARM_SHELL_MESSAGE) {
    if (!CACHING_ENABLED || !OfflineShell) return;
    event.waitUntil(warmOfflineShell({ force: event.data.force === true }));
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

  // Media elements load audio with byte-range requests, and WebKit is unreliable
  // about playing media served through a worker (a range request answered from a
  // worker can stall or fail silently). Let those go straight to the network: the
  // voice quiz falls back to synthetic speech whenever a clip will not play, and
  // that fallback is exactly what the natural-voice clips are meant to avoid.
  // The app also fetches the same clips itself (plain GET, no Range) to decode
  // via Web Audio — those are cached below as static assets.
  if (request.destination === 'audio' || request.destination === 'video' || request.headers.has('range')) {
    return;
  }

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

  // Next.js RSC payloads (client-side navigations and <Link> prefetches) go
  // straight to the network. Caching them bought nothing offline — Next varies
  // them on router-state headers so a cached entry is never matched again and
  // the router hard-navigates on failure anyway — while every page transition
  // paid a serialized caches.open() + clone() + cache.put() inside the worker
  // and PAGE_CACHE grew by one entry per navigation.
  if (url.searchParams.has('_rsc') || request.headers.get('RSC') === '1') {
    return;
  }

  // Any other same-origin GET: network-first, cache fallback.
  event.respondWith(networkFirst(request, PAGE_CACHE));
});

function isStaticAsset(url) {
  return (
    url.pathname === '/manifest.json' ||
    // mp3: the voice quiz's pre-generated narration. Cached like an icon so the
    // clips are already local on the second session (and offline), instead of
    // being re-fetched per question — that wait shows up as a silent pause
    // before each question.
    /\.(?:png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp3)$/i.test(url.pathname)
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
  // Build assets are content-hashed, so a query string (e.g. a deployment id)
  // never changes the bytes. Ignoring it lets the offline shell's prefetched
  // copies answer requests that carry one.
  const cached = await cache.match(request, { ignoreSearch: true });
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
    // Offline. Prefer the app shell: it is the real UI, it was fetched while
    // signed in, and all of its build assets are known to be cached.
    const shell = await offlineShellResponse(request);
    if (shell) return shell;
    const cachedExact = await cache.match(request);
    if (cachedExact) return cachedExact;
    const cachedPath = await cache.match(new URL(request.url).pathname);
    if (cachedPath) return cachedPath;
    const offline = await cache.match(OFFLINE_URL);
    if (offline) return offline;
    throw error;
  }
}

// --- Offline app shell -----------------------------------------------------

async function offlineShellResponse(request) {
  if (!OfflineShell) return null;
  try {
    const match = OfflineShell.matchShellRoute(new URL(request.url).pathname);
    if (!match) return null;
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(match.templatePath);
    if (!cached) return null;
    if (match.param === null) return cached;
    const html = OfflineShell.fillShellTemplate(await cached.text(), match.param);
    if (!html) return null;
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch {
    return null;
  }
}

async function readShellMeta() {
  try {
    const cache = await caches.open(SHELL_CACHE);
    const response = await cache.match(SHELL_META_URL);
    return response ? await response.json() : null;
  } catch {
    return null;
  }
}

async function writeShellMeta(meta) {
  const cache = await caches.open(SHELL_CACHE);
  await cache.put(
    SHELL_META_URL,
    new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } })
  );
}

function isHtmlDocument(response) {
  return Boolean(
    response &&
    response.status === 200 &&
    !response.redirected &&
    response.type === 'basic' &&
    (response.headers.get('Content-Type') || '').includes('text/html')
  );
}

// Run `worker` over `items` with at most WARM_CONCURRENCY in flight.
async function runLimited(items, worker) {
  let next = 0;
  const lanes = Array.from({ length: Math.min(WARM_CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
    }
  });
  await Promise.all(lanes);
}

// Download every /_next/static asset reachable from `texts` (and from the JS / CSS
// they pull in) that is not cached yet. Returns false if any download failed.
async function cacheStaticAssetsFrom(texts) {
  const staticCache = await caches.open(STATIC_CACHE);
  const seen = new Set();
  let queue = [];
  for (const text of texts) {
    for (const path of OfflineShell.extractStaticAssetPaths(text)) {
      if (!seen.has(path)) {
        seen.add(path);
        queue.push(path);
      }
    }
  }

  let complete = true;
  while (queue.length > 0) {
    const batch = queue;
    queue = [];
    await runLimited(batch, async (path) => {
      let response = await staticCache.match(path, { ignoreSearch: true });
      if (!response) {
        try {
          const fetched = await fetch(path, { credentials: 'same-origin' });
          if (!isCacheable(fetched)) {
            complete = false;
            return;
          }
          await staticCache.put(path, fetched.clone());
          response = fetched;
        } catch {
          complete = false;
          return;
        }
      }
      // JS chunks name the chunks they lazy-load. CSS is not crawled: its font
      // files are relative URLs covering 100+ Japanese unicode-range subsets, and
      // the few a page actually uses are cached at runtime by the fetch handler.
      if (path.endsWith('.js')) {
        const text = await response.text();
        for (const nested of OfflineShell.extractStaticAssetPaths(text)) {
          if (!seen.has(nested)) {
            seen.add(nested);
            queue.push(nested);
          }
        }
      }
    });
  }
  return complete;
}

// Every /_next/static path reachable from any document the worker can serve
// offline (shell + pages cached from real navigations).
async function collectReferencedStaticPaths() {
  const texts = [];
  for (const cacheName of [SHELL_CACHE, PAGE_CACHE]) {
    const cache = await caches.open(cacheName);
    for (const request of await cache.keys()) {
      const response = await cache.match(request);
      if (!response || !(response.headers.get('Content-Type') || '').includes('text/html')) continue;
      texts.push(await response.text());
    }
  }

  const staticCache = await caches.open(STATIC_CACHE);
  const referenced = new Set();
  let queue = [];
  for (const text of texts) {
    for (const path of OfflineShell.extractStaticAssetPaths(text)) {
      if (!referenced.has(path)) {
        referenced.add(path);
        queue.push(path);
      }
    }
  }
  while (queue.length > 0) {
    const path = queue.pop();
    const isJs = path.endsWith('.js');
    if (!isJs && !path.endsWith('.css')) continue;
    const response = await staticCache.match(path, { ignoreSearch: true });
    if (!response) continue;
    const text = await response.text();
    // JS names the chunks it lazy-loads; CSS names its fonts (relative URLs).
    const nestedPaths = isJs
      ? OfflineShell.extractStaticAssetPaths(text)
      : OfflineShell.extractCssMediaPaths(text);
    for (const nested of nestedPaths) {
      if (!referenced.has(nested)) {
        referenced.add(nested);
        queue.push(nested);
      }
    }
  }
  return referenced;
}

// Drop build assets no cached document has needed for two refreshes in a row.
// Without this, STATIC_CACHE would keep every chunk of every deploy forever.
async function pruneStaticCache(previouslyUnreferenced) {
  const staticCache = await caches.open(STATIC_CACHE);
  const referenced = await collectReferencedStaticPaths();
  const cachedPaths = (await staticCache.keys()).map((request) => new URL(request.url).pathname);
  const plan = OfflineShell.planStaticPrune(cachedPaths, Array.from(referenced), previouslyUnreferenced);
  const remove = new Set(plan.remove);
  await Promise.all(
    (await staticCache.keys())
      .filter((request) => remove.has(new URL(request.url).pathname))
      .map((request) => staticCache.delete(request))
  );
  return plan.pending;
}

// Probe route for isShellCurrent(): a static page, so fetching it costs no server
// render.
const SHELL_BUILD_PROBE_PATH = '/projects';

async function isShellCurrent(buildId) {
  const shellCache = await caches.open(SHELL_CACHE);
  for (const route of OfflineShell.OFFLINE_SHELL_ROUTES) {
    if (!(await shellCache.match(OfflineShell.shellTemplatePath(route)))) return false;
  }
  try {
    const response = await fetch(SHELL_BUILD_PROBE_PATH, { credentials: 'same-origin', cache: 'no-store' });
    if (!isHtmlDocument(response)) return false;
    return OfflineShell.readBuildId(await response.text()) === buildId;
  } catch {
    return false;
  }
}

let warmInFlight = null;

function warmOfflineShell({ force = false } = {}) {
  if (!warmInFlight) {
    warmInFlight = doWarmOfflineShell(force).finally(() => {
      warmInFlight = null;
    });
  }
  return warmInFlight;
}

async function doWarmOfflineShell(force) {
  const meta = await readShellMeta();
  const now = Date.now();
  if (!force && !OfflineShell.shouldWarmShell(meta, now)) return;

  try {
    // Nothing deployed since the last refresh? Then every cached shell document is
    // still current. Check with one static (CDN-served) route before re-rendering
    // the dynamic ones on the server.
    if (!force && meta && meta.buildId && (await isShellCurrent(meta.buildId))) {
      await writeShellMeta({ ...meta, warmedAt: now, failedAt: undefined });
      return;
    }

    // Fetch every shell document first and keep them in memory: nothing is
    // written to SHELL_CACHE until all of their assets are cached, so a half
    // finished refresh can never publish a document whose chunks are missing.
    const documents = [];
    await runLimited(OfflineShell.OFFLINE_SHELL_ROUTES, async (route) => {
      const templatePath = OfflineShell.shellTemplatePath(route);
      try {
        const response = await fetch(templatePath, {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        if (!isHtmlDocument(response)) return;
        documents.push({ templatePath, html: await response.text(), headers: response.headers });
      } catch {
        // skipped below: a missing route just keeps its previous shell
      }
    });

    if (documents.length === 0) throw new Error('no shell documents');

    const assetsComplete = await cacheStaticAssetsFrom(documents.map((doc) => doc.html));
    if (!assetsComplete) throw new Error('shell assets incomplete');

    const shellCache = await caches.open(SHELL_CACHE);
    await Promise.all(
      documents.map((doc) =>
        shellCache.put(
          doc.templatePath,
          new Response(doc.html, {
            status: 200,
            headers: { 'Content-Type': doc.headers.get('Content-Type') || 'text/html; charset=utf-8' },
          })
        )
      )
    );

    let pending = meta && Array.isArray(meta.unreferenced) ? meta.unreferenced : [];
    try {
      pending = await pruneStaticCache(pending);
    } catch {
      // Pruning is housekeeping; never fail the refresh over it.
    }

    await writeShellMeta({
      warmedAt: now,
      buildId: OfflineShell.readBuildId(documents[0].html),
      routes: documents.length,
      unreferenced: pending,
    });
  } catch {
    await writeShellMeta({ ...(meta || {}), failedAt: now }).catch(() => undefined);
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
