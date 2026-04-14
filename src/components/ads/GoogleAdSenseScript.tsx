import Script from 'next/script';
import { ADSENSE_CLIENT_ID } from '@/lib/adsense';

export function GoogleAdSenseScript() {
  if (!ADSENSE_CLIENT_ID) {
    return null;
  }

  return (
    <Script
      id="google-adsense"
      async
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`}
      strategy="afterInteractive"
    />
  );
}
