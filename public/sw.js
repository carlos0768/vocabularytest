// ScanVocab Service Worker
// Cache-first for static assets, Network-first for API

const CACHE_NAME = 'scanvocab-v2';
const STATIC_CACHE_NAME = 'scanvocab-static-v2';

// Static assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/offline',
  '/manifest.json',
];

// Install: Cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate: Clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== STATIC_CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  // Take control immediately
  self.clients.claim();
});

// Fetch: Handle requests
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Cache Google Fonts (Material Symbols) for offline use
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Skip other external requests
  if (url.origin !== location.origin) return;

  // Skip API routes (handle offline separately)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Skip auth-related routes
  if (url.pathname.startsWith('/auth/') || url.pathname.startsWith('/login') || url.pathname.startsWith('/signup')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Share target: always network-first to avoid stale cached response
  if (url.pathname.startsWith('/share-target')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Static assets: Cache-first
  // Icon files: Cache-first
  if (url.pathname.match(/\.(png|jpg|svg|ico)$/)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Static assets: Cache-first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Pages: Stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// Check if request is for a static asset
function isStaticAsset(pathname) {
  return (
    pathname.startsWith('/_next/static/') ||
    pathname.startsWith('/icons/') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.woff2')
  );
}

// Cache-first strategy
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('[SW] Cache-first fetch failed:', error);
    return new Response('Offline', { status: 503 });
  }
}

// Network-first strategy
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch (error) {
    console.log('[SW] Network-first fetch failed, trying cache:', error);
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('/offline');
    }
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Stale-while-revalidate strategy
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => {
    // If offline and no cache, return offline page
    if (request.mode === 'navigate') {
      return caches.match('/offline');
    }
    return new Response('Offline', { status: 503 });
  });

  return cached || fetchPromise;
}

// Listen for messages from the app
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
