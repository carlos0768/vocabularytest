import test from 'node:test';
import assert from 'node:assert/strict';
import { getPayPayGateway, isPayPayGatewayId, isPayPaySubscriptionEnabled } from './config';

test('PayPay subscription is off unless explicitly enabled', () => {
  assert.equal(isPayPaySubscriptionEnabled({} as NodeJS.ProcessEnv), false);
  assert.equal(
    isPayPaySubscriptionEnabled({ PAYPAY_SUBSCRIPTION_ENABLED: '' } as NodeJS.ProcessEnv),
    false
  );
  assert.equal(
    isPayPaySubscriptionEnabled({ PAYPAY_SUBSCRIPTION_ENABLED: 'TRUE' } as NodeJS.ProcessEnv),
    false
  );
  assert.equal(
    isPayPaySubscriptionEnabled({ PAYPAY_SUBSCRIPTION_ENABLED: 'true' } as NodeJS.ProcessEnv),
    true
  );
});

test('gateway resolves only to known ids', () => {
  assert.equal(getPayPayGateway({ PAYPAY_GATEWAY: 'gmo' } as NodeJS.ProcessEnv), 'gmo');
  assert.equal(getPayPayGateway({ PAYPAY_GATEWAY: ' komoju ' } as NodeJS.ProcessEnv), 'komoju');
});

test('an unset or unknown gateway resolves to null rather than a default', () => {
  assert.equal(getPayPayGateway({} as NodeJS.ProcessEnv), null);
  assert.equal(getPayPayGateway({ PAYPAY_GATEWAY: 'stripe' } as NodeJS.ProcessEnv), null);
  assert.equal(isPayPayGatewayId('paypay'), false);
});
