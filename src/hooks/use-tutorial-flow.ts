'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { TUTORIAL_STAGES, type TutorialStage } from '@/lib/onboarding/tutorial-stage';

export type { TutorialStage };

/**
 * Cross-page onboarding flow that teaches the "view cards → take quiz" loop.
 * The stage is persisted in localStorage so it survives navigation between the
 * home, project, flashcard and quiz pages. Stages: `@/lib/onboarding/tutorial-stage`.
 */
const STORAGE_KEY = 'merken.tutorial.quiz-flow';

const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function emit() {
  for (const callback of listeners) callback();
}

function readStage(): TutorialStage | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return TUTORIAL_STAGES.includes(value as TutorialStage) ? (value as TutorialStage) : null;
  } catch {
    return null;
  }
}

export interface UseTutorialFlowResult {
  /** Current flow stage, or null when not started / during SSR. */
  stage: TutorialStage | null;
  /** Persist the next stage (call from click/callback handlers, never effects). */
  setStage: (next: TutorialStage) => void;
}

export function useTutorialFlow(): UseTutorialFlowResult {
  const stage = useSyncExternalStore(subscribe, readStage, () => null);

  const setStage = useCallback((next: TutorialStage) => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Ignore persistence failures; emit() still updates in-memory consumers.
      }
    }
    emit();
  }, []);

  return { stage, setStage };
}
