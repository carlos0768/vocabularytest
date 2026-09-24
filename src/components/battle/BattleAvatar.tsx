'use client';

/**
 * 対戦相手のアイコン。人間は通常のプロフィール画像だが、ボットには
 * プロフィールが無いのでロボットのアイコンを出す（頭文字だと「ル」「マ」に
 * なってしまい、相手が人かボットか分からない）。
 */

import { Icon } from '@/components/ui/Icon';
import { ProfileAvatar } from '@/components/profile/ProfileAvatar';
import { profileAvatarColor } from '@/components/profile/ProfileView';
import type { BattleParticipant } from '@/lib/battle/types';

export function BattleAvatar({
  participant,
  fallbackKey,
  size,
}: {
  participant: BattleParticipant | null;
  /** 席が空のときの色の種。 */
  fallbackKey: string;
  size: number;
}) {
  if (participant?.isBot) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface-secondary)] text-[var(--solid-ink)]"
        style={{ width: size, height: size }}
        aria-label="ボット"
      >
        <Icon name="smart_toy" size={Math.round(size * 0.58)} />
      </div>
    );
  }

  return (
    <ProfileAvatar
      avatarUrl={participant?.avatarUrl}
      initial={(participant?.displayName?.trim().charAt(0) || '?').toUpperCase()}
      color={profileAvatarColor(participant?.userId ?? fallbackKey)}
      size={size}
      radius={Math.round(size / 2)}
    />
  );
}
