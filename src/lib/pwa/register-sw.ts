// Service Worker Registration
// Call this from the root layout to enable PWA functionality

export async function registerServiceWorker() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) {
    console.log('[PWA] Service Worker not supported');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    console.log('[PWA] Service Worker registered:', registration.scope);

    // Handle updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New version available
          console.log('[PWA] New version available');
          // Optionally show a toast to the user
          if (confirm('新しいバージョンがあります。更新しますか？')) {
            newWorker.postMessage('skipWaiting');
            window.location.reload();
          }
        }
      });
    });

    return registration;
  } catch (error) {
    console.error('[PWA] Service Worker registration failed:', error);
  }
}

/**
 * Ask the service worker to refresh the offline app shell (public/sw-offline-shell.js):
 * one document per app route plus the build assets they need, so the real UI opens
 * offline. The worker throttles this itself (every few hours), so calling it on
 * every app start is cheap. Only call it for a signed-in user — the shell documents
 * are fetched with the current cookies, and a signed-out "/" is the landing page.
 */
export async function requestOfflineShellWarm() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator) || !navigator.onLine) return;
  // Respect the OS "data saver" setting: the first fill downloads a few MB.
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({ type: 'warm-offline-shell' });
  } catch {
    // Best-effort: without a shell the app still falls back to /offline.html.
  }
}

/**
 * Drop the app shell (public/sw-offline-shell.js). It was fetched signed in and the
 * worker answers launches from it, so after sign-out the server has to decide again
 * (it redirects signed-out visitors). Refilled on the next signed-in warm.
 */
export async function clearOfflineShellCache() {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  try {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith('merken-shell-'))
        .map((name) => caches.delete(name))
    );
  } catch {
    // best-effort
  }
}

export async function clearServiceWorkerCaches() {
  if (typeof window === 'undefined') return;
  if (!('caches' in window)) return;

  try {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith('scanvocab-') || name.startsWith('merken-'))
        .map((name) => caches.delete(name))
    );
    console.log('[PWA] Cleared service worker caches');
  } catch (error) {
    console.error('[PWA] Failed to clear service worker caches:', error);
  }
}

export async function unregisterServiceWorker() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    console.log('[PWA] Service Worker unregistered');
  } catch (error) {
    console.error('[PWA] Service Worker unregistration failed:', error);
  }
}
