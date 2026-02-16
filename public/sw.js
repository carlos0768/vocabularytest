// ScanVocab Service Worker
// Cache-first for static assets, Network-first for API

const CACHE_NAME = 'scanvocab-v4';
const STATIC_CACHE_NAME = 'scanvocab-static-v4';

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

  // Next.js runtime chunks should be network-first to avoid stale bundles
  // that can cause hydration mismatch after deployments.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Other static assets: Cache-first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Pages: Network-first (avoid stale HTML causing hydration mismatches)
  event.respondWith(networkFirst(request));
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

function parsePushPayload(event) {
  if (!event.data) return null;

  try {
    return event.data.json();
  } catch {
    try {
      return JSON.parse(event.data.text());
    } catch {
      return null;
    }
  }
}

async function shouldSuppressNotification(targetPath) {
  // If the exact project page is already open, notification is redundant.
  if (!targetPath.startsWith('/project/')) {
    return false;
  }

  const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  return clientsList.some((client) => {
    try {
      const clientUrl = new URL(client.url);
      return clientUrl.origin === self.location.origin && clientUrl.pathname === targetPath;
    } catch {
      return false;
    }
  });
}

self.addEventListener('push', (event) => {
  const payload = parsePushPayload(event);
  if (!payload) return;

  const title = typeof payload.title === 'string' ? payload.title : 'MERKEN';
  const body = typeof payload.body === 'string' ? payload.body : '';
  const tag = typeof payload.tag === 'string' ? payload.tag : undefined;
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
  const targetUrl = typeof data.url === 'string' ? data.url : '/';

  event.waitUntil((async () => {
    const absoluteTarget = new URL(targetUrl, self.location.origin);
    const suppress = await shouldSuppressNotification(absoluteTarget.pathname);
    if (suppress) {
      return;
    }

    await self.registration.showNotification(title, {
      body,
      tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: {
        url: absoluteTarget.href,
      },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = typeof event.notification.data?.url === 'string'
    ? event.notification.data.url
    : new URL('/', self.location.origin).href;

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const target = new URL(targetUrl, self.location.origin);

    for (const client of clientList) {
      try {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === target.origin && clientUrl.pathname === target.pathname) {
          await client.focus();
          return;
        }
      } catch {
        // ignore URL parsing errors
      }
    }

    if (clientList.length > 0) {
      const client = clientList[0];
      if ('navigate' in client) {
        await client.navigate(target.href);
      }
      await client.focus();
      return;
    }

    await self.clients.openWindow(target.href);
  })());
});
