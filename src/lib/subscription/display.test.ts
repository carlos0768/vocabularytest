import test from 'node:test';
import assert from 'node:assert/strict';
import { getSubscriptionDisplayDate } from './display';

test('billing subscriptions use currentPeriodEnd as next renewal date', () => {
  const result = getSubscriptionDisplayDate({
    proSource: 'billing',
    testProExpiresAt: null,
    currentPeriodEnd: '2026-03-24T00:00:00.000Z',
    cancelAtPeriodEnd: false,
  });

  assert.deepEqual(result, {
    label: '次回更新',
    isoDate: '2026-03-24T00:00:00.000Z',
  });
});

test('billing subscriptions with cancellation scheduled show cancellation date', () => {
  const result = getSubscriptionDisplayDate({
    proSource: 'billing',
    testProExpiresAt: null,
    currentPeriodEnd: '2026-03-24T00:00:00.000Z',
    cancelAtPeriodEnd: true,
  });

  assert.deepEqual(result, {
    label: '解約予定日',
    isoDate: '2026-03-24T00:00:00.000Z',
  });
});

test('appstore subscriptions use currentPeriodEnd as next renewal date', () => {
  const result = getSubscriptionDisplayDate({
    proSource: 'appstore',
    testProExpiresAt: null,
    currentPeriodEnd: '2026-03-24T00:00:00.000Z',
    cancelAtPeriodEnd: false,
  });

  assert.deepEqual(result, {
    label: '次回更新',
    isoDate: '2026-03-24T00:00:00.000Z',
  });
});

test('test subscriptions use testProExpiresAt and ignore stale currentPeriodEnd', () => {
  const result = getSubscriptionDisplayDate({
    proSource: 'test',
    testProExpiresAt: '2026-03-31T00:00:00.000Z',
    currentPeriodEnd: '2026-02-24T00:00:00.000Z',
    cancelAtPeriodEnd: false,
  });

  assert.deepEqual(result, {
    label: '有効期限',
    isoDate: '2026-03-31T00:00:00.000Z',
  });
});

test('test subscriptions without testProExpiresAt do not render a billing date', () => {
  const result = getSubscriptionDisplayDate({
    proSource: 'test',
    testProExpiresAt: null,
    currentPeriodEnd: '2026-02-24T00:00:00.000Z',
    cancelAtPeriodEnd: false,
  });

  assert.equal(result, null);
});
