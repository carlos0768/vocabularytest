// MERKEN Service Worker
// Web Push notifications only. Intentionally NO fetch/caching handler.
//
// A fetch/caching handler was tried (offline support) but it broke the installed
// standalone PWA: because the service worker controls the PWA from launch, any
// mismatch between a cached app shell and its JS chunks left the PWA stranded on
// its loading screen. A plain browser tab was unaffected because a freshly
// registered worker does not control the first load. Keeping this worker
// caching-free means the PWA loads exactly like a normal page (network), which is
// reliable. Offline support, if revisited, should use a build-integrated precache
// (e.g. Serwist) so the shell and its chunks are always cached atomically.
//
// The activate handler deletes every legacy `scanvocab-` cache, so users whose
// installs were poisoned by the previous caching worker recover automatically on
// the next launch.

const CACHE_PREFIX = 'scanvocab-';
const DEFAULT_NOTIFICATION_URL = '/';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith(CACHE_PREFIX))
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
