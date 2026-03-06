'use client';

import { useEffect } from 'react';
import { clearServiceWorkerCaches, unregisterServiceWorker } from '@/lib/pwa/register-sw';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    const disablePwa = async () => {
      await unregisterServiceWorker();
      await clearServiceWorkerCaches();
    };

    disablePwa();
  }, []);

  return null;
}
