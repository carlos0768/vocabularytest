'use client';

import Link from 'next/link';
import { ProfileAvatar } from '@/components/profile/ProfileAvatar';
import { profileAvatarColor } from '@/components/profile/ProfileView';
import type { FollowingTodayActivity } from '@/lib/follows/today-activity';

/**
 * 今日クイズを解いたフォロー中のユーザーを、インスタの「おすすめ」風の
 * 横スクロールカードで並べる（ホームのマイ単語帳の上）。カードを押すとその人のプロフィールへ。
 * 該当者がいなければ何も描かない。
 */
export function FollowingTodayStrip({ activity }: { activity: FollowingTodayActivity[] }) {
  if (activity.length === 0) return null;

  return (
    <section className="pb-2 pt-3" aria-label="今日クイズを解いたフォロー中のユーザー">
      <div className="px-5 pb-2.5">
        <div className="font-mono text-[10px] font-semibold tracking-[0.06em] text-[var(--color-muted)]">
          FOLLOWING TODAY
        </div>
        <h2 className="font-display text-[19px] font-extrabold tracking-[-0.01em] text-[var(--solid-ink)]">
          今日がんばったフォロー中の人
        </h2>
      </div>
      <div className="flex snap-x gap-2.5 overflow-x-auto px-[18px] pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {activity.map((item) => {
          const name = item.profile.username?.trim() || `@${item.profile.accountId}`;
          return (
            <Link
              key={item.userId}
              href={`/profile/${encodeURIComponent(item.profile.accountId)}`}
              className="flex w-[124px] shrink-0 snap-start flex-col items-center rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-3 pb-3.5 pt-4"
            >
              <ProfileAvatar
                avatarUrl={item.profile.avatarUrl}
                initial={(item.profile.username || item.profile.accountId || '?').charAt(0).toUpperCase()}
                color={profileAvatarColor(item.profile.accountId)}
                size={72}
                radius={36}
              />
              <div className="mt-2.5 w-full truncate text-center font-display text-[14px] font-extrabold text-[var(--solid-ink)]">
                {name}
              </div>
              <div className="mt-1.5 flex items-baseline gap-0.5 text-[var(--color-accent)]">
                <span className="font-display text-[20px] font-extrabold leading-none tabular-nums">
                  {item.answerCount.toLocaleString()}
                </span>
                <span className="text-[11px] font-bold">問</span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
