'use client';

import { useOnlineStatus } from '@/hooks/use-online-status';
import { Icon } from '@/components/ui/Icon';

/**
 * App-wide slim banner shown while the device is offline, for every tier.
 * The app itself keeps working from IndexedDB; this just tells the user why
 * network-dependent actions (scanning, sync) may be paused. Sits below the
 * status-bar cover so it never overlaps the notch.
 */
export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[9991] flex justify-center px-3"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}
    >
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-[var(--color-foreground)]/85 px-3 py-1.5 text-xs font-medium text-[var(--color-background)] shadow-lg backdrop-blur">
        <Icon name="wifi_off" size={14} />
        <span>オフライン - 変更は再接続時に同期されます</span>
      </div>
    </div>
  );
}
