const configuredBaseUrl = (
  process.env.EXPO_PUBLIC_APP_URL
  || process.env.EXPO_PUBLIC_WEB_APP_URL
  || ''
).trim();

export const WEB_APP_BASE_URL =
  configuredBaseUrl.length > 0 ? configuredBaseUrl.replace(/\/+$/, '') : null;

export function withWebAppBase(path: string): string {
  if (!WEB_APP_BASE_URL) {
    throw new Error('EXPO_PUBLIC_APP_URL is not configured.');
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${WEB_APP_BASE_URL}${normalizedPath}`;
}
