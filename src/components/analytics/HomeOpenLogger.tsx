'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

const SESSION_KEY_PREFIX = 'merken_home_open_logged';

function sessionKeyForUser(userId: string): string {
  return `${SESSION_KEY_PREFIX}:${userId}`;
}

export function HomeOpenLogger() {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const loggedSessionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading || !user || pathname !== '/') return;

    const sessionKey = sessionKeyForUser(user.id);
    if (loggedSessionKeyRef.current === sessionKey) return;

    try {
      if (sessionStorage.getItem(sessionKey) === 'true') return;
      sessionStorage.setItem(sessionKey, 'true');
    } catch {
      // sessionStorage is only a duplicate guard; logging can continue without it.
    }

    loggedSessionKeyRef.current = sessionKey;

    fetch('/api/user-last-opened', {
      method: 'POST',
      keepalive: true,
      cache: 'no-store',
    }).catch(() => {
      loggedSessionKeyRef.current = null;
      try {
        sessionStorage.removeItem(sessionKey);
      } catch {
        // ignore
      }
    });
  }, [loading, pathname, user]);

  return null;
}
