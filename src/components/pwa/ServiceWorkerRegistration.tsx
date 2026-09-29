'use client';

import { useEffect } from 'react';
import { registerServiceWorker } from '@/lib/pwa/register-sw';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    // The app hydrated. A page served from the app shell carries a boot guard
    // (public/sw-offline-shell.js) that falls back to the network unless this is
    // set in time.
    (window as Window & { __merkenBooted?: boolean }).__merkenBooted = true;
    void registerServiceWorker();
  }, []);

  return null;
}
