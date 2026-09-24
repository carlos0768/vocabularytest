'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, ReactNode } from 'react';
import { THEME_COLORS, THEME_STORAGE_KEY } from '@/components/theme-script';

type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: ResolvedTheme;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const DARK_QUERY = '(prefers-color-scheme: dark)';

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

/* ---- stored preference, as an external store ----
 * localStorage is external state, so it is read through useSyncExternalStore
 * rather than copied into state from an effect. That keeps the server snapshot
 * ('system') separate from the client's real value without a render-then-patch
 * pass, and a `storage` event keeps other tabs in sync for free. */

const listeners = new Set<() => void>();

// Fallback when localStorage throws (Instagram/LINE in-app WebViews block it).
// Without this the switch would silently do nothing in those browsers.
let memoryTheme: Theme = 'system';

function subscribeStored(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function getStoredTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(saved) ? saved : memoryTheme;
  } catch {
    return memoryTheme;
  }
}

const getServerTheme = (): Theme => 'system';

/* ---- OS preference, as an external store ---- */

function subscribeSystem(onChange: () => void) {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

const getSystemDark = () => window.matchMedia(DARK_QUERY).matches;
const getServerSystemDark = () => false;

/**
 * Applies the resolved theme to <html>.
 *
 * `theme-switching` suppresses every transition for one frame: many surfaces
 * animate `background`/`color` on hover, and without it the whole page animates
 * its palette at once and appears to melt when the user flips the switch.
 * ThemeScript already did this work for the first paint, so the mount-time run
 * is a no-op and never flickers.
 */
function applyResolvedTheme(isDark: boolean) {
  const root = document.documentElement;

  // Always re-assert the browser-chrome colour: hydration can reset the
  // attribute that ThemeScript set, and that happens without the class
  // changing, so this must sit outside the early return below.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', isDark ? THEME_COLORS.dark : THEME_COLORS.light);

  if (root.classList.contains('dark') === isDark) return;

  root.classList.add('theme-switching');
  root.classList.toggle('dark', isDark);
  root.style.colorScheme = isDark ? 'dark' : 'light';

  // Two frames: one for the class flip to land, one to paint it.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => root.classList.remove('theme-switching'));
  });
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribeStored, getStoredTheme, getServerTheme);
  const systemDark = useSyncExternalStore(subscribeSystem, getSystemDark, getServerSystemDark);

  const resolvedTheme: ResolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    applyResolvedTheme(resolvedTheme === 'dark');
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    memoryTheme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Preference stays in memory for this session only.
    }
    listeners.forEach((listener) => listener());
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, resolvedTheme }),
    [theme, setTheme, resolvedTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
