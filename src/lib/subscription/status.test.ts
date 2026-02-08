import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getEffectiveSubscriptionStatus,
  isActiveProSubscription,
} from './status';

const FIXED_NOW = new Date('2026-02-08T12:00:00.000Z');

test('test source with future expiry is active', () => {
  const active = isActiveProSubscription(
    {
      status: 'active',
      plan: 'pro',
      proSource: 'test',
      testProExpiresAt: '2026-03-01T00:00:00.000Z',
      currentPeriodEnd: null,
    },
    FIXED_NOW
  );
  assert.equal(active, true);
});

test('test source with past expiry is inactive', () => {
  const active = isActiveProSubscription(
    {
      status: 'active',
      plan: 'pro',
      proSource: 'test',
      testProExpiresAt: '2026-01-01T00:00:00.000Z',
      currentPeriodEnd: null,
    },
    FIXED_NOW
  );
  assert.equal(active, false);
});

test('test source with null expiry stays active', () => {
  const active = isActiveProSubscription(
    {
      status: 'active',
      plan: 'pro',
      proSource: 'test',
      testProExpiresAt: null,
      currentPeriodEnd: null,
    },
    FIXED_NOW
  );
  assert.equal(active, true);
});

test('billing source with future period is active', () => {
  const active = isActiveProSubscription(
    {
      status: 'active',
      plan: 'pro',
      proSource: 'billing',
      testProExpiresAt: null,
      currentPeriodEnd: '2026-03-01T00:00:00.000Z',
    },
    FIXED_NOW
  );
  assert.equal(active, true);
});

test('billing source with past period is inactive', () => {
  const active = isActiveProSubscription(
    {
      status: 'active',
      plan: 'pro',
      proSource: 'billing',
      testProExpiresAt: null,
      currentPeriodEnd: '2026-01-01T00:00:00.000Z',
    },
    FIXED_NOW
  );
  assert.equal(active, false);
});

test('billing source with null period stays active', () => {
  const active = isActiveProSubscription(
    {
      status: 'active',
      plan: 'pro',
      proSource: 'billing',
      testProExpiresAt: null,
      currentPeriodEnd: null,
    },
    FIXED_NOW
  );
  assert.equal(active, true);
});

test('effective status cancels expired test subscription', () => {
  const status = getEffectiveSubscriptionStatus(
    'active',
    'pro',
    'test',
    '2026-01-01T00:00:00.000Z',
    null,
    FIXED_NOW
  );
  assert.equal(status, 'cancelled');
});

test('effective status cancels expired billing subscription', () => {
  const status = getEffectiveSubscriptionStatus(
    'active',
    'pro',
    'billing',
    null,
    '2026-01-01T00:00:00.000Z',
    FIXED_NOW
  );
  assert.equal(status, 'cancelled');
});
