'use client';

/**
 * グループアイコン（丸）。
 * 設定済みなら画像、未設定なら頭文字＋グループIDから決まる色。
 * 実体はアカウントアイコンと同じ ProfileAvatar（data URL の <img>）なので、
 * ホーム・グループページ・メンバー一覧で見た目が揃う。
 */

import { ProfileAvatar } from '@/components/profile/ProfileAvatar';

// Site-wide avatar palette (matches home, shared, feed).
const THUMBS = ['#137FEC', '#664DB3', '#228B22', '#2E66BF', '#D97340', '#3373B3', '#CC4D59', '#3DA1B8'];

export function groupThumbColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  return THUMBS[Math.abs(hash) % THUMBS.length];
}

export function GroupAvatar({
  group,
  size,
  borderWidth = 2,
  className,
}: {
  group: { id: string; name: string; iconImage?: string | null };
  size: number;
  borderWidth?: number;
  className?: string;
}) {
  return (
    <ProfileAvatar
      avatarUrl={group.iconImage ?? null}
      initial={(group.name.trim() || 'G').charAt(0).toUpperCase()}
      color={groupThumbColor(group.id)}
      size={size}
      radius={size / 2}
      borderWidth={borderWidth}
      className={className}
    />
  );
}
