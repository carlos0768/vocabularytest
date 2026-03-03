import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AppStoreNotificationSignatureError,
  type NormalizedAppStoreNotification,
} from '@/lib/appstore/notifications';
import { __internal, handleAppStoreNotificationRequest } from './route';

type StubDeps = Parameters<typeof handleAppStoreNotificationRequest>[1];

const baseNotification: NormalizedAppStoreNotification = {
  notificationType: 'DID_RENEW',
  subtype: null,
  notificationUUID: 'uuid-1',
  originalTransactionId: 'orig-1',
  latestTransactionId: 'latest-1',
  productId: 'com.example.merken.pro.monthly',
  environment: 'sandbox',
  expiresAt: '2026-12-31T00:00:00.000Z',
  gracePeriodExpiresAt: null,
  autoRenewStatus: 'on',
  isInBillingRetryPeriod: false,
  revocationDate: null,
};

function createRequest(body: string): Request {
  return new Request('https://example.com/api/subscription/appstore/notifications', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body,
  });
}

function createDeps(overrides: Partial<StubDeps> = {}): StubDeps {
  const supabaseStub = {} as SupabaseClient;
  return {
    createSupabaseAdmin: () => supabaseStub,
    getAllowedProductIds: () => ['com.example.merken.pro.monthly'],
    verifyAndNormalizeNotification: async () => baseNotification,
    hashPayloadFn: () => 'payload-hash',
    claimWebhookEventFn: async () => ({ shouldProcess: true }),
    markWebhookEventProcessedFn: async () => {},
    markWebhookEventFailedFn: async () => {},
    findSubscriptionByOriginalTransactionIdFn: async () => ({
      user_id: 'user-1',
      current_period_end: '2026-03-01T00:00:00.000Z',
    }),
    updateSubscriptionByOriginalTransactionIdFn: async () => {},
    now: () => new Date('2026-03-01T00:00:00.000Z'),
    ...overrides,
  };
}

test('EXPIRED maps to cancelled transition', () => {
  const transition = __internal.resolveSubscriptionTransition(
    { ...baseNotification, notificationType: 'EXPIRED' },
    '2026-12-31T00:00:00.000Z',
    new Date('2026-03-01T00:00:00.000Z')
  );

  assert.deepEqual(transition, {
    status: 'cancelled',
    cancelAtPeriodEnd: false,
    cancelRequestedAt: null,
  });
});

test('DID_FAIL_TO_RENEW remains active when within entitlement period', () => {
  const transition = __internal.resolveSubscriptionTransition(
    {
      ...baseNotification,
      notificationType: 'DID_FAIL_TO_RENEW',
      expiresAt: '2026-03-10T00:00:00.000Z',
      gracePeriodExpiresAt: null,
    },
    null,
    new Date('2026-03-01T00:00:00.000Z')
  );

  assert.equal(transition?.status, 'active');
});

test('DID_FAIL_TO_RENEW becomes cancelled after entitlement period', () => {
  const transition = __internal.resolveSubscriptionTransition(
    {
      ...baseNotification,
      notificationType: 'DID_FAIL_TO_RENEW',
      expiresAt: '2026-02-10T00:00:00.000Z',
      gracePeriodExpiresAt: null,
    },
    null,
    new Date('2026-03-01T00:00:00.000Z')
  );

  assert.equal(transition?.status, 'cancelled');
});

test('AUTO_RENEW_DISABLED sets cancel_at_period_end', () => {
  const transition = __internal.resolveSubscriptionTransition(
    {
      ...baseNotification,
      notificationType: 'DID_CHANGE_RENEWAL_STATUS',
      subtype: 'AUTO_RENEW_DISABLED',
    },
    baseNotification.expiresAt,
    new Date('2026-03-01T00:00:00.000Z')
  );

  assert.equal(transition?.status, 'active');
  assert.equal(transition?.cancelAtPeriodEnd, true);
  assert.equal(typeof transition?.cancelRequestedAt, 'string');
});

test('returns 400 for invalid JSON', async () => {
  const response = await handleAppStoreNotificationRequest(createRequest('{'));
  assert.equal(response.status, 400);
});

test('returns 400 when signedPayload is missing', async () => {
  const response = await handleAppStoreNotificationRequest(createRequest('{}'));
  assert.equal(response.status, 400);
});

test('returns 401 when signature verification fails', async () => {
  const response = await handleAppStoreNotificationRequest(
    createRequest('{"signedPayload":"signed"}'),
    createDeps({
      verifyAndNormalizeNotification: async () => {
        throw new AppStoreNotificationSignatureError('invalid signature');
      },
    })
  );
  assert.equal(response.status, 401);
});

test('returns 200 for duplicate claim without processing', async () => {
  let processedCalled = false;
  const response = await handleAppStoreNotificationRequest(
    createRequest('{"signedPayload":"signed"}'),
    createDeps({
      claimWebhookEventFn: async () => ({ shouldProcess: false }),
      markWebhookEventProcessedFn: async () => {
        processedCalled = true;
      },
    })
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as { success: boolean; duplicate?: boolean };
  assert.equal(body.success, true);
  assert.equal(body.duplicate, true);
  assert.equal(processedCalled, false);
});

test('returns 200 and no-op for disallowed product', async () => {
  let processedCalled = false;
  let failedCalled = false;
  const response = await handleAppStoreNotificationRequest(
    createRequest('{"signedPayload":"signed"}'),
    createDeps({
      verifyAndNormalizeNotification: async () => ({
        ...baseNotification,
        productId: 'com.example.other',
      }),
      markWebhookEventProcessedFn: async () => {
        processedCalled = true;
      },
      markWebhookEventFailedFn: async () => {
        failedCalled = true;
      },
    })
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as { outcome: string };
  assert.equal(body.outcome, 'ignored_product');
  assert.equal(processedCalled, true);
  assert.equal(failedCalled, false);
});

test('returns 500 and marks failed when subscription row is missing', async () => {
  let failedCalled = false;
  const response = await handleAppStoreNotificationRequest(
    createRequest('{"signedPayload":"signed"}'),
    createDeps({
      findSubscriptionByOriginalTransactionIdFn: async () => null,
      markWebhookEventFailedFn: async () => {
        failedCalled = true;
      },
    })
  );

  assert.equal(response.status, 500);
  assert.equal(failedCalled, true);
});

test('returns 200 and updates subscription for valid notification', async () => {
  let updateCalled = false;
  let processedCalled = false;
  const response = await handleAppStoreNotificationRequest(
    createRequest('{"signedPayload":"signed"}'),
    createDeps({
      updateSubscriptionByOriginalTransactionIdFn: async () => {
        updateCalled = true;
      },
      markWebhookEventProcessedFn: async () => {
        processedCalled = true;
      },
    })
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as { success: boolean; outcome: string };
  assert.equal(body.success, true);
  assert.equal(body.outcome, 'updated');
  assert.equal(updateCalled, true);
  assert.equal(processedCalled, true);
});
