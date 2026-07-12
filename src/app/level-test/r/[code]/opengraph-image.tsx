import { ImageResponse } from 'next/og';
import { EIKEN_LEVEL_LABELS } from '@/lib/level-test/engine';
import { decodeLevelTestResult } from '@/lib/level-test/result-code';
import { vocabSizeTextFor } from '@/lib/level-test/share';

// 診断結果の動的シェアカード(OG/Twitter)。結果はURLのcodeから復元するので
// DBアクセスなし。share/[shareId]/opengraph-image.tsx と同じ構成で、
// loadJapaneseFont(グリフサブセット読込)もそのまま踏襲している。

export const runtime = 'nodejs';
export const alt = 'MERKEN 語彙レベル診断の結果';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const INK = '#1a1a1a';

// レベルが上がるほど「昇格」感の出る色(結果カードと同じ並び)。
const LEVEL_ACCENTS = ['#228B22', '#15803d', '#137FEC', '#2E66BF', '#664DB3', '#7C3AED', '#B8860B'];

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

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const payload = decodeLevelTestResult(decodeURIComponent(code));

  const grade = payload ? EIKEN_LEVEL_LABELS[payload.finalLevel] : null;
  const vocab = payload ? vocabSizeTextFor(payload) : null;
  const accent = payload ? LEVEL_ACCENTS[payload.finalLevel] : LEVEL_ACCENTS[2];
  const crowned = Boolean(payload?.clearedMax);

  const glyphText = [
    'MERKEN VOCABULARY LEVEL TEST 単語レベル診断 語彙力は英検何級レベル? 私の語彙レベル 推定語彙数 語 レベル 最高レベル完全制覇 あなたも20問でサクッと診断 merken.jp/level-test →',
    grade ?? '',
    vocab ?? '',
    EIKEN_LEVEL_LABELS.join(''),
    '0123456789,',
  ].join('');
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
          padding: '64px 80px',
          background: `linear-gradient(135deg, ${accent} 0%, ${INK} 165%)`,
          color: '#ffffff',
          fontFamily: 'NotoSansJP, sans-serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, letterSpacing: 8, opacity: 0.85 }}>
          MERKEN · 単語レベル診断
        </div>

        {grade && vocab ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 48 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', fontSize: 36, fontWeight: 700, opacity: 0.9 }}>
                {crowned ? '最高レベル完全制覇' : '私の語彙レベル'}
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, marginTop: 4 }}>
                <div style={{ display: 'flex', fontSize: 136, fontWeight: 700, lineHeight: 1.05 }}>
                  {grade}
                </div>
                <div style={{ display: 'flex', fontSize: 44, fontWeight: 700, opacity: 0.85, paddingBottom: 16 }}>
                  レベル
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignSelf: 'flex-start',
                  marginTop: 24,
                  fontSize: 40,
                  fontWeight: 700,
                  padding: '14px 34px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.18)',
                  border: '4px solid rgba(255,255,255,0.6)',
                }}
              >
                推定語彙数 {vocab}語
              </div>
            </div>

            {/* 7段階レベルメーター */}
            <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 12, flexShrink: 0 }}>
              {EIKEN_LEVEL_LABELS.map((label, levelIndex) => {
                const reached = payload!.finalLevel >= levelIndex;
                return (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div
                      style={{
                        display: 'flex',
                        width: 150,
                        height: 34,
                        borderRadius: 10,
                        border: '3px solid rgba(255,255,255,0.75)',
                        background: reached ? '#ffffff' : 'rgba(255,255,255,0.12)',
                      }}
                    />
                    <div
                      style={{
                        display: 'flex',
                        fontSize: 24,
                        fontWeight: 700,
                        opacity: levelIndex === payload!.finalLevel ? 1 : 0.55,
                        width: 130,
                      }}
                    >
                      {label.replace('英検', '')}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 96, fontWeight: 700, lineHeight: 1.15 }}>
              語彙力は
            </div>
            <div style={{ display: 'flex', fontSize: 96, fontWeight: 700, lineHeight: 1.15 }}>
              英検何級レベル?
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, opacity: 0.9 }}>
            あなたも20問でサクッと診断 →
          </div>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, opacity: 0.75 }}>
            merken.jp/level-test
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
