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

test('GMO config requires every credential rather than partially booting', async () => {
  const { getGmoConfig, GmoConfigError } = await import('./gmo/config');
  const base = {
    GMO_API_BASE_URL: 'https://pt01.mul-pay.jp',
    GMO_SHOP_ID: 'shop',
    GMO_SHOP_PASS: 'shoppass',
    GMO_SITE_ID: 'site',
    GMO_SITE_PASS: 'sitepass',
  };

  const config = getGmoConfig(base as unknown as NodeJS.ProcessEnv);
  assert.equal(config.shopId, 'shop');
  assert.equal(config.siteId, 'site');
  // 許可リスト未設定は空配列。通知側が「全拒否」に倒す。
  assert.deepEqual(config.notificationIpAllowlist, []);

  for (const key of Object.keys(base)) {
    const partial = { ...base } as Record<string, string>;
    delete partial[key];
    assert.throws(
      () => getGmoConfig(partial as unknown as NodeJS.ProcessEnv),
      GmoConfigError,
      `expected ${key} to be required`
    );
  }
});

test('a non-https GMO base URL is rejected', async () => {
  const { getGmoConfig, GmoConfigError } = await import('./gmo/config');
  assert.throws(
    () =>
      getGmoConfig({
        GMO_API_BASE_URL: 'http://pt01.mul-pay.jp',
        GMO_SHOP_ID: 'shop',
        GMO_SHOP_PASS: 'shoppass',
        GMO_SITE_ID: 'site',
        GMO_SITE_PASS: 'sitepass',
      } as unknown as NodeJS.ProcessEnv),
    GmoConfigError
  );
});

test('the IP allowlist is split and trimmed', async () => {
  const { parseIpAllowlist } = await import('./gmo/config');
  assert.deepEqual(parseIpAllowlist(' 203.0.113.0/24 , 198.51.100.7 '), [
    '203.0.113.0/24',
    '198.51.100.7',
  ]);
  assert.deepEqual(parseIpAllowlist(''), []);
  assert.deepEqual(parseIpAllowlist(null), []);
});
