import { ImageResponse } from 'next/og';
import { profileAvatarColor } from '@/lib/profile/avatar-color';
import { fitProfileShareName, type ProfileSharePreview } from '@/lib/profile/share';

// プロフィールのシェアカード(OG/Twitter)の描画。アプリ本体の「ソリッド」デザイン
// (生成りの背景・墨色の太枠・ずらした影・角丸)をそのまま 1200x630 に写す。
// preview が null(鍵アカウント・見つからない ID)なら個人情報を載せない汎用カード。
// DB を読まないので、データを差し込んで見た目だけ確かめることもできる。

export const PROFILE_SHARE_IMAGE_SIZE = { width: 1200, height: 630 };

// globals.css のライトテーマのトークンと同じ値
const INK = '#1a1a1a';
const BACKGROUND = '#f6f5f1';
const SURFACE = '#ffffff';
const MUTED = '#6b6b6b';

const STAT_TINTS = {
  streak: '#FFF1DB',
  words: '#E7F0FD',
  mastered: '#E3F3E8',
} as const;

// 描画するグリフだけを Google Fonts からサブセットで読む
// (share/[shareId] などの opengraph-image と同じ方式)。
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

function StatTile({ label, value, unit, tint }: { label: string; value: number; unit: string; tint: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        padding: '16px 22px',
        borderRadius: 22,
        border: `4px solid ${INK}`,
        background: tint,
      }}
    >
      <div style={{ display: 'flex', fontSize: 22, fontWeight: 700, color: MUTED }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginTop: 2 }}>
        <div style={{ display: 'flex', fontSize: 48, fontWeight: 700, color: INK, lineHeight: 1.1 }}>
          {value.toLocaleString('ja-JP')}
        </div>
        <div style={{ display: 'flex', fontSize: 24, fontWeight: 700, color: INK, paddingBottom: 8 }}>{unit}</div>
      </div>
    </div>
  );
}

function ProfileCard({ preview }: { preview: ProfileSharePreview }) {
  const color = profileAvatarColor(preview.accountId);
  const initial = (Array.from(preview.name.replace(/^@/, ''))[0] ?? '?').toUpperCase();
  const fitted = fitProfileShareName(preview.name);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 48, flex: 1 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 208,
          height: 208,
          flexShrink: 0,
          borderRadius: 48,
          border: `5px solid ${INK}`,
          background: color,
          color: SURFACE,
          fontSize: 112,
          fontWeight: 700,
          overflow: 'hidden',
        }}
      >
        {preview.avatarUrl ? (
          // satori(ImageResponse)は next/image を描けないので素の <img> を使う
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview.avatarUrl} alt="" width={208} height={208} style={{ objectFit: 'cover' }} />
        ) : (
          initial
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', fontSize: fitted.fontSize, fontWeight: 700, color: INK, lineHeight: 1.1 }}>
          {fitted.text}
        </div>
        <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: MUTED, marginTop: 6 }}>
          @{preview.accountId}
        </div>
        <div style={{ display: 'flex', gap: 18, marginTop: 26 }}>
          <StatTile label="連続学習" value={preview.streakDays} unit="日" tint={STAT_TINTS.streak} />
          <StatTile label="単語数" value={preview.totalWords} unit="語" tint={STAT_TINTS.words} />
          <StatTile label="習得済み" value={preview.masteredWords} unit="語" tint={STAT_TINTS.mastered} />
        </div>
      </div>
    </div>
  );
}

function GenericCard() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, flex: 1 }}>
      <div style={{ display: 'flex', fontSize: 72, fontWeight: 700, color: INK, lineHeight: 1.15 }}>
        一緒に英単語を覚えよう
      </div>
      <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, color: MUTED }}>
        写真から単語帳を作って、クイズで定着させる英単語アプリ
      </div>
    </div>
  );
}

export async function renderProfileShareImage(preview: ProfileSharePreview | null): Promise<ImageResponse> {
  const glyphText = [
    '@ 連続学習日単語数語習得済み 一緒に英単語を覚えよう 写真から単語帳を作って、クイズで定着させる英単語アプリ merken.jp',
    '0123456789,…?',
    preview ? `${preview.name}${preview.accountId}${fitProfileShareName(preview.name).text}` : '',
    preview ? preview.name.toUpperCase() : '',
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
          justifyContent: 'center',
          position: 'relative',
          padding: '0 72px',
          background: BACKGROUND,
          color: INK,
          fontFamily: 'NotoSansJP, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            padding: '56px 56px',
            borderRadius: 40,
            border: `5px solid ${INK}`,
            background: SURFACE,
            boxShadow: `12px 14px 0 ${INK}`,
          }}
        >
          {preview ? <ProfileCard preview={preview} /> : <GenericCard />}
        </div>

        <div style={{ position: 'absolute', right: 72, bottom: 40, display: 'flex' }}>
          <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, color: MUTED }}>merken.jp</div>
        </div>
      </div>
    ),
    {
      ...PROFILE_SHARE_IMAGE_SIZE,
      fonts: fontData ? [{ name: 'NotoSansJP', data: fontData, weight: 700, style: 'normal' }] : undefined,
    },
  );
}
