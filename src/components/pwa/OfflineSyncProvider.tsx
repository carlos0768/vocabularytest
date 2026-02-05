'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { hybridRepository } from '@/lib/db';
import { useAuth } from '@/hooks/use-auth';

const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function OfflineSyncProvider({ children }: { children: React.ReactNode }) {
  const isOnline = useOnlineStatus();
  const { user, subscription } = useAuth();
  const isPro = subscription?.status === 'active';
  const wasOffline = useRef(false);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Background sync function
  const backgroundSync = useCallback(async () => {
    if (!isOnline || !user || !isPro) return;

    try {
      console.log('[OfflineSync] Running background sync');
      await hybridRepository.processSyncQueue();
    } catch (error) {
      console.error('[OfflineSync] Background sync failed:', error);
    }
  }, [isOnline, user, isPro]);

  // Handle online/offline transitions
  useEffect(() => {
    if (!isPro) return;

    if (!isOnline) {
      wasOffline.current = true;
      console.log('[OfflineSync] Went offline');
    } else if (wasOffline.current) {
      // Just came back online
      console.log('[OfflineSync] Back online, syncing...');
      wasOffline.current = false;
      backgroundSync();
    }
  }, [isOnline, isPro, backgroundSync]);

  // Set up periodic sync
  useEffect(() => {
    if (!isPro || !isOnline) {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
      return;
    }

    // Initial sync after mount
    const initialTimeout = setTimeout(() => {
      backgroundSync();
    }, 10000); // Wait 10 seconds after mount

    // Periodic sync
    syncIntervalRef.current = setInterval(backgroundSync, SYNC_INTERVAL);

    return () => {
      clearTimeout(initialTimeout);
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [isPro, isOnline, backgroundSync]);

  // Full sync on first Pro login (if needed)
  useEffect(() => {
    if (!isPro || !user || !isOnline) return;

    const syncedUserId = hybridRepository.getSyncedUserId();
    const lastSync = hybridRepository.getLastSync();

    // If never synced or different user, do full sync
    if (!lastSync || syncedUserId !== user.id) {
      console.log('[OfflineSync] First sync for Pro user');
      hybridRepository.fullSync(user.id).catch((error) => {
        console.error('[OfflineSync] Full sync failed:', error);
      });
    }
  }, [isPro, user, isOnline]);

  return <>{children}</>;
}
