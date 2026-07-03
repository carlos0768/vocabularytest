import { ImageResponse } from 'next/og';
import { extractShareCode, getSharedProjectPreviewByShareCode } from '@/app/api/shared-projects/shared';
import { getSharedWordbookPreview } from '@/app/api/shared-projects/shared-wordbooks';
import { wordbookThumbColor } from '@/lib/shared-projects/group-share';

// Dynamic share thumbnail (Open Graph / Twitter card) for a shared wordbook.
// Mirrors src/app/groups/[groupId]/join/opengraph-image.tsx: the gradient
// uses the wordbook's deterministic theme color and the title/word count are
// rendered into the image, so a shared link previews with the actual
// wordbook instead of the generic site-wide image.

export const runtime = 'nodejs';
export const alt = 'MERKEN 共有単語帳';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const INK = '#1a1a1a';

async function loadJapaneseFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const family = 'Noto+Sans+JP:wght@700';
    const url = `https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(text)}`;
    const cssResponse = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/534.30 (KHTML, like Gecko)',
      },
    });
    if (!cssResponse.ok) return null;
    const css = await cssResponse.text();
    const match = css.match(/src:\s*url\(([^)]+)\)\s*format\(['"]?(?:opentype|truetype)['"]?\)/);
    if (!match) return null;
    const fontResponse = await fetch(match[1]);
    if (!fontResponse.ok) return null;
    return await fontResponse.arrayBuffer();
  } catch (error) {
    console.warn('OGP font load failed:', error);
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;

  let title = '共有単語帳';
  let wordCount: number | null = null;
  try {
    const shareCode = extractShareCode(shareId);
    if (shareCode) {
      const preview = await getSharedWordbookPreview(shareCode)
        ?? await getSharedProjectPreviewByShareCode(shareCode);
      if (preview) {
        title = preview.project.title;
        wordCount = preview.totalWordCount;
      }
    }
  } catch (error) {
    console.warn('OGP shared wordbook preview failed:', error);
  }

  const accent = wordbookThumbColor(shareId);
  const initial = (title.trim().charAt(0) || 'W').toUpperCase();

  const stats = `${wordCount ?? 0}語収録`;
  const glyphText = `MERKEN SHARED WORDBOOK 共有単語帳を見てみよう写真を撮るだけで単語帳が作れる${title}${initial}${stats}語収録`;
  const fontData = await loadJapaneseFont(glyphText);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: `linear-gradient(135deg, ${accent} 0%, ${INK} 150%)`,
          color: '#ffffff',
          fontFamily: 'NotoSansJP, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: 8,
              opacity: 0.85,
            }}
          >
            MERKEN · SHARED WORDBOOK
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 168,
              height: 168,
              borderRadius: 36,
              border: '6px solid rgba(255,255,255,0.85)',
              background: 'rgba(255,255,255,0.18)',
              fontSize: 96,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {initial}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 760 }}>
            <div style={{ fontSize: 34, fontWeight: 700, opacity: 0.85 }}>
              写真を撮るだけで単語帳が作れる
            </div>
            <div
              style={{
                fontSize: title.length > 14 ? 76 : 96,
                fontWeight: 700,
                lineHeight: 1.05,
                marginTop: 8,
                display: 'flex',
              }}
            >
              {title.length > 26 ? `${title.slice(0, 26)}…` : title}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              fontSize: 34,
              fontWeight: 700,
              padding: '18px 32px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.18)',
              border: '4px solid rgba(255,255,255,0.6)',
            }}
          >
            {stats}
          </div>
          <div style={{ fontSize: 34, fontWeight: 700, opacity: 0.9 }}>
            タップして見る →
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: fontData
        ? [{ name: 'NotoSansJP', data: fontData, weight: 700, style: 'normal' }]
        : undefined,
    },
  );
}
