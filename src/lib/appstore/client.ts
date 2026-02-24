import {
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
} from '@apple/app-store-server-library';
import { getAppStoreConfig, type AppStoreEnvironment } from './config';

type AppStoreClientBundle = {
  apiClient: AppStoreServerAPIClient;
  verifier: SignedDataVerifier;
};

let cachedBundle: AppStoreClientBundle | null = null;
let cachedKey: string | null = null;

// Apple Root CA - G3 (DER, base64)
// Source: Apple PKI (used by App Store Server signed payload chain).
const APPLE_ROOT_CA_G3_DER_BASE64 =
  'MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==';

function toAppleEnvironment(value: AppStoreEnvironment): Environment {
  return value === 'sandbox' ? Environment.SANDBOX : Environment.PRODUCTION;
}

function toCacheKey(config: ReturnType<typeof getAppStoreConfig>): string {
  return [
    config.issuerId,
    config.keyId,
    config.privateKey,
    config.bundleId,
    config.environment,
    config.appAppleId ?? '',
  ].join('|');
}

export function getAppStoreClientBundle(): AppStoreClientBundle {
  const config = getAppStoreConfig();
  const key = toCacheKey(config);
  if (cachedBundle && cachedKey === key) {
    return cachedBundle;
  }

  const environment = toAppleEnvironment(config.environment);
  const appAppleId = config.environment === 'production' ? config.appAppleId : undefined;
  const rootCertificates = [Buffer.from(APPLE_ROOT_CA_G3_DER_BASE64, 'base64')];

  cachedBundle = {
    apiClient: new AppStoreServerAPIClient(
      config.privateKey,
      config.keyId,
      config.issuerId,
      config.bundleId,
      environment
    ),
    verifier: new SignedDataVerifier(
      rootCertificates,
      true,
      environment,
      config.bundleId,
      appAppleId
    ),
  };
  cachedKey = key;
  return cachedBundle;
}

export function resetAppStoreClientCacheForTests() {
  cachedBundle = null;
  cachedKey = null;
}

