/**
 * Blocking theme bootstrap.
 *
 * ThemeProvider can only apply the theme from an effect, i.e. after the first
 * paint — so a dark-mode user would see a full-brightness flash of the light
 * theme on every cold load. This runs synchronously in <head>, before the body
 * is painted, and sets the same class ThemeProvider would have set.
 *
 * Keep the storage key and the resolution rules in sync with
 * `src/components/theme-provider.tsx`. The <meta name="theme-color"> tag it
 * rewrites is rendered by `viewport.themeColor` in the root layout — creating
 * one here instead would be removed again by hydration.
 */

export const THEME_STORAGE_KEY = 'scanvocab_theme';

/** Browser chrome / PWA status bar colour per resolved theme. */
export const THEME_COLORS = {
  light: '#f6f5f1',
  dark: '#131211',
} as const;

// Stringified rather than referenced so it can run before any bundle loads.
const script = `(function(){try{
var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
var t=(s==='light'||s==='dark'||s==='system')?s:'system';
var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
var r=document.documentElement;
r.classList.toggle('dark',d);
r.style.colorScheme=d?'dark':'light';
var m=document.querySelector('meta[name="theme-color"]');
if(m){m.setAttribute('content',d?${JSON.stringify(THEME_COLORS.dark)}:${JSON.stringify(THEME_COLORS.light)});}
}catch(e){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
