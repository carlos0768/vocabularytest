import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { User } from '@supabase/supabase-js';
import type { Subscription } from '@/types';
import type { CachedSupabaseSessionSnapshot } from '@/lib/supabase/session-cache';
import { resolveOfflineFallbackAuth } from './offline-session';

const user = { id: 'user-1', aud: 'authenticated' } as User;

function snapshot(
  overrides: Partial<CachedSupabaseSessionSnapshot> = {},
): CachedSupabaseSessionSnapshot {
  return {
    accessToken: 'token',
    // Expired an hour ago: the normal state after a while offline.
    expiresAt: Math.floor(Date.now() / 1000) - 3600,
    user,
    userId: user.id,
    ...overrides,
  };
}

const subscription = { id: 'sub-1', userId: 'user-1', status: 'active' } as Subscription;

describe('resolveOfflineFallbackAuth', () => {
  it('keeps the cached user when offline with an expired token', () => {
    const result = resolveOfflineFallbackAuth({
      offline: true,
      snapshot: snapshot(),
      cachedSubscription: subscription,
    });
    assert.equal(result?.user.id, 'user-1');
    assert.equal(result?.subscription, subscription);
  });

  it('never applies while online', () => {
    assert.equal(
      resolveOfflineFallbackAuth({
        offline: false,
        snapshot: snapshot(),
        cachedSubscription: subscription,
      }),
      null,
    );
  });

  it('does not resurrect a signed-out user', () => {
    // Sign-out clears Supabase's persisted session, so there is no snapshot to trust.
    assert.equal(
      resolveOfflineFallbackAuth({ offline: true, snapshot: null, cachedSubscription: null }),
      null,
    );
  });

  it('requires both a stored user and a stored token', () => {
    assert.equal(
      resolveOfflineFallbackAuth({
        offline: true,
        snapshot: snapshot({ user: null }),
        cachedSubscription: null,
      }),
      null,
    );
    assert.equal(
      resolveOfflineFallbackAuth({
        offline: true,
        snapshot: snapshot({ accessToken: '' }),
        cachedSubscription: null,
      }),
      null,
    );
  });

  it('falls back to no subscription when nothing is cached', () => {
    const result = resolveOfflineFallbackAuth({
      offline: true,
      snapshot: snapshot(),
      cachedSubscription: null,
    });
    assert.equal(result?.subscription, null);
  });
});
