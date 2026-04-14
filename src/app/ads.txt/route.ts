import { ADSENSE_ADS_TXT_LINE } from '@/lib/adsense';

export function GET() {
  return new Response(`${ADSENSE_ADS_TXT_LINE}\n`, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
