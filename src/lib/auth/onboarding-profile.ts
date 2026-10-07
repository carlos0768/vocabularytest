import { normalizeOAuthRedirectPath } from '@/lib/auth/oauth';

/**
 * The onboarding profile (ユーザー名 / ユーザーID / 英検級) is normally collected
 * on the signup screens before the account exists. OAuth users can skip those
 * screens entirely — "Googleで続ける" on /login creates the account on the
 * spot, and the cookie that carries the fields from /signup through the
 * provider redirect can be lost (PWA, in-app browsers, expiry). This module
 * decides, from the profile row alone, whether a signed-in user still has to
 * go through the onboarding screens at /onboarding.
 */
export const ONBOARDING_PATH = '/onboarding';

export type OnboardingProfileRow = {
  username?: string | null;
  display_name?: string | null;
  user_handle?: string | null;
};

function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * True when the user never completed the onboarding profile. Both the name
 * and the handle are required on the signup screens, so a profile missing
 * either one has not been through them (a handle dropped because it was taken
 * mid-OAuth also lands here, which lets the user pick another one). The EIKEN
 * level is optional (未定) and therefore never a reason to ask again.
 */
export function needsOnboardingProfile(row: OnboardingProfileRow | null | undefined): boolean {
  if (!row) return true;
  const hasName = hasText(row.display_name) || hasText(row.username);
  return !hasName || !hasText(row.user_handle);
}

/** `/onboarding?next=<path>`; the destination is normalized like every OAuth redirect. */
export function buildOnboardingPath(next: string | null | undefined): string {
  const destination = normalizeOAuthRedirectPath(next);
  if (destination === '/' ) return ONBOARDING_PATH;
  return `${ONBOARDING_PATH}?next=${encodeURIComponent(destination)}`;
}

/**
 * Where to send the user once onboarding is done. Never back to /onboarding
 * itself (or an auth page), or the user would loop.
 */
export function resolveOnboardingNextPath(next: string | null | undefined): string {
  const destination = normalizeOAuthRedirectPath(next);
  if (
    destination.startsWith(ONBOARDING_PATH)
    || destination.startsWith('/login')
    || destination.startsWith('/signup')
  ) {
    return '/';
  }
  return destination;
}

const DISPLAY_NAME_MAX_LENGTH = 20;

/**
 * A display-name suggestion from the OAuth provider's profile (Google sends
 * `full_name` / `name`), trimmed to what profiles.username accepts. Only a
 * prefill — the user confirms or changes it on the onboarding screen.
 */
export function suggestDisplayNameFromMetadata(metadata: unknown): string | null {
  if (typeof metadata !== 'object' || metadata === null) return null;
  const record = metadata as Record<string, unknown>;
  for (const key of ['full_name', 'name', 'preferred_username']) {
    const value = record[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim().replace(/\s+/g, ' ');
    if (!trimmed) continue;
    return Array.from(trimmed).slice(0, DISPLAY_NAME_MAX_LENGTH).join('');
  }
  return null;
}
