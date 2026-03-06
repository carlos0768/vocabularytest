const DEFAULT_WEB_APP_URL = 'https://vocabularytest-gamma.vercel.app';

export const WEB_APP_BASE_URL = (
  process.env.EXPO_PUBLIC_WEB_APP_URL || DEFAULT_WEB_APP_URL
).replace(/\/+$/, '');

export function withWebAppBase(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${WEB_APP_BASE_URL}${normalizedPath}`;
}
