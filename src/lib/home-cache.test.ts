import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REMOTE_WORDBOOKS_REFRESH_INTERVAL_MS,
  getHomeViewSnapshot,
  invalidateHomeCache,
  markRemoteWordbooksRefreshed,
  resetRemoteWordbooksRefresh,
  setHomeViewSnapshot,
  shouldRefreshRemoteWordbooks,
} from './home-cache';

test('remote wordbook refresh is skipped within the interval for the same user', () => {
  resetRemoteWordbooksRefresh();
  const now = 1_000_000;

  assert.equal(shouldRefreshRemoteWordbooks('u1', now), true);

  markRemoteWordbooksRefreshed('u1', now);
  assert.equal(shouldRefreshRemoteWordbooks('u1', now + 1), false);
  assert.equal(
    shouldRefreshRemoteWordbooks('u1', now + REMOTE_WORDBOOKS_REFRESH_INTERVAL_MS - 1),
    false,
  );
  assert.equal(
    shouldRefreshRemoteWordbooks('u1', now + REMOTE_WORDBOOKS_REFRESH_INTERVAL_MS),
    true,
  );
});

test('a different user always refreshes', () => {
  resetRemoteWordbooksRefresh();
  markRemoteWordbooksRefreshed('u1', 5_000);
  assert.equal(shouldRefreshRemoteWordbooks('u2', 5_001), true);
});

test('invalidateHomeCache forces the next remote refresh', () => {
  resetRemoteWordbooksRefresh();
  markRemoteWordbooksRefreshed('u1', 5_000);
  assert.equal(shouldRefreshRemoteWordbooks('u1', 5_001), false);

  invalidateHomeCache();
  assert.equal(shouldRefreshRemoteWordbooks('u1', 5_002), true);
});

test('home view snapshot is scoped to the user who produced it', () => {
  setHomeViewSnapshot('u1', { projects: 3 });
  assert.deepEqual(getHomeViewSnapshot('u1'), { projects: 3 });
  assert.equal(getHomeViewSnapshot('u2'), null);
});
