const DEFAULT_ADSENSE_CLIENT_ID = 'ca-pub-5392409913204760';

function normalizeClientId(value?: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('ca-pub-') ? trimmed : `ca-pub-${trimmed}`;
}

export const ADSENSE_CLIENT_ID =
  normalizeClientId(process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_CLIENT_ID) ||
  DEFAULT_ADSENSE_CLIENT_ID;

export const ADSENSE_PUBLISHER_ID = ADSENSE_CLIENT_ID.replace(/^ca-/, '');

export const ADSENSE_ADS_TXT_LINE = `google.com, ${ADSENSE_PUBLISHER_ID}, DIRECT, f08c47fec0942fa0`;
