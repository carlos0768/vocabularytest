import Script from 'next/script';

const REWARDED_DOWNLOAD_AD_UNIT_PATH =
  process.env.NEXT_PUBLIC_GOOGLE_AD_MANAGER_REWARDED_DOWNLOAD_UNIT_PATH?.trim() ?? '';

export function GooglePublisherTagScript() {
  if (!REWARDED_DOWNLOAD_AD_UNIT_PATH) {
    return null;
  }

  return (
    <Script
      id="google-publisher-tag"
      async
      crossOrigin="anonymous"
      src="https://securepubads.g.doubleclick.net/tag/js/gpt.js"
      strategy="afterInteractive"
    />
  );
}
