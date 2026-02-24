import {
  APIError,
  APIException,
  VerificationException,
} from '@apple/app-store-server-library';
import { getAppStoreClientBundle } from './client';

export type AppStoreVerifyEnvironment = 'sandbox' | 'production';

export type VerifiedAppStoreTransaction = {
  productId: string;
  originalTransactionId: string;
  latestTransactionId: string;
  environment: AppStoreVerifyEnvironment;
  currentPeriodEnd: string | null;
};

export class AppStoreVerifyInputError extends Error {}
export class AppStoreSignatureVerificationError extends Error {}
export class AppStoreUpstreamTemporaryError extends Error {}

function normalizeEnvironment(raw: string | null | undefined): AppStoreVerifyEnvironment | null {
  const value = raw?.trim().toLowerCase();
  if (value === 'sandbox') return 'sandbox';
  if (value === 'production') return 'production';
  return null;
}

function normalizeTransactionEnvironment(raw: unknown): AppStoreVerifyEnvironment | null {
  if (typeof raw !== 'string') return null;
  if (raw === 'Sandbox') return 'sandbox';
  if (raw === 'Production') return 'production';
  return normalizeEnvironment(raw);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppStoreVerifyInputError(`Missing required transaction field: ${field}`);
  }
  return value.trim();
}

function toPeriodEndIso(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return new Date(value).toISOString();
}

function isRetryableApiError(error: APIException): boolean {
  return error.httpStatusCode >= 500 || error.httpStatusCode === 429;
}

export function isAllowedAppStoreProduct(productId: string, allowedProductIds: string[]): boolean {
  return allowedProductIds.includes(productId);
}

export async function verifyAppStoreTransaction(
  transactionId: string
): Promise<VerifiedAppStoreTransaction> {
  const normalizedTransactionId = transactionId.trim();
  if (!normalizedTransactionId) {
    throw new AppStoreVerifyInputError('transactionId is required');
  }

  const { apiClient, verifier } = getAppStoreClientBundle();

  let signedTransactionInfo: string;
  try {
    const response = await apiClient.getTransactionInfo(normalizedTransactionId);
    signedTransactionInfo = requireString(response.signedTransactionInfo, 'signedTransactionInfo');
  } catch (error) {
    if (error instanceof AppStoreVerifyInputError) {
      throw error;
    }

    if (error instanceof APIException) {
      if (
        error.apiError === APIError.INVALID_TRANSACTION_ID ||
        error.httpStatusCode === 400 ||
        error.httpStatusCode === 404
      ) {
        throw new AppStoreVerifyInputError('Invalid transactionId');
      }

      if (isRetryableApiError(error)) {
        throw new AppStoreUpstreamTemporaryError('Apple API is temporarily unavailable');
      }
    }

    throw new AppStoreUpstreamTemporaryError('Failed to fetch transaction from Apple');
  }

  try {
    const decoded = await verifier.verifyAndDecodeTransaction(signedTransactionInfo);
    const productId = requireString(decoded.productId, 'productId');
    const originalTransactionId = requireString(
      decoded.originalTransactionId,
      'originalTransactionId'
    );
    const latestTransactionId = requireString(decoded.transactionId, 'transactionId');
    const environment = normalizeTransactionEnvironment(decoded.environment);

    if (!environment) {
      throw new AppStoreVerifyInputError('Invalid transaction environment');
    }

    return {
      productId,
      originalTransactionId,
      latestTransactionId,
      environment,
      currentPeriodEnd: toPeriodEndIso(decoded.expiresDate),
    };
  } catch (error) {
    if (error instanceof AppStoreVerifyInputError) {
      throw error;
    }
    if (error instanceof VerificationException) {
      throw new AppStoreSignatureVerificationError('Signed transaction verification failed');
    }
    throw new AppStoreSignatureVerificationError('Failed to decode signed transaction');
  }
}

