import { ImageResponse } from 'next/og';
import { getPublicStudyGroupPreview } from '@/app/api/shared-projects/groups/shared';
import { groupThumbColor } from '@/lib/shared-projects/group-share';

// Dynamic share thumbnail (Open Graph / Twitter card) for a study group.
// The thumbnail is built per-group: the gradient uses the group's deterministic
// theme color and the title/stats are rendered into the image, so a link shared
// to LINE / X / Instagram / Discord previews with the actual group — not a
// generic site-wide image.

export const runtime = 'nodejs';
export const alt = 'MERKEN 学習グループ';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const INK = '#1a1a1a';

// Load a Japanese-capable font subset from Google Fonts for exactly the glyphs
// we render. Google serves TrueType (satori-compatible) to non-browser UAs, so
// we can parse the ttf url out of the CSS response.
async function loadJapaneseFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const family = 'Noto+Sans+JP:wght@700';
    const url = `https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(text)}`;
    const cssResponse = await fetch(url, {
      headers: {
        // Force a TrueType payload (satori does not support woff2).
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

export default async function Image({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;

  let name = '学習グループ';
  let memberCount: number | null = null;
  let projectCount: number | null = null;
  try {
    const group = await getPublicStudyGroupPreview(groupId);
    if (group) {
      name = group.name;
      memberCount = group.memberCount;
      projectCount = group.projectCount;
    }
  } catch (error) {
    console.warn('OGP group preview failed:', error);
  }

  const accent = groupThumbColor(groupId);
  const initial = (name.trim().charAt(0) || 'G').toUpperCase();

  // Collect every glyph we draw so the font subset covers it.
  const stats = `${memberCount ?? 0}人が参加・${projectCount ?? 0}冊の単語帳`;
  const glyphText = `MERKEN STUDY GROUP 学習グループに参加しよう一緒に英単語を覚えよう${name}${initial}${stats}人参加冊の単語帳`;
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
            MERKEN · STUDY GROUP
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
              一緒に英単語を覚えよう
            </div>
            <div
              style={{
                fontSize: name.length > 14 ? 76 : 96,
                fontWeight: 700,
                lineHeight: 1.05,
                marginTop: 8,
                // Clamp very long names to keep the layout intact.
                display: 'flex',
              }}
            >
              {name.length > 26 ? `${name.slice(0, 26)}…` : name}
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
            タップして参加 →
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
