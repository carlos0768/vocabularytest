'use client';

import Link from 'next/link';
import { ProfileAvatar } from '@/components/profile/ProfileAvatar';
import { profileAvatarColor } from '@/components/profile/ProfileView';
import type { FollowingTodayActivity } from '@/lib/follows/today-activity';

/**
 * 今日クイズを解いたフォロー中のユーザーを、インスタの「おすすめ」風の
 * 横スクロールカードで並べる（ホームのマイ単語帳の上、見出しなし）。カードを押すとその人のプロフィールへ。
 * 該当者がいなければ何も描かない。
 */
export function FollowingTodayStrip({ activity }: { activity: FollowingTodayActivity[] }) {
  if (activity.length === 0) return null;

  return (
    <section className="pb-2 pt-2" aria-label="今日クイズを解いたフォロー中のユーザー">
      <div className="flex snap-x gap-1.5 overflow-x-auto px-[18px] pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {activity.map((item) => {
          const name = item.profile.username?.trim() || `@${item.profile.accountId}`;
          return (
            <Link
              key={item.userId}
              href={`/profile/${encodeURIComponent(item.profile.accountId)}`}
              className="flex w-[83px] shrink-0 snap-start flex-col items-center rounded-[11px] border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-2 pb-2.5 pt-2.5"
            >
              <ProfileAvatar
                avatarUrl={item.profile.avatarUrl}
                initial={(item.profile.username || item.profile.accountId || '?').charAt(0).toUpperCase()}
                color={profileAvatarColor(item.profile.accountId)}
                size={48}
                radius={24}
                borderWidth={1.5}
              />
              <div className="mt-1.5 w-full truncate text-center font-display text-[11px] font-extrabold text-[var(--solid-ink)]">
                {name}
              </div>
              <div className="mt-1 flex items-baseline gap-0.5 text-[var(--color-accent)]">
                <span className="font-display text-[14px] font-extrabold leading-none tabular-nums">
                  {item.answerCount.toLocaleString()}
                </span>
                <span className="text-[9px] font-bold">問</span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
