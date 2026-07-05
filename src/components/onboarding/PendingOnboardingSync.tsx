'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  clearPendingOnboarding,
  readPendingOnboarding,
} from '@/lib/auth/pending-onboarding';

/**
 * Flushes onboarding profile data stashed before an OAuth redirect
 * (see storePendingOnboarding) once the user has an authenticated session.
 * Renders nothing; mounted app-wide from the root layout.
 */
export function PendingOnboardingSync() {
  const { isAuthenticated, loading } = useAuth();
  const syncingRef = useRef(false);

  useEffect(() => {
    if (loading || !isAuthenticated || syncingRef.current) return;

    const pending = readPendingOnboarding();
    if (!pending) return;

    syncingRef.current = true;
    void (async () => {
      try {
        const response = await fetch('/api/onboarding/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            display_name: pending.displayName || undefined,
            user_handle: pending.userHandle || undefined,
            eiken_level: pending.eikenLevel,
          }),
        });

        // 4xx = permanently unusable payload; clear it either way on success.
        if (response.ok || (response.status >= 400 && response.status < 500)) {
          clearPendingOnboarding();
          if (response.ok) {
            try {
              // Drop the cached profile so useProfile refetches the new name.
              sessionStorage.removeItem('merken_profile_cache');
            } catch {
              // ignore
            }
          }
        }
      } catch (error) {
        console.error('[Onboarding] Failed to sync pending profile:', error);
      } finally {
        syncingRef.current = false;
      }
    })();
  }, [isAuthenticated, loading]);

  return null;
}
