import test from 'node:test';
import assert from 'node:assert/strict';

test('STRIPE_CONFIG exports expected plan structure', async () => {
  const { STRIPE_CONFIG } = await import('./config.ts');

  assert.equal(STRIPE_CONFIG.plans.pro.price, 300);
  assert.equal(STRIPE_CONFIG.plans.pro.currency, 'JPY');
  assert.equal(STRIPE_CONFIG.plans.pro.interval, 'month');
  assert.equal(STRIPE_CONFIG.freePlan.dailyScanLimit, 3);
  assert.equal(STRIPE_CONFIG.freePlan.wordLimit, 100);
  assert.ok(STRIPE_CONFIG.plans.pro.features.length > 0);
});

test('client module exports all expected functions', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_key_for_import_test';
  const nonce = Math.random().toString(36).slice(2);
  const mod = await import(`./client.ts?nonce=${nonce}`);

  assert.equal(typeof mod.createCheckoutSession, 'function');
  assert.equal(typeof mod.getCheckoutSession, 'function');
  assert.equal(typeof mod.getSubscription, 'function');
  assert.equal(typeof mod.cancelSubscriptionAtPeriodEnd, 'function');
  assert.equal(typeof mod.cancelSubscriptionImmediately, 'function');
  assert.equal(typeof mod.createCustomer, 'function');
  assert.equal(typeof mod.getCustomer, 'function');
  assert.equal(typeof mod.constructWebhookEvent, 'function');
});

test('index re-exports config and client symbols', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_key_for_import_test';
  const nonce = Math.random().toString(36).slice(2);
  const mod = await import(`./index.ts?nonce=${nonce}`);

  assert.ok(mod.STRIPE_CONFIG);
  assert.equal(typeof mod.createCheckoutSession, 'function');
  assert.equal(typeof mod.constructWebhookEvent, 'function');
});
