'use client';

/**
 * グループアイコン（丸）。
 * 設定済みなら画像、未設定なら頭文字＋グループIDから決まる色。
 * 実体はアカウントアイコンと同じ ProfileAvatar（data URL の <img>）なので、
 * ホーム・グループページ・メンバー一覧で見た目が揃う。
 */

import { ProfileAvatar } from '@/components/profile/ProfileAvatar';
import { thumbColor } from '@/lib/ui/thumb-color';


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
      color={thumbColor(group.id)}
      size={size}
      radius={size / 2}
      borderWidth={borderWidth}
      className={className}
    />
  );
}
