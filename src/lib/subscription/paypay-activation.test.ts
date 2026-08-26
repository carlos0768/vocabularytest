import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPayPaySubscriptionUpdate,
  resolvePayPaySubscriptionTransition,
  type NormalizedPayPayNotification,
  type PayPayNotificationType,
} from './paypay-activation';

const FIXED_NOW = new Date('2026-08-26T12:00:00.000Z');
const FUTURE = '2026-09-26T00:00:00.000Z';
const PAST = '2026-07-26T00:00:00.000Z';

function notification(
  type: PayPayNotificationType,
  overrides: Partial<NormalizedPayPayNotification> = {}
): NormalizedPayPayNotification {
  return {
    gateway: 'gmo',
    eventId: 'evt_1',
    type,
    subscriptionId: 'sub_gmo_1',
    customerId: 'cus_gmo_1',
    currentPeriodStart: '2026-08-26T00:00:00.000Z',
    currentPeriodEnd: FUTURE,
    ...overrides,
  };
}

test('test notifications do not touch the subscription row', () => {
  const transition = resolvePayPaySubscriptionTransition(
    notification('test'),
    FUTURE,
    FIXED_NOW
  );
  assert.equal(transition, null);
});

test('activation and renewal keep the subscription active', () => {
  for (const type of ['subscription_activated', 'subscription_renewed'] as const) {
    const transition = resolvePayPaySubscriptionTransition(
      notification(type),
      null,
      FIXED_NOW
    );
    assert.deepEqual(transition, {
      status: 'active',
      cancelAtPeriodEnd: false,
      cancelRequestedAt: null,
      currentPeriodEnd: FUTURE,
    });
  }
});

test('cancellation and refund revoke entitlement immediately even mid-period', () => {
  for (const type of ['subscription_cancelled', 'refunded'] as const) {
    const transition = resolvePayPaySubscriptionTransition(
      notification(type),
      FUTURE,
      FIXED_NOW
    );
    assert.equal(transition?.status, 'cancelled');
    assert.equal(transition?.cancelAtPeriodEnd, false);
  }
});

test('scheduled cancellation stays active until the period ends', () => {
  const transition = resolvePayPaySubscriptionTransition(
    notification('subscription_cancel_scheduled'),
    FUTURE,
    FIXED_NOW
  );
  assert.equal(transition?.status, 'active');
  assert.equal(transition?.cancelAtPeriodEnd, true);
  assert.equal(transition?.cancelRequestedAt, FIXED_NOW.toISOString());
});

test('scheduled cancellation on an already expired period cancels outright', () => {
  const transition = resolvePayPaySubscriptionTransition(
    notification('subscription_cancel_scheduled', { currentPeriodEnd: PAST }),
    PAST,
    FIXED_NOW
  );
  assert.equal(transition?.status, 'cancelled');
  assert.equal(transition?.cancelAtPeriodEnd, false);
});

test('payment failure keeps Pro alive while the paid period remains', () => {
  const transition = resolvePayPaySubscriptionTransition(
    notification('payment_failed', { currentPeriodEnd: null }),
    FUTURE,
    FIXED_NOW
  );
  assert.equal(transition?.status, 'active');
});

test('payment failure after the period ends drops to cancelled', () => {
  const transition = resolvePayPaySubscriptionTransition(
    notification('payment_failed', { currentPeriodEnd: null }),
    PAST,
    FIXED_NOW
  );
  assert.equal(transition?.status, 'cancelled');
});

test('notification period end wins over the stored period end', () => {
  const transition = resolvePayPaySubscriptionTransition(
    notification('subscription_renewed', { currentPeriodEnd: FUTURE }),
    PAST,
    FIXED_NOW
  );
  assert.equal(transition?.currentPeriodEnd, FUTURE);
});

test('update payload pins pro_source and clears the test-Pro expiry', () => {
  const notif = notification('subscription_activated');
  const transition = resolvePayPaySubscriptionTransition(notif, null, FIXED_NOW);
  assert.ok(transition);

  const update = buildPayPaySubscriptionUpdate(notif, transition, FIXED_NOW);
  assert.equal(update.pro_source, 'paypay');
  assert.equal(update.test_pro_expires_at, null);
  assert.equal(update.paypay_provider, 'gmo');
  assert.equal(update.paypay_subscription_id, 'sub_gmo_1');
  assert.equal(update.paypay_last_verified_at, FIXED_NOW.toISOString());
});

test('cancelled subscriptions keep plan=pro so wasPro readonly access survives', () => {
  const notif = notification('subscription_cancelled');
  const transition = resolvePayPaySubscriptionTransition(notif, FUTURE, FIXED_NOW);
  assert.ok(transition);

  const update = buildPayPaySubscriptionUpdate(notif, transition, FIXED_NOW);
  assert.equal(update.status, 'cancelled');
  assert.equal(update.plan, 'pro');
});

test('a notification without a period start does not erase the stored one', () => {
  const notif = notification('subscription_cancelled', { currentPeriodStart: null });
  const transition = resolvePayPaySubscriptionTransition(notif, FUTURE, FIXED_NOW);
  assert.ok(transition);

  const update = buildPayPaySubscriptionUpdate(notif, transition, FIXED_NOW);
  assert.equal('current_period_start' in update, false);
});
