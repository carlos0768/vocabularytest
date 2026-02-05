// Hook to track online/offline status
'use client';

import { useState, useEffect, useCallback } from 'react';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => {
      console.log('[Online] Connection restored');
      setIsOnline(true);
    };

    const handleOffline = () => {
      console.log('[Offline] Connection lost');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

// Hook to sync data when coming back online
export function useOfflineSync(
  onSync: () => Promise<void>,
  dependencies: unknown[] = []
) {
  const isOnline = useOnlineStatus();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastOnlineState, setLastOnlineState] = useState(isOnline);

  const doSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await onSync();
    } catch (error) {
      console.error('[OfflineSync] Sync failed:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [onSync, isSyncing]);

  useEffect(() => {
    // Trigger sync when coming back online
    if (isOnline && !lastOnlineState) {
      console.log('[OfflineSync] Back online, triggering sync');
      doSync();
    }
    setLastOnlineState(isOnline);
  }, [isOnline, lastOnlineState, doSync, ...dependencies]);

  return { isOnline, isSyncing, doSync };
}
