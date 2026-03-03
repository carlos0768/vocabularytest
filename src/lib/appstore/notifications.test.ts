import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __internal,
  AppStoreNotificationInputError,
  type NormalizedAppStoreNotification,
} from './notifications';

function normalize(input: {
  notification: Record<string, unknown>;
  transaction?: Record<string, unknown> | null;
  renewal?: Record<string, unknown> | null;
}): NormalizedAppStoreNotification {
  return __internal.normalizeVerifiedAppStoreNotification({
    notification: input.notification as never,
    transaction: (input.transaction ?? null) as never,
    renewal: (input.renewal ?? null) as never,
  });
}

test('normalize notification with transaction and renewal payloads', () => {
  const normalized = normalize({
    notification: {
      notificationType: 'DID_RENEW',
      subtype: 'BILLING_RECOVERY',
      notificationUUID: 'uuid-1',
      data: {
        environment: 'Sandbox',
      },
    },
    transaction: {
      originalTransactionId: 'orig-tx',
      transactionId: 'latest-tx',
      productId: 'com.example.merken.pro.monthly',
      environment: 'Production',
      expiresDate: 1_800_000_000_000,
    },
    renewal: {
      originalTransactionId: 'orig-renew',
      gracePeriodExpiresDate: 1_800_000_100_000,
      renewalDate: 1_800_000_200_000,
      autoRenewStatus: 1,
      isInBillingRetryPeriod: true,
    },
  });

  assert.equal(normalized.notificationType, 'DID_RENEW');
  assert.equal(normalized.subtype, 'BILLING_RECOVERY');
  assert.equal(normalized.notificationUUID, 'uuid-1');
  assert.equal(normalized.originalTransactionId, 'orig-tx');
  assert.equal(normalized.latestTransactionId, 'latest-tx');
  assert.equal(normalized.productId, 'com.example.merken.pro.monthly');
  assert.equal(normalized.environment, 'production');
  assert.equal(normalized.expiresAt, new Date(1_800_000_000_000).toISOString());
  assert.equal(normalized.gracePeriodExpiresAt, new Date(1_800_000_100_000).toISOString());
  assert.equal(normalized.autoRenewStatus, 'on');
  assert.equal(normalized.isInBillingRetryPeriod, true);
});

test('normalize notification with renewal-only payload', () => {
  const normalized = normalize({
    notification: {
      notificationType: 'DID_FAIL_TO_RENEW',
      subtype: 'GRACE_PERIOD',
      notificationUUID: 'uuid-2',
    },
    renewal: {
      originalTransactionId: 'orig-renew',
      autoRenewProductId: 'com.example.merken.pro.monthly',
      environment: 'Sandbox',
      renewalDate: 1_700_000_000_000,
      autoRenewStatus: 0,
      isInBillingRetryPeriod: false,
    },
  });

  assert.equal(normalized.originalTransactionId, 'orig-renew');
  assert.equal(normalized.latestTransactionId, null);
  assert.equal(normalized.productId, 'com.example.merken.pro.monthly');
  assert.equal(normalized.environment, 'sandbox');
  assert.equal(normalized.expiresAt, new Date(1_700_000_000_000).toISOString());
  assert.equal(normalized.autoRenewStatus, 'off');
  assert.equal(normalized.isInBillingRetryPeriod, false);
});

test('throws when notificationType is missing', () => {
  assert.throws(
    () =>
      normalize({
        notification: {
          notificationUUID: 'uuid-3',
        },
      }),
    AppStoreNotificationInputError
  );
});

test('throws when notificationUUID is missing', () => {
  assert.throws(
    () =>
      normalize({
        notification: {
          notificationType: 'TEST',
        },
      }),
    AppStoreNotificationInputError
  );
});
