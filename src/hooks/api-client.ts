'use client';

import { createBrowserClient } from '@/lib/supabase';

const supabase = createBrowserClient();

export async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);

  if (!headers.has('Authorization')) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers.set('Authorization', `Bearer ${session.access_token}`);
      }
    } catch {
      // Fall through without bearer auth and let the request fail normally if auth is required.
    }
  }

  const response = await fetch(input, {
    ...init,
    headers,
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMessage = payload?.error && typeof payload.error === 'string'
      ? payload.error
      : 'API request failed';
    throw new Error(errorMessage);
  }

  return payload as T;
}
