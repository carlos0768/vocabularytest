'use client';

/**
 * グループのトップに置く「今週の上位3人」。
 *
 * ハブは 2×2 のタイルだけの画面なので、誰が走っているかはランキングページまで
 * 開かないと分からなかった。ここに表彰台を薄く1枚置いて、開いた瞬間に today's
 * 競争相手が見えるようにする。
 *
 * 全体をランキングページへの1枚のリンクにしている（各アバターを個別のプロフィール
 * リンクにするとリンクが入れ子になるうえ、狭い帯の中でタップ先が3つに割れて
 * 押しにくい）。個々のプロフィールへはランキングページから開ける。
 */

import Link from 'next/link';
import { ProfileAvatar } from '@/components/profile/ProfileAvatar';
import { profileAvatarColor } from '@/components/profile/ProfileView';
import { Icon } from '@/components/ui/Icon';
import { memberInitial, memberLabel } from '@/app/groups/[groupId]/member-ui';
import { triggerHaptic } from '@/lib/haptics';
import type { StudyGroupLeaderboardEntry } from '@/lib/shared-projects/types';

/** GroupLeaderboard の表彰台と同じ配色（金・銀・銅）。 */
const MEDALS = ['#FFC800', '#C3CDD6', '#E29C57'];

/** 表彰台の並び順。中央が1位になるよう 2 → 1 → 3 で置く。 */
const PODIUM_ORDER = [1, 0, 2];

export function GroupTopThree({
  leaderboard,
  href,
}: {
  leaderboard: StudyGroupLeaderboardEntry[];
  /** ランキングページ。帯ごとここへ飛ぶ。 */
  href: string;
}) {
  const podium = leaderboard.slice(0, 3);
  // 全員0問の週は順位に意味が無いので、表彰台ではなく誘い文句を出す。
  const hasRecord = podium.some((entry) => entry.quizCount > 0);

  return (
    <Link
      href={href}
      onClick={() => triggerHaptic()}
      aria-label="今週のランキングを見る"
      className="mb-3 block rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 pb-2.5 pt-2 shadow-[2px_3px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-[1px_2px_0_var(--solid-ink)]"
    >
      <div className="flex items-center gap-1.5">
        <Icon name="emoji_events" size={14} className="shrink-0 text-[#F0A500]" />
        <span className="min-w-0 flex-1 truncate font-mono text-[9.5px] font-bold tracking-[0.06em] text-[var(--color-muted)]">
          THIS WEEK · 今週のランキング
        </span>
        <Icon name="chevron_right" size={15} className="shrink-0 text-[var(--color-muted)]" />
      </div>

      {hasRecord ? (
        <div className="mt-1.5 flex items-end justify-center gap-1">
          {PODIUM_ORDER.map((index) => {
            const entry = podium[index];
            if (!entry) return null;
            return <PodiumSlot key={entry.userId} entry={entry} place={index + 1} />;
          })}
        </div>
      ) : (
        <p className="py-3 text-center text-[11.5px] font-bold text-[var(--color-muted)]">
          今週はまだ誰も解いていません。最初の1問を解こう！
        </p>
      )}
    </Link>
  );
}

function PodiumSlot({ entry, place }: { entry: StudyGroupLeaderboardEntry; place: number }) {
  const first = place === 1;
  const size = first ? 46 : 38;

  return (
    <div className={`flex min-w-0 flex-1 flex-col items-center ${first ? '' : 'pb-1'}`}>
      <div className="relative">
        <ProfileAvatar
          avatarUrl={entry.avatarUrl}
          initial={memberInitial(entry)}
          color={profileAvatarColor(entry.accountId ?? entry.userId)}
          size={size}
          radius={size / 2}
          fontSize={first ? 18 : 15}
        />
        <span
          className="absolute -bottom-0.5 -right-0.5 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-[var(--solid-ink)] font-display text-[10px] font-extrabold text-[var(--solid-ink)]"
          style={{ backgroundColor: MEDALS[place - 1] }}
        >
          {place}
        </span>
      </div>
      <div
        className={`mt-1 max-w-full truncate text-center text-[10.5px] font-extrabold ${
          entry.isViewer ? 'text-[var(--color-accent)]' : 'text-[var(--solid-ink)]'
        }`}
      >
        {entry.isViewer ? 'あなた' : memberLabel(entry)}
      </div>
      <div className="font-mono text-[10px] font-bold tabular-nums text-[var(--color-muted)]">
        {entry.quizCount}問
      </div>
    </div>
  );
}
