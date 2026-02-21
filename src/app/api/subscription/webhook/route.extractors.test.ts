import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSubscriptionId } from './route';

test('extractSubscriptionId does not treat payment id as subscription id by default', () => {
  const data = {
    id: 'pay_123',
    payment: {
      id: 'pay_123',
    },
  };

  assert.equal(extractSubscriptionId(data), null);
});

test('extractSubscriptionId reads explicit subscription fields first', () => {
  assert.equal(
    extractSubscriptionId({
      subscription_id: 'sub_from_top_level',
      id: 'pay_123',
    }),
    'sub_from_top_level'
  );

  assert.equal(
    extractSubscriptionId({
      subscription: {
        id: 'sub_from_object',
      },
      id: 'pay_123',
    }),
    'sub_from_object'
  );
});

test('extractSubscriptionId allows data.id fallback only when explicitly requested', () => {
  const data = {
    id: 'sub_from_data_id',
  };

  assert.equal(extractSubscriptionId(data), null);
  assert.equal(
    extractSubscriptionId(data, { allowDataIdFallback: true }),
    'sub_from_data_id'
  );
});
