import type { User } from '@supabase/supabase-js';
import type { Subscription } from '@/types';
import type { CachedSupabaseSessionSnapshot } from '@/lib/supabase/session-cache';

export interface OfflineFallbackAuth {
  user: User;
  subscription: Subscription | null;
}

export interface OfflineFallbackAuthInput {
  /** Whether the browser reports no network connection. */
  offline: boolean;
  /** Session persisted by Supabase in localStorage / cookies. */
  snapshot: CachedSupabaseSessionSnapshot | null;
  /** Locally cached subscription row for the snapshot's user, if any. */
  cachedSubscription: Subscription | null;
}

/**
 * Identity to use while offline.
 *
 * Supabase access tokens are short-lived (≈1h) and cannot be refreshed without the
 * network, so `getSession()` legitimately reports "no session" after a while offline.
 * Without a fallback every page then treats a signed-in user as a guest, and their own
 * wordbooks — already mirrored into IndexedDB by `HybridWordRepository.fullSync()` —
 * fail the ownership check and render as 「単語帳が見つかりません」.
 *
 * While offline we therefore trust the locally persisted session for IDENTITY ONLY.
 * That grants no extra access: nothing can reach Supabase without a connection, and
 * once it returns the normal refresh + RLS path decides what this user may read. An
 * expired token is still expired.
 *
 * Returns null whenever the fallback must not apply — online, signed out (Supabase
 * clears the stored session on sign-out), or no user in the stored session.
 */
export function resolveOfflineFallbackAuth(
  input: OfflineFallbackAuthInput,
): OfflineFallbackAuth | null {
  if (!input.offline) return null;

  const user = input.snapshot?.user ?? null;
  if (!user || !input.snapshot?.accessToken) return null;

  return { user, subscription: input.cachedSubscription };
}
