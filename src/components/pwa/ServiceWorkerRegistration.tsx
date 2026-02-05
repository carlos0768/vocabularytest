'use client';

import { useEffect } from 'react';
import { registerServiceWorker } from '@/lib/pwa/register-sw';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    // Register SW on mount
    registerServiceWorker();
  }, []);

  return null;
}
