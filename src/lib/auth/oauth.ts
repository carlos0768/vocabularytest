export const AUTH_OAUTH_PROVIDERS = ['google', 'apple'] as const;

export type AuthOAuthProvider = (typeof AUTH_OAUTH_PROVIDERS)[number];

const DEFAULT_REDIRECT_PATH = '/';

export function isAuthOAuthProvider(value: string): value is AuthOAuthProvider {
  return AUTH_OAUTH_PROVIDERS.includes(value as AuthOAuthProvider);
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

export function buildOAuthCallbackUrl(
  redirectPath: string | null | undefined,
  origin: string,
): string {
  const callbackUrl = new URL('/auth/callback', origin);
  callbackUrl.searchParams.set('next', normalizeOAuthRedirectPath(redirectPath));
  return callbackUrl.toString();
}

export function getOAuthProviderLabel(provider: AuthOAuthProvider): string {
  return provider === 'google' ? 'Google' : 'Apple';
}
