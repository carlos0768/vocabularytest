'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';

export type OnboardingStep = 'signed_up' | 'first_scan_done' | 'completed' | 'skipped';

interface UseOnboardingResult {
  step: OnboardingStep | null;
  loading: boolean;
  setStep: (next: OnboardingStep) => Promise<boolean>;
  refresh: () => Promise<void>;
}

function isOnboardingStep(value: unknown): value is OnboardingStep {
  return value === 'signed_up'
    || value === 'first_scan_done'
    || value === 'completed'
    || value === 'skipped';
}

export function useOnboarding(): UseOnboardingResult {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [step, setStepState] = useState<OnboardingStep | null>(null);
  const [loading, setLoading] = useState(false);
  const stepRef = useRef<OnboardingStep | null>(null);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  const refresh = useCallback(async () => {
    if (authLoading) return;
    if (!isAuthenticated || !user?.id) {
      requestSeqRef.current += 1;
      setStepState(null);
      stepRef.current = null;
      setLoading(false);
      return;
    }

    const seq = requestSeqRef.current + 1;
    requestSeqRef.current = seq;
    setLoading(true);

    try {
      const response = await fetch('/api/onboarding', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (seq !== requestSeqRef.current) return;

      if (!response.ok) {
        throw new Error('オンボーディング状態の取得に失敗しました');
      }

      const data = await response.json() as { step?: unknown };
      const next = isOnboardingStep(data.step) ? data.step : null;
      setStepState(next);
      stepRef.current = next;
    } catch (error) {
      if (seq !== requestSeqRef.current) return;
      console.error('[Onboarding] Failed to load step:', error);
      setStepState(null);
      stepRef.current = null;
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [authLoading, isAuthenticated, user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setStep = useCallback(async (next: OnboardingStep): Promise<boolean> => {
    if (!isAuthenticated || !user?.id) {
      return false;
    }

    const previous = stepRef.current;
    requestSeqRef.current += 1;
    setLoading(false);
    setStepState(next);
    stepRef.current = next;

    try {
      const response = await fetch('/api/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: next }),
      });

      if (!response.ok) {
        throw new Error('オンボーディング状態の更新に失敗しました');
      }

      const data = await response.json() as { step?: unknown };
      const confirmed = isOnboardingStep(data.step) ? data.step : next;
      setStepState(confirmed);
      stepRef.current = confirmed;
      return true;
    } catch (error) {
      console.error('[Onboarding] Failed to update step:', error);
      setStepState(previous);
      stepRef.current = previous;
      return false;
    }
  }, [isAuthenticated, user?.id]);

  return {
    step,
    loading: authLoading || loading,
    setStep,
    refresh,
  };
}
