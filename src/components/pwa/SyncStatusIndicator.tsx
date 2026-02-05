'use client';

import { useState, useEffect, useCallback } from 'react';
import { Cloud, CloudOff, RefreshCw, Check } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { hybridRepository, syncQueue } from '@/lib/db';
import { useAuth } from '@/hooks/use-auth';

type SyncStatus = 'synced' | 'syncing' | 'pending' | 'offline';

export function SyncStatusIndicator() {
  const isOnline = useOnlineStatus();
  const { user, subscription } = useAuth();
  const isPro = subscription?.status === 'active';
  
  const [status, setStatus] = useState<SyncStatus>('synced');
  const [pendingCount, setPendingCount] = useState(0);

  // Check pending items
  const checkPendingItems = useCallback(async () => {
    try {
      const pending = await syncQueue.getPending();
      setPendingCount(pending.length);
      
      if (!isOnline) {
        setStatus('offline');
      } else if (pending.length > 0) {
        setStatus('pending');
      } else {
        setStatus('synced');
      }
    } catch (error) {
      console.error('[SyncStatus] Failed to check pending:', error);
    }
  }, [isOnline]);

  // Sync now
  const syncNow = useCallback(async () => {
    if (!isOnline || !user || !isPro) return;
    
    setStatus('syncing');
    try {
      await hybridRepository.processSyncQueue();
      await checkPendingItems();
    } catch (error) {
      console.error('[SyncStatus] Sync failed:', error);
      setStatus('pending');
    }
  }, [isOnline, user, isPro, checkPendingItems]);

  // Auto-sync on online status change
  useEffect(() => {
    if (isOnline && pendingCount > 0 && isPro) {
      syncNow();
    }
  }, [isOnline, pendingCount, isPro, syncNow]);

  // Periodic check (every 30 seconds)
  useEffect(() => {
    if (!isPro) return;
    
    checkPendingItems();
    const interval = setInterval(checkPendingItems, 30000);
    return () => clearInterval(interval);
  }, [isPro, checkPendingItems]);

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
        return <CloudOff className="w-4 h-4" />;
      case 'syncing':
        return <RefreshCw className="w-4 h-4 animate-spin" />;
      case 'pending':
        return <Cloud className="w-4 h-4" />;
      case 'synced':
        return <Check className="w-4 h-4" />;
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
