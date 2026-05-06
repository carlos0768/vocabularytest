'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { useAuth } from '@/hooks/use-auth';

export type OnboardingStep = 'signed_up' | 'first_scan_done' | 'completed' | 'skipped';

const STORAGE_PREFIX = 'merken_onboarding_step';
const SEEN_USERS_KEY = 'merken_onboarding_seen_users';
const STEP_CHANGE_EVENT = 'merken:onboarding-step-change';

function storageKey(userId: string | null): string {
  return userId ? `${STORAGE_PREFIX}_${userId}` : `${STORAGE_PREFIX}_guest`;
}

function readStep(userId: string | null): OnboardingStep | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw === 'signed_up' || raw === 'first_scan_done' || raw === 'completed' || raw === 'skipped') {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

function writeStep(userId: string | null, step: OnboardingStep) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey(userId), step);
    window.dispatchEvent(new CustomEvent(STEP_CHANGE_EVENT, { detail: { userId } }));
  } catch {
    /* ignore */
  }
}

function hasSeenUser(userId: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = localStorage.getItem(SEEN_USERS_KEY);
    if (!raw) return false;
    const list = JSON.parse(raw) as string[];
    return Array.isArray(list) && list.includes(userId);
  } catch {
    return false;
  }
}

function markUserSeen(userId: string) {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(SEEN_USERS_KEY);
    const list: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (!list.includes(userId)) {
      list.push(userId);
      localStorage.setItem(SEEN_USERS_KEY, JSON.stringify(list));
    }
  } catch {
    /* ignore */
  }
}

function subscribeStep(userId: string | null, callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const key = storageKey(userId);
  const onCustom = (event: Event) => {
    const detail = (event as CustomEvent<{ userId: string | null }>).detail;
    if (!detail || detail.userId === userId) callback();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === key) callback();
  };
  window.addEventListener(STEP_CHANGE_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(STEP_CHANGE_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}

interface UseOnboardingResult {
  step: OnboardingStep | null;
  loading: boolean;
  setStep: (next: OnboardingStep) => void;
  /**
   * Mark this user as a known device-existing user without changing the step.
   * Used by the home page after determining whether the user already has
   * projects (= legacy user, not new).
   */
  markCompletedSilently: () => void;
}

/**
 * Hook for reading and writing onboarding step from localStorage.
 *
 * Frontend-only design: the canonical step lives in localStorage rather than
 * a `profiles.onboarding_step` column. Behavior:
 *
 * - If a stored step exists for this user, return it.
 * - If no stored step exists yet, the step is `null` until the caller decides
 *   whether to seed `signed_up` (new user with no projects) or
 *   `completed` (legacy user with projects).
 *
 * That bootstrap decision lives on the home page (it has the project list)
 * and is exposed via `setStep` / `markCompletedSilently`.
 */
export function useOnboarding(): UseOnboardingResult {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;

  const subscribe = useCallback((cb: () => void) => subscribeStep(userId, cb), [userId]);
  const getSnapshot = useCallback(() => readStep(userId), [userId]);
  const getServerSnapshot = useCallback((): OnboardingStep | null => null, []);

  const step = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setStep = useCallback(
    (next: OnboardingStep) => {
      writeStep(userId, next);
      if (userId) markUserSeen(userId);
    },
    [userId],
  );

  const markCompletedSilently = useCallback(() => {
    writeStep(userId, 'completed');
    if (userId) markUserSeen(userId);
  }, [userId]);

  return { step, loading: authLoading, setStep, markCompletedSilently };
}

export const onboardingInternals = {
  hasSeenUser,
  markUserSeen,
};
