import type { SignupProfileFields, SignupProfileEikenLevel } from '@/lib/auth/signup-profile';

export const AUTH_OAUTH_PROVIDERS = ['google', 'apple'] as const;
export const OAUTH_REDIRECT_COOKIE = 'merken_oauth_next';
export const OAUTH_ONBOARDING_COOKIE = 'merken_oauth_onboarding';

export type AuthOAuthProvider = (typeof AUTH_OAUTH_PROVIDERS)[number];

const DEFAULT_REDIRECT_PATH = '/';
const EIKEN_LEVELS = new Set<SignupProfileEikenLevel>(['5', '4', '3', 'pre2', '2', 'pre1', '1']);

export function isAuthOAuthProvider(value: string): value is AuthOAuthProvider {
  return AUTH_OAUTH_PROVIDERS.includes(value as AuthOAuthProvider);
}

export function getEnabledOAuthProviders(value: string | null | undefined): AuthOAuthProvider[] {
  if (!value) return [];

  const seen = new Set<AuthOAuthProvider>();
  for (const item of value.split(',')) {
    const provider = item.trim().toLowerCase();
    if (isAuthOAuthProvider(provider)) {
      seen.add(provider);
    }
  }

  return AUTH_OAUTH_PROVIDERS.filter((provider) => seen.has(provider));
}

export function normalizeOAuthRedirectPath(value: string | null | undefined): string {
  if (!value) return DEFAULT_REDIRECT_PATH;

  const trimmed = value.trim();
  if (!trimmed.startsWith('/')) return DEFAULT_REDIRECT_PATH;
  if (trimmed.startsWith('//')) return DEFAULT_REDIRECT_PATH;

  try {
    const parsed = new URL(trimmed, 'https://example.local');
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_REDIRECT_PATH;
  }
}

export function buildOAuthCallbackUrl(origin: string): string {
  return new URL('/auth/callback', origin).toString();
}

export function buildOAuthRedirectCookie(
  redirectPath: string | null | undefined,
  secure: boolean,
): string {
  const attrs = [
    `${OAUTH_REDIRECT_COOKIE}=${encodeURIComponent(normalizeOAuthRedirectPath(redirectPath))}`,
    'Path=/',
    'Max-Age=600',
    'SameSite=Lax',
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

export function buildExpiredOAuthRedirectCookie(): string {
  return `${OAUTH_REDIRECT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function buildOAuthOnboardingCookie(
  fields: SignupProfileFields | null | undefined,
  secure: boolean,
): string {
  const payload: Record<string, string | null> = {};
  const displayName = fields?.display_name?.trim();
  const userHandle = fields?.user_handle?.trim();

  if (displayName) payload.display_name = displayName;
  if (userHandle) payload.user_handle = userHandle;
  if (fields?.eiken_level !== undefined) payload.eiken_level = fields.eiken_level;

  const attrs = [
    `${OAUTH_ONBOARDING_COOKIE}=${encodeURIComponent(JSON.stringify(payload))}`,
    'Path=/',
    'Max-Age=600',
    'SameSite=Lax',
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

export function buildExpiredOAuthOnboardingCookie(): string {
  return `${OAUTH_ONBOARDING_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function readOAuthRedirectCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;

  const cookie = cookieHeader
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${OAUTH_REDIRECT_COOKIE}=`));

  if (!cookie) return null;

  const rawValue = cookie.slice(OAUTH_REDIRECT_COOKIE.length + 1);
  try {
    return normalizeOAuthRedirectPath(decodeURIComponent(rawValue));
  } catch {
    return DEFAULT_REDIRECT_PATH;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function readOAuthOnboardingCookie(cookieHeader: string | null | undefined): SignupProfileFields | null {
  if (!cookieHeader) return null;

  const cookie = cookieHeader
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${OAUTH_ONBOARDING_COOKIE}=`));

  if (!cookie) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(cookie.slice(OAUTH_ONBOARDING_COOKIE.length + 1))) as unknown;
    if (!isRecord(parsed)) return null;

    const fields: SignupProfileFields = {};
    if (typeof parsed.display_name === 'string') {
      const displayName = parsed.display_name.trim();
      if (displayName.length >= 1 && displayName.length <= 20) {
        fields.display_name = displayName;
      }
    }
    if (typeof parsed.user_handle === 'string' && /^[a-z0-9_]{3,20}$/.test(parsed.user_handle)) {
      fields.user_handle = parsed.user_handle;
    }
    if (parsed.eiken_level === null) {
      fields.eiken_level = null;
    } else if (typeof parsed.eiken_level === 'string' && EIKEN_LEVELS.has(parsed.eiken_level as SignupProfileEikenLevel)) {
      fields.eiken_level = parsed.eiken_level as SignupProfileEikenLevel;
    }

    return Object.keys(fields).length > 0 ? fields : null;
  } catch {
    return null;
  }
}

export function getOAuthProviderLabel(provider: AuthOAuthProvider): string {
  return provider === 'google' ? 'Google' : 'Apple';
}
