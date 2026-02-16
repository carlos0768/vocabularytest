'use client';

import { useEffect } from 'react';
import { registerServiceWorker, unregisterServiceWorker } from '@/lib/pwa/register-sw';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    // Dev: prevent stale cached bundles that can cause hydration mismatch.
    if (process.env.NODE_ENV !== 'production') {
      unregisterServiceWorker();
      return;
    }

    // Production only
    registerServiceWorker();
  }, []);

  return null;
}
