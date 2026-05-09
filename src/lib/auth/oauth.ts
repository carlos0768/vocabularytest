export const AUTH_OAUTH_PROVIDERS = ['google', 'apple'] as const;
export const OAUTH_REDIRECT_COOKIE = 'merken_oauth_next';

export type AuthOAuthProvider = (typeof AUTH_OAUTH_PROVIDERS)[number];

const DEFAULT_REDIRECT_PATH = '/';

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

export function getOAuthProviderLabel(provider: AuthOAuthProvider): string {
  return provider === 'google' ? 'Google' : 'Apple';
}
