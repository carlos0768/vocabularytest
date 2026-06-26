'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import type { FollowNotification } from '@/lib/follows/types';

type FollowNotificationsButtonProps = {
  variant?: 'desktop' | 'mobile';
};

type FollowNotificationsResponse = {
  success?: boolean;
  notifications?: FollowNotification[];
  error?: string;
};

type FollowRespondResponse = {
  success?: boolean;
  error?: string;
};

function formatNotificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return 'たった今';
  if (diffMinutes < 60) return `${diffMinutes}分前`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}時間前`;

  return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
}

export function FollowNotificationsButton({ variant = 'desktop' }: FollowNotificationsButtonProps) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<FollowNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  // On mobile the button sits mid-header (left of the streak chip), so anchoring the
  // panel to the button's right edge pushes it off the left of the screen. Pin the panel
  // to the viewport's right edge instead, measuring the button only for vertical offset.
  const [mobilePanelPos, setMobilePanelPos] = useState<{ top: number; right: number }>({ top: 58, right: 14 });

  const isMobile = variant === 'mobile';

  const unreadCount = notifications.length;

  const loadNotifications = useCallback(async () => {
    if (!isAuthenticated) {
      setNotifications([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/notifications/follows', { cache: 'no-store' });
      const payload = await response.json().catch(() => null) as FollowNotificationsResponse | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'follow_notifications_failed');
      }
      setNotifications(payload.notifications ?? []);
    } catch (loadError) {
      console.error('Failed to load follow notifications:', loadError);
      setNotifications([]);
      setError('通知を読み込めませんでした');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (authLoading) return;
    void loadNotifications();
  }, [authLoading, loadNotifications]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open || !isMobile) return;

    const updatePosition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMobilePanelPos({ top: rect.bottom + 8, right: 14 });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, isMobile]);

  async function respond(followId: string, action: 'accept' | 'decline') {
    if (respondingId) return;

    setRespondingId(followId);
    setError(null);
    try {
      const response = await fetch('/api/follows/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followId, action }),
      });
      const payload = await response.json().catch(() => null) as FollowRespondResponse | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'follow_respond_failed');
      }
      setNotifications((current) => current.filter((item) => item.followId !== followId));
    } catch (respondError) {
      console.error('Failed to respond follow notification:', respondError);
      setError(action === 'accept' ? '承認できませんでした' : '削除できませんでした');
    } finally {
      setRespondingId(null);
    }
  }

  const buttonClassName = useMemo(() => {
    if (variant === 'mobile') {
      return 'relative inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--color-accent)] transition-all duration-100 active:translate-x-px active:translate-y-px';
    }
    return 'ds-btn ds-btn--icon relative';
  }, [variant]);

  if (authLoading || !isAuthenticated) return null;

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        className={buttonClassName}
        aria-label="通知"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
          if (!open) void loadNotifications();
        }}
      >
        <Icon name="notifications" filled={unreadCount > 0} size={variant === 'mobile' ? 20 : undefined} />
        {unreadCount > 0 && (
          <span
            className={cn(
              'absolute flex min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-extrabold leading-[18px] text-white',
              variant === 'mobile' ? '-right-1 -top-1 h-[18px]' : '-right-2 -top-2 h-[18px]',
            )}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            'z-[120] w-[min(340px,calc(100vw-28px))] border-2 border-[var(--solid-ink)] bg-white shadow-[6px_6px_0_var(--solid-ink)]',
            isMobile ? 'fixed rounded-[14px]' : 'absolute right-0 top-[calc(100%+10px)] rounded-[12px]',
          )}
          style={isMobile ? { top: mobilePanelPos.top, right: mobilePanelPos.right } : undefined}
        >
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2.5">
            <div className="font-display text-[14px] font-extrabold text-[var(--solid-ink)]">通知</div>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-surface-secondary)]"
              aria-label="通知を更新"
              onClick={() => void loadNotifications()}
            >
              <Icon name={loading ? 'progress_activity' : 'refresh'} className={loading ? 'animate-spin' : undefined} size={16} />
            </button>
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {error && (
              <div className="border-b border-[var(--color-border)] px-3 py-2 text-[12px] font-bold text-red-700">
                {error}
              </div>
            )}
            {loading && notifications.length === 0 ? (
              <div className="flex items-center gap-2 px-3 py-5 text-[12px] font-bold text-[var(--color-muted)]">
                <Icon name="progress_activity" className="animate-spin" size={16} />
                読み込み中...
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-3 py-6 text-center text-[12px] font-bold text-[var(--color-muted)]">
                新しい通知はありません
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {notifications.map((item) => {
                  const accountLabel = item.profile.accountId ? `@${item.profile.accountId}` : item.profile.username ?? 'ユーザー';
                  const avatarLabel = (item.profile.accountId ?? item.profile.username ?? 'U').charAt(0).toUpperCase();
                  const isResponding = respondingId === item.followId;

                  return (
                    <div key={item.id} className="px-3 py-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] font-display text-[13px] font-extrabold text-white">
                          {avatarLabel}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px] font-extrabold text-[var(--solid-ink)]">
                            {accountLabel}
                          </div>
                          <div className="mt-0.5 text-[11px] font-semibold text-[var(--color-muted)]">
                            フォローリクエスト
                            {formatNotificationTime(item.createdAt) && ` · ${formatNotificationTime(item.createdAt)}`}
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={Boolean(respondingId)}
                          onClick={() => void respond(item.followId, 'decline')}
                          className="inline-flex h-8 items-center rounded-[8px] border border-[var(--color-border)] bg-white px-3 text-[11px] font-bold text-[var(--color-muted)] disabled:opacity-50"
                        >
                          削除
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(respondingId)}
                          onClick={() => void respond(item.followId, 'accept')}
                          className="inline-flex h-8 items-center gap-1 rounded-[8px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-3 text-[11px] font-bold text-white disabled:opacity-50"
                        >
                          {isResponding && <Icon name="progress_activity" className="animate-spin" size={13} />}
                          承認
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
