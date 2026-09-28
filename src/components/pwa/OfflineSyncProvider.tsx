'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { hybridRepository } from '@/lib/db';
import { useAuth } from '@/hooks/use-auth';
import { wasProUser } from '@/lib/subscription/status';
import { requestOfflineShellWarm } from '@/lib/pwa/register-sw';

const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes
// Let the page finish its own loading before the worker starts filling the
// offline shell in the background.
const OFFLINE_SHELL_WARM_DELAY = 15 * 1000;

export function OfflineSyncProvider({ children }: { children: React.ReactNode }) {
  const isOnline = useOnlineStatus();
  const { user, subscription } = useAuth();
  // Cloud sync runs for active Pro AND Free users. Former-Pro (read-only) users
  // are excluded — they use the readonly repository, not the hybrid sync.
  const canSync = !wasProUser(subscription);
  const wasOffline = useRef(false);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Background sync function
  const backgroundSync = useCallback(async () => {
    if (!isOnline || !user || !canSync) return;

    try {
      console.log('[OfflineSync] Running background sync');
      await hybridRepository.processSyncQueue();
    } catch (error) {
      console.error('[OfflineSync] Background sync failed:', error);
    }
  }, [isOnline, user, canSync]);

  // Handle online/offline transitions
  useEffect(() => {
    if (!canSync) return;

    if (!isOnline) {
      wasOffline.current = true;
      console.log('[OfflineSync] Went offline');
    } else if (wasOffline.current) {
      // Just came back online
      console.log('[OfflineSync] Back online, syncing...');
      wasOffline.current = false;
      backgroundSync();
    }
  }, [isOnline, canSync, backgroundSync]);

  // Set up periodic sync
  useEffect(() => {
    if (!canSync || !isOnline) {
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
  }, [canSync, isOnline, backgroundSync]);

  // Full sync on first Pro login (if needed)
  useEffect(() => {
    if (!canSync || !user || !isOnline) return;

    const syncedUserId = hybridRepository.getSyncedUserId();
    const lastSync = hybridRepository.getLastSync();

    // If never synced or different user, do full sync
    if (!lastSync || syncedUserId !== user.id) {
      console.log('[OfflineSync] First sync for Pro user');
      hybridRepository.fullSync(user.id).catch((error) => {
        console.error('[OfflineSync] Full sync failed:', error);
      });
    }
  }, [canSync, user, isOnline]);

  // Keep the offline app shell current so the real UI (not the fallback viewer)
  // opens offline. Independent of canSync: read-only former-Pro users still read
  // their wordbooks offline. The worker throttles the actual refresh.
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId || !isOnline) return;
    const timer = setTimeout(() => {
      void requestOfflineShellWarm();
    }, OFFLINE_SHELL_WARM_DELAY);
    return () => clearTimeout(timer);
  }, [userId, isOnline]);

  return <>{children}</>;
}
