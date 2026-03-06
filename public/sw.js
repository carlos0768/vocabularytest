// Incident-mode Service Worker
// Purpose: remove stale cached bundles after Supabase key migration.

const CACHE_PREFIX = 'scanvocab-';

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

    await self.registration.unregister();

    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(clientsList.map((client) => client.navigate(client.url)));
  })());
});
