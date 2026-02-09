import test from 'node:test';
import assert from 'node:assert/strict';
import type { KomojuSession } from '@/lib/komoju';
import {
  extractCustomerIdFromSessionPayload,
  resolveSubscriptionIdCandidate,
} from './billing-activation';

function makeSession(overrides: Partial<KomojuSession>): KomojuSession {
  return {
    id: 'sess_test_1',
    resource: 'session',
    mode: 'customer_payment',
    amount: 1000,
    currency: 'JPY',
    session_url: 'https://example.com/session',
    return_url: 'https://example.com/return',
    status: 'created',
    ...overrides,
  };
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

test('extractCustomerIdFromSessionPayload uses customer_id first', () => {
  const session = makeSession({
    customer_id: 'cust_direct',
    customer: 'cust_string',
    payment: { id: 'pay_1', status: 'captured', customer: 'cust_payment' },
  });

  assert.equal(extractCustomerIdFromSessionPayload(session), 'cust_direct');
});

test('extractCustomerIdFromSessionPayload falls back through known fields', () => {
  const sessionCustomerString = makeSession({ customer: 'cust_string' });
  assert.equal(extractCustomerIdFromSessionPayload(sessionCustomerString), 'cust_string');

  const sessionCustomerObject = makeSession({ customer: { id: 'cust_object' } });
  assert.equal(extractCustomerIdFromSessionPayload(sessionCustomerObject), 'cust_object');

  const sessionPaymentCustomer = makeSession({
    payment: { id: 'pay_1', status: 'captured', customer: 'cust_payment' },
  });
  assert.equal(extractCustomerIdFromSessionPayload(sessionPaymentCustomer), 'cust_payment');

  const sessionPaymentCustomerId = makeSession({
    payment: { id: 'pay_2', status: 'captured', customer_id: 'cust_payment_id' },
  });
  assert.equal(extractCustomerIdFromSessionPayload(sessionPaymentCustomerId), 'cust_payment_id');

  const sessionMetadataCustomerId = makeSession({
    metadata: { customer_id: 'cust_metadata' },
  });
  assert.equal(extractCustomerIdFromSessionPayload(sessionMetadataCustomerId), 'cust_metadata');

  const sessionPaymentMetadataCustomerId = makeSession({
    payment: {
      id: 'pay_3',
      status: 'captured',
      metadata: { customer_id: 'cust_payment_metadata' },
    },
  });
  assert.equal(extractCustomerIdFromSessionPayload(sessionPaymentMetadataCustomerId), 'cust_payment_metadata');
});
