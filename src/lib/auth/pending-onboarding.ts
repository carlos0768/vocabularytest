import type { EikenLevelOption, OnboardingData } from '@/lib/auth/signup-flow';

/**
 * OAuth signups leave the signup page before the onboarding profile
 * (display name / handle / eiken level) can be sent to the server, so we
 * stash it in sessionStorage right before the provider redirect and flush
 * it to POST /api/onboarding/profile once the session is established.
 */
const STORAGE_KEY = 'merken_pending_onboarding';

const EIKEN_LEVELS: readonly EikenLevelOption[] = ['5', '4', '3', 'pre2', '2', 'pre1', '1', null];

function isOnboardingData(value: unknown): value is OnboardingData {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.displayName === 'string'
    && typeof record.userHandle === 'string'
    && EIKEN_LEVELS.includes((record.eikenLevel ?? null) as EikenLevelOption);
}

export function storePendingOnboarding(data: OnboardingData): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      displayName: data.displayName.trim(),
      userHandle: data.userHandle,
      eikenLevel: data.eikenLevel,
    }));
  } catch {
    // Storage unavailable (private mode, quota) — OAuth signup proceeds without it.
  }
}

export function readPendingOnboarding(): OnboardingData | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isOnboardingData(parsed)) return null;
    return {
      displayName: parsed.displayName,
      userHandle: parsed.userHandle,
      eikenLevel: parsed.eikenLevel ?? null,
    };
  } catch {
    return null;
  }
}

export function clearPendingOnboarding(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
