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

export async function unregisterServiceWorker() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.unregister();
    console.log('[PWA] Service Worker unregistered');
  } catch (error) {
    console.error('[PWA] Service Worker unregistration failed:', error);
  }
}
