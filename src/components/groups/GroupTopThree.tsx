'use client';

/**
 * グループのトップに置く「今週の上位3人」。
 *
 * カード（枠付きの帯）には入れず、アイコンをそのままページの背景の上に置く。
 * ハブはタイルが主役の画面なので、ここに枠がもう1枚増えると面が二重になって
 * 重く見えるため。順位は金・銀・銅のメダルで読ませるので、見出しの帯も矢印も
 * 置かない（全体がランキングページへのリンクになっている）。
 *
 * 各アバターを個別のプロフィールリンクにはしない。リンクが入れ子になるうえ、
 * 狭い範囲でタップ先が3つに割れて押しにくいため。個々のプロフィールへは
 * ランキングページから開ける。
 */

import Link from 'next/link';
import { ProfileAvatar } from '@/components/profile/ProfileAvatar';
import { profileAvatarColor } from '@/components/profile/ProfileView';
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
  /** ランキングページ。表彰台ごとここへ飛ぶ。 */
  href: string;
}) {
  const podium = leaderboard.slice(0, 3);
  // 全員0問の週は順位に意味が無いので、表彰台ではなく誘い文句を1行だけ出す。
  const hasRecord = podium.some((entry) => entry.quizCount > 0);

  if (!hasRecord) {
    return (
      <p className="mb-2 text-center text-[11.5px] font-bold text-[var(--color-muted)]">
        今週はまだ誰も解いていません。最初の1問を解こう！
      </p>
    );
  }

  return (
    <Link
      href={href}
      onClick={() => triggerHaptic()}
      aria-label="今週のランキングを見る"
      className="mb-2 flex items-end justify-center gap-1 transition-transform duration-100 active:scale-[0.98]"
    >
      {PODIUM_ORDER.map((index) => {
        const entry = podium[index];
        if (!entry) return null;
        return <PodiumSlot key={entry.userId} entry={entry} place={index + 1} />;
      })}
    </Link>
  );
}

function PodiumSlot({ entry, place }: { entry: StudyGroupLeaderboardEntry; place: number }) {
  const first = place === 1;
  const size = first ? 50 : 40;

  return (
    <div className={`flex min-w-0 flex-1 flex-col items-center ${first ? '' : 'pb-1'}`}>
      <div className="relative">
        <ProfileAvatar
          avatarUrl={entry.avatarUrl}
          initial={memberInitial(entry)}
          color={profileAvatarColor(entry.accountId ?? entry.userId)}
          size={size}
          radius={size / 2}
          fontSize={first ? 20 : 16}
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
