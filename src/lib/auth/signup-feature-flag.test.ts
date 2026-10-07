import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FRESH_AUTH_USER_WINDOW_MS,
  NEW_USER_SIGNUP_ENABLED,
  getGuestEntryHref,
  getGuestEntryLabel,
  isFreshlyCreatedAuthUser,
} from './signup-feature-flag';

const NOW = Date.parse('2026-10-07T09:00:00.000Z');

test('new-user signup is paused (2026-10-07)', () => {
  assert.equal(NEW_USER_SIGNUP_ENABLED, false);
});

test('guest CTAs point at /login while signup is closed and keep the redirect', () => {
  const href = getGuestEntryHref('/subscription');
  assert.equal(href, NEW_USER_SIGNUP_ENABLED ? '/signup?redirect=%2Fsubscription' : '/login?redirect=%2Fsubscription');
  assert.equal(getGuestEntryHref(), NEW_USER_SIGNUP_ENABLED ? '/signup?redirect=%2F' : '/login?redirect=%2F');
  assert.equal(getGuestEntryLabel('無料で始める'), NEW_USER_SIGNUP_ENABLED ? '無料で始める' : 'ログイン');
});

test('a user created seconds ago counts as freshly created', () => {
  assert.equal(isFreshlyCreatedAuthUser({ created_at: new Date(NOW - 5_000).toISOString() }, NOW), true);
  assert.equal(isFreshlyCreatedAuthUser({ created_at: new Date(NOW).toISOString() }, NOW), true);
  // clock skew: created "in the future" by a few seconds still counts
  assert.equal(isFreshlyCreatedAuthUser({ created_at: new Date(NOW + 2_000).toISOString() }, NOW), true);
});

test('a user created before the window is an existing user', () => {
  assert.equal(
    isFreshlyCreatedAuthUser({ created_at: new Date(NOW - FRESH_AUTH_USER_WINDOW_MS - 1).toISOString() }, NOW),
    false,
  );
  assert.equal(isFreshlyCreatedAuthUser({ created_at: '2026-01-15T00:00:00.000Z' }, NOW), false);
});

test('an unknown or unparsable created_at never counts as fresh (never delete on doubt)', () => {
  assert.equal(isFreshlyCreatedAuthUser(null, NOW), false);
  assert.equal(isFreshlyCreatedAuthUser(undefined, NOW), false);
  assert.equal(isFreshlyCreatedAuthUser({}, NOW), false);
  assert.equal(isFreshlyCreatedAuthUser({ created_at: null }, NOW), false);
  assert.equal(isFreshlyCreatedAuthUser({ created_at: 'not a date' }, NOW), false);
});
