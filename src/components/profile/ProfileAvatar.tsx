'use client';

import type { CSSProperties } from 'react';

/**
 * アカウントアイコンの共通表示。
 *
 * アイコン未設定のユーザーが大半なので、画像がなければ従来どおり
 * 「頭文字 + アカウントID から決まる色」のプレースホルダーを描く。
 * 画像は data URL(Supabase Storage は使わない)なので next/image ではなく
 * 素の <img> を使う。
 */
export function ProfileAvatar({
  avatarUrl,
  initial,
  color,
  size,
  radius,
  fontSize,
  borderWidth = 2,
  className,
  style,
}: {
  avatarUrl: string | null | undefined;
  /** 画像がないときに表示する頭文字。 */
  initial: string;
  /** 画像がないときの背景色(profileAvatarColor で算出)。 */
  color: string;
  size: number;
  radius: number;
  /** 頭文字のフォントサイズ。既定はサイズの 45%。 */
  fontSize?: number;
  borderWidth?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const baseStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: radius,
    border: `${borderWidth}px solid var(--solid-ink)`,
    flexShrink: 0,
    overflow: 'hidden',
    ...style,
  };

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className={className}
        style={{ ...baseStyle, objectFit: 'cover', backgroundColor: 'var(--color-surface-secondary)' }}
      />
    );
  }

  return (
    <div
      className={className}
      style={{
        ...baseStyle,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: color,
        color: '#fff',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: fontSize ?? Math.round(size * 0.45),
        lineHeight: 1,
      }}
    >
      {initial}
    </div>
  );
}
