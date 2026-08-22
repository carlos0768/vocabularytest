'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, ReactNode } from 'react';
import {
  DEFAULT_THEME,
  THEME_COLOR,
  THEME_STORAGE_KEY,
  normalizeTheme,
  resolveTheme,
  type ResolvedTheme,
  type Theme,
} from '@/lib/theme';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: ResolvedTheme;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

/* ── 保存された選択 (localStorage) ────────────────────────────
 * useSyncExternalStore で読むことで、SSR は DEFAULT_THEME、クライアントは
 * 保存値、という差分を React に正しく扱わせる（useState の初期化関数で
 * localStorage を読むとハイドレーション不一致になる）。
 */

const storeListeners = new Set<() => void>();

/**
 * localStorage が使えない環境（Instagram の WebView など）用の退避先。
 * 保存はできないが、そのセッション中は切り替えが効くようにする。
 */
let memoryTheme: Theme | null = null;

function emitThemeChange() {
  for (const listener of storeListeners) listener();
}

function subscribeToStoredTheme(onStoreChange: () => void) {
  storeListeners.add(onStoreChange);
  // 別タブで変更されたときも追従する
  window.addEventListener('storage', onStoreChange);
  return () => {
    storeListeners.delete(onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

function readStoredTheme(): Theme {
  try {
    return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    // localStorage unavailable (e.g. Instagram WebView)
    return memoryTheme ?? DEFAULT_THEME;
  }
}

function readDefaultTheme(): Theme {
  return DEFAULT_THEME;
}

/* ── OS の配色設定 ──────────────────────────────────────── */

function subscribeToSystemDark(onStoreChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {};
  const mediaQuery = window.matchMedia(DARK_MEDIA_QUERY);
  mediaQuery.addEventListener('change', onStoreChange);
  return () => mediaQuery.removeEventListener('change', onStoreChange);
}

function readSystemDark(): boolean {
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(DARK_MEDIA_QUERY).matches;
}

function readSystemDarkOnServer(): boolean {
  return false;
}

/** PWA のステータスバー色を追従させる。meta が無ければ作る。 */
function syncThemeColorMeta(resolved: ResolvedTheme) {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = THEME_COLOR[resolved];
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribeToStoredTheme, readStoredTheme, readDefaultTheme);
  const systemPrefersDark = useSyncExternalStore(
    subscribeToSystemDark,
    readSystemDark,
    readSystemDarkOnServer,
  );

  const resolvedTheme = resolveTheme(theme, systemPrefersDark);

  // 実際に <html> へ反映する。初回描画分は layout.tsx の THEME_INIT_SCRIPT が
  // ハイドレーション前に済ませているので、ここは切り替え時の更新が主な仕事。
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.style.colorScheme = resolvedTheme;
    syncThemeColorMeta(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback((newTheme: Theme) => {
    memoryTheme = newTheme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {
      // localStorage unavailable (e.g. Instagram WebView)。
      // 次回起動時には戻ってしまうが、いま切り替えられないよりはよい。
    }
    emitThemeChange();
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
