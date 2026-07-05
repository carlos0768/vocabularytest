'use client';

import { useEffect } from 'react';

/**
 * Overrides the app-wide `--color-background` CSS variable while the page is
 * mounted. Pages that paint their own tinted background (e.g. the cream
 * onboarding shell) need this so the body and the fixed StatusBarCover —
 * both painted with `var(--color-background)` — match the page instead of
 * showing a white band behind the status bar / notch.
 */
export function usePageBackground(color: string) {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.getPropertyValue('--color-background');
    root.style.setProperty('--color-background', color);
    return () => {
      if (previous) {
        root.style.setProperty('--color-background', previous);
      } else {
        root.style.removeProperty('--color-background');
      }
    };
  }, [color]);
}
