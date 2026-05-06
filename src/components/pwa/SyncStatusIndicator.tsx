'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { hybridRepository, syncQueue } from '@/lib/db';
import { useAuth } from '@/hooks/use-auth';

type SyncStatus = 'synced' | 'syncing' | 'pending' | 'offline';

interface PendingSnapshot {
  pendingCount: number;
  status: SyncStatus;
}

export function SyncStatusIndicator() {
  const isOnline = useOnlineStatus();
  const { user, subscription } = useAuth();
  const isPro = subscription?.status === 'active';
  
  const [status, setStatus] = useState<SyncStatus>('synced');
  const [pendingCount, setPendingCount] = useState(0);

  // Check pending items
  const readPendingSnapshot = useCallback(async (): Promise<PendingSnapshot | null> => {
    try {
      const pending = await syncQueue.getPending();

      if (!isOnline) {
        return { pendingCount: pending.length, status: 'offline' };
      }
      return { pendingCount: pending.length, status: pending.length > 0 ? 'pending' : 'synced' };
    } catch (error) {
      console.error('[SyncStatus] Failed to check pending:', error);
      return null;
    }
  }, [isOnline]);

  // Sync now
  const syncNow = useCallback(async () => {
    if (!isOnline || !user || !isPro) return;

    await Promise.resolve();
    setStatus('syncing');
    try {
      await hybridRepository.processSyncQueue();
      const snapshot = await readPendingSnapshot();
      if (snapshot) {
        setPendingCount(snapshot.pendingCount);
        setStatus(snapshot.status);
      }
    } catch (error) {
      console.error('[SyncStatus] Sync failed:', error);
      setStatus('pending');
    }
  }, [isOnline, user, isPro, readPendingSnapshot]);

  // Auto-sync on online status change
  useEffect(() => {
    let cancelled = false;
    const runAutoSync = async () => {
      if (!isOnline || pendingCount <= 0 || !isPro || !user) return;

      await Promise.resolve();
      if (cancelled) return;

      setStatus('syncing');
      try {
        await hybridRepository.processSyncQueue();
        const snapshot = await readPendingSnapshot();
        if (!snapshot || cancelled) return;
        setPendingCount(snapshot.pendingCount);
        setStatus(snapshot.status);
      } catch (error) {
        if (cancelled) return;
        console.error('[SyncStatus] Sync failed:', error);
        setStatus('pending');
      }
    };

    void runAutoSync();
    return () => {
      cancelled = true;
    };
  }, [isOnline, pendingCount, isPro, user, readPendingSnapshot]);

  // Periodic check (every 30 seconds)
  useEffect(() => {
    if (!isPro) return;

    let cancelled = false;
    const updatePendingItems = async () => {
      const snapshot = await readPendingSnapshot();
      if (!snapshot || cancelled) return;
      setPendingCount(snapshot.pendingCount);
      setStatus(snapshot.status);
    };

    void updatePendingItems();
    const interval = setInterval(() => {
      void updatePendingItems();
    }, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isPro, readPendingSnapshot]);

  // Periodic sync (every 5 minutes)
  useEffect(() => {
    if (!isPro || !isOnline) return;
    
    const interval = setInterval(() => {
      if (navigator.onLine) {
        syncNow();
      }
    }, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [isPro, isOnline, syncNow]);

  // Don't show for free users
  if (!isPro) return null;

  const getIcon = () => {
    switch (status) {
      case 'offline':
        return <Icon name="cloud_off" size={16} />;
      case 'syncing':
        return <Icon name="refresh" size={16} className="animate-spin" />;
      case 'pending':
        return <Icon name="cloud" size={16} />;
      case 'synced':
        return <Icon name="check" size={16} />;
    }
  };

  const getColor = () => {
    switch (status) {
      case 'offline':
        return 'text-[var(--color-muted)]';
      case 'syncing':
        return 'text-[var(--color-primary)]';
      case 'pending':
        return 'text-[var(--color-warning)]';
      case 'synced':
        return 'text-[var(--color-success)]';
    }
  };

  const getLabel = () => {
    switch (status) {
      case 'offline':
        return 'オフライン';
      case 'syncing':
        return '同期中...';
      case 'pending':
        return `${pendingCount}件の変更`;
      case 'synced':
        return '同期済み';
    }
  };

  return (
    <button
      onClick={status === 'pending' && isOnline ? syncNow : undefined}
      disabled={status !== 'pending' || !isOnline}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-colors ${getColor()} ${
        status === 'pending' && isOnline ? 'hover:bg-[var(--color-warning-light)] cursor-pointer' : 'cursor-default'
      }`}
      title={status === 'pending' && isOnline ? 'クリックして同期' : undefined}
    >
      {getIcon()}
      <span>{getLabel()}</span>
    </button>
  );
}
