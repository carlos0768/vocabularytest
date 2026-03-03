import {
  type AutoRenewStatus,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
  VerificationException,
} from '@apple/app-store-server-library';
import { getAppStoreClientBundle } from './client';

export type AppStoreNotificationEnvironment = 'sandbox' | 'production';
export type NormalizedAutoRenewStatus = 'on' | 'off' | null;

export type NormalizedAppStoreNotification = {
  notificationType: string;
  subtype: string | null;
  notificationUUID: string;
  originalTransactionId: string | null;
  latestTransactionId: string | null;
  productId: string | null;
  environment: AppStoreNotificationEnvironment | null;
  expiresAt: string | null;
  gracePeriodExpiresAt: string | null;
  autoRenewStatus: NormalizedAutoRenewStatus;
  isInBillingRetryPeriod: boolean | null;
  revocationDate: string | null;
};

export class AppStoreNotificationInputError extends Error {}
export class AppStoreNotificationSignatureError extends Error {}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function requireNonEmptyString(value: unknown, field: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new AppStoreNotificationInputError(`Missing required notification field: ${field}`);
  }
  return normalized;
}

function toIsoTimestamp(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return new Date(value).toISOString();
}

function normalizeEnvironment(value: unknown): AppStoreNotificationEnvironment | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'sandbox') return 'sandbox';
  if (normalized === 'production') return 'production';
  return null;
}

function normalizeAutoRenewStatus(value: AutoRenewStatus | number | undefined): NormalizedAutoRenewStatus {
  if (value === 1) return 'on';
  if (value === 0) return 'off';
  return null;
}

function firstNonEmptyString(...values: Array<unknown>): string | null {
  for (const value of values) {
    const normalized = normalizeOptionalString(value);
    if (normalized) return normalized;
  }
  return null;
}

type NormalizeParams = {
  notification: ResponseBodyV2DecodedPayload;
  transaction: JWSTransactionDecodedPayload | null;
  renewal: JWSRenewalInfoDecodedPayload | null;
};

export function normalizeVerifiedAppStoreNotification({
  notification,
  transaction,
  renewal,
}: NormalizeParams): NormalizedAppStoreNotification {
  const notificationType = requireNonEmptyString(notification.notificationType, 'notificationType');
  const notificationUUID = requireNonEmptyString(notification.notificationUUID, 'notificationUUID');

  const dataEnvironment = notification.data?.environment;
  const environment = normalizeEnvironment(
    transaction?.environment ?? renewal?.environment ?? dataEnvironment
  );

  return {
    notificationType,
    subtype: normalizeOptionalString(notification.subtype),
    notificationUUID,
    originalTransactionId: firstNonEmptyString(
      transaction?.originalTransactionId,
      renewal?.originalTransactionId
    ),
    latestTransactionId: normalizeOptionalString(transaction?.transactionId),
    productId: firstNonEmptyString(
      transaction?.productId,
      renewal?.autoRenewProductId,
      renewal?.productId
    ),
    environment,
    expiresAt: toIsoTimestamp(transaction?.expiresDate) ?? toIsoTimestamp(renewal?.renewalDate),
    gracePeriodExpiresAt: toIsoTimestamp(renewal?.gracePeriodExpiresDate),
    autoRenewStatus: normalizeAutoRenewStatus(renewal?.autoRenewStatus),
    isInBillingRetryPeriod:
      typeof renewal?.isInBillingRetryPeriod === 'boolean'
        ? renewal.isInBillingRetryPeriod
        : null,
    revocationDate: toIsoTimestamp(transaction?.revocationDate),
  };
}

async function decodeSignedTransaction(
  signedTransactionInfo: string
): Promise<JWSTransactionDecodedPayload> {
  const { verifier } = getAppStoreClientBundle();
  try {
    return await verifier.verifyAndDecodeTransaction(signedTransactionInfo);
  } catch (error) {
    if (error instanceof VerificationException) {
      throw new AppStoreNotificationSignatureError('Signed transaction verification failed');
    }
    throw new AppStoreNotificationSignatureError('Failed to decode signed transaction');
  }
}

async function decodeSignedRenewalInfo(
  signedRenewalInfo: string
): Promise<JWSRenewalInfoDecodedPayload> {
  const { verifier } = getAppStoreClientBundle();
  try {
    return await verifier.verifyAndDecodeRenewalInfo(signedRenewalInfo);
  } catch (error) {
    if (error instanceof VerificationException) {
      throw new AppStoreNotificationSignatureError('Signed renewal verification failed');
    }
    throw new AppStoreNotificationSignatureError('Failed to decode signed renewal info');
  }
}

export async function verifyAndNormalizeAppStoreNotification(
  signedPayload: string
): Promise<NormalizedAppStoreNotification> {
  const normalizedPayload = signedPayload.trim();
  if (!normalizedPayload) {
    throw new AppStoreNotificationInputError('signedPayload is required');
  }

  const { verifier } = getAppStoreClientBundle();
  let decodedNotification: ResponseBodyV2DecodedPayload;
  try {
    decodedNotification = await verifier.verifyAndDecodeNotification(normalizedPayload);
  } catch (error) {
    if (error instanceof VerificationException) {
      throw new AppStoreNotificationSignatureError('Notification signature verification failed');
    }
    throw new AppStoreNotificationSignatureError('Failed to decode signed notification');
  }

  const signedTransactionInfo = normalizeOptionalString(decodedNotification.data?.signedTransactionInfo);
  const signedRenewalInfo = normalizeOptionalString(decodedNotification.data?.signedRenewalInfo);

  const transaction = signedTransactionInfo
    ? await decodeSignedTransaction(signedTransactionInfo)
    : null;
  const renewal = signedRenewalInfo
    ? await decodeSignedRenewalInfo(signedRenewalInfo)
    : null;

  return normalizeVerifiedAppStoreNotification({
    notification: decodedNotification,
    transaction,
    renewal,
  });
}

export const __internal = {
  normalizeAutoRenewStatus,
  normalizeEnvironment,
  normalizeOptionalString,
  normalizeVerifiedAppStoreNotification,
  toIsoTimestamp,
};
