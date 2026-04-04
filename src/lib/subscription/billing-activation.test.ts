import test from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import {
  extractIdsFromCheckoutSession,
  resolveSubscriptionIdCandidate,
} from './billing-activation';

function makeCheckoutSession(overrides: Partial<Stripe.Checkout.Session>): Stripe.Checkout.Session {
  return {
    id: 'cs_test_1',
    object: 'checkout.session',
    customer: null,
    subscription: null,
    ...overrides,
  } as Stripe.Checkout.Session;
}

test('resolveSubscriptionIdCandidate prioritizes event value first', () => {
  const resolved = resolveSubscriptionIdCandidate('sub_from_event', 'sub_from_session', 'sub_existing');
  assert.equal(resolved, 'sub_from_event');
});

test('resolveSubscriptionIdCandidate falls back session then existing', () => {
  assert.equal(resolveSubscriptionIdCandidate(null, 'sub_from_session', 'sub_existing'), 'sub_from_session');
  assert.equal(resolveSubscriptionIdCandidate(null, null, 'sub_existing'), 'sub_existing');
  assert.equal(resolveSubscriptionIdCandidate(null, null, null), null);
});

test('extractIdsFromCheckoutSession with string customer/subscription', () => {
  const session = makeCheckoutSession({
    customer: 'cus_abc123',
    subscription: 'sub_xyz789',
  });
  const { customerId, subscriptionId } = extractIdsFromCheckoutSession(session);
  assert.equal(customerId, 'cus_abc123');
  assert.equal(subscriptionId, 'sub_xyz789');
});

test('extractIdsFromCheckoutSession with expanded objects', () => {
  const session = makeCheckoutSession({
    customer: { id: 'cus_obj_1' } as Stripe.Customer,
    subscription: { id: 'sub_obj_1' } as Stripe.Subscription,
  });
  const { customerId, subscriptionId } = extractIdsFromCheckoutSession(session);
  assert.equal(customerId, 'cus_obj_1');
  assert.equal(subscriptionId, 'sub_obj_1');
});

test('extractIdsFromCheckoutSession with null values', () => {
  const session = makeCheckoutSession({
    customer: null,
    subscription: null,
  });
  const { customerId, subscriptionId } = extractIdsFromCheckoutSession(session);
  assert.equal(customerId, null);
  assert.equal(subscriptionId, null);
});
