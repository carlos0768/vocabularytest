export type AppStoreEnvironment = 'sandbox' | 'production';

export type AppStoreConfig = {
  issuerId: string;
  keyId: string;
  privateKey: string;
  bundleId: string;
  environment: AppStoreEnvironment;
  appAppleId?: number;
  allowedProductIds: string[];
};

let cachedConfig: AppStoreConfig | null = null;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function normalizePrivateKey(raw: string): string {
  // Vercel and .env often store multiline keys with escaped newlines.
  return raw.replace(/\\n/g, '\n').trim();
}

export function parseCsvList(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const values: string[] = [];
  for (const token of raw.split(',')) {
    const normalized = token.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    values.push(normalized);
  }
  return values;
}

function parseEnvironment(raw: string): AppStoreEnvironment {
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'sandbox') return 'sandbox';
  if (normalized === 'production') return 'production';
  throw new Error('APPLE_IAP_ENV must be either sandbox or production');
}

function parseAppAppleId(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('APPLE_IAP_APP_APPLE_ID must be a positive integer');
  }
  return parsed;
}

export function loadAppStoreConfig(): AppStoreConfig {
  const environment = parseEnvironment(requireEnv('APPLE_IAP_ENV'));
  const appAppleId = parseAppAppleId(process.env.APPLE_IAP_APP_APPLE_ID?.trim());

  if (environment === 'production' && !appAppleId) {
    throw new Error('APPLE_IAP_APP_APPLE_ID is required when APPLE_IAP_ENV=production');
  }

  const allowedProductIds = parseCsvList(process.env.IAP_PRO_PRODUCT_IDS);
  if (allowedProductIds.length === 0) {
    throw new Error('IAP_PRO_PRODUCT_IDS must include at least one product id');
  }

  return {
    issuerId: requireEnv('APPLE_IAP_ISSUER_ID'),
    keyId: requireEnv('APPLE_IAP_KEY_ID'),
    privateKey: normalizePrivateKey(requireEnv('APPLE_IAP_PRIVATE_KEY')),
    bundleId: requireEnv('APPLE_IAP_BUNDLE_ID'),
    environment,
    appAppleId,
    allowedProductIds,
  };
}

export function getAppStoreConfig(): AppStoreConfig {
  if (!cachedConfig) {
    cachedConfig = loadAppStoreConfig();
  }
  return cachedConfig;
}

export function resetAppStoreConfigCacheForTests() {
  cachedConfig = null;
}

