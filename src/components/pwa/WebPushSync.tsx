'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { ensureWebPushSubscription } from '@/lib/notifications/push-client';
import { createBrowserClient } from '@/lib/supabase';

/**
 * Transparent component that re-registers the browser's web push subscription
 * for the signed-in user on every app load.
 *
 * Push subscriptions expire or get rotated by the browser/push service over
 * time. When that happens the stale endpoint is pruned (410/404) and the user
 * silently stops receiving push notifications -- including study reminders --
 * until they manually toggle them again. Refreshing here keeps the
 * `web_push_subscriptions` row current so scheduled reminders keep arriving.
 *
 * Runs with `requestPermission: false` so it never prompts: it only refreshes
 * when notifications were already enabled. Mount once in the root layout.
 */
export function WebPushSync() {
  const { user, isAuthenticated, loading } = useAuth();
  const syncedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated || !user?.id) {
      syncedUserIdRef.current = null;
      return;
    }

    if (syncedUserIdRef.current === user.id) {
      return;
    }
    syncedUserIdRef.current = user.id;

    const syncPushSubscription = async () => {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      await ensureWebPushSubscription({
        accessToken: session.access_token,
        requestPermission: false,
      });
    };

    syncPushSubscription().catch(() => {
      // Push refresh is best-effort; ignore failures.
    });
  }, [isAuthenticated, loading, user?.id]);

  return null;
}
