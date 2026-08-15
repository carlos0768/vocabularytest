'use client';

/**
 * 今週のランキング（表彰台 + 4位以下の行）。
 * 旧グループページ内にあった描画をページ間で使い回せるよう切り出したもの。
 */

import { ProfileAvatar } from '@/components/profile/ProfileAvatar';
import { profileAvatarColor } from '@/components/profile/ProfileView';
import { Icon } from '@/components/ui/Icon';
import {
  ProfileTapTarget,
  memberInitial,
  memberLabel,
  profileHref,
} from '@/app/groups/[groupId]/member-ui';
import type { StudyGroupLeaderboardEntry } from '@/lib/shared-projects/types';

// Duolingo-style podium medal colors for the top three.
const MEDALS = ['#FFC800', '#C3CDD6', '#E29C57'];

export function GroupLeaderboard({ leaderboard }: { leaderboard: StudyGroupLeaderboardEntry[] }) {
  if (leaderboard.length === 0) {
    return (
      <div className="rounded-[14px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-3 py-8 text-center text-[12px] font-bold text-[var(--color-muted)]">
        まだランキングがありません
      </div>
    );
  }

  const podium = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);

  return (
    <div>
      <div className="flex items-end justify-center gap-2">
        {podium[1] && <PodiumColumn entry={podium[1]} place={2} />}
        {podium[0] && <PodiumColumn entry={podium[0]} place={1} />}
        {podium[2] && <PodiumColumn entry={podium[2]} place={3} />}
      </div>

      {rest.length > 0 && (
        <div className="mt-4 flex flex-col gap-1.5">
          {rest.map((entry, index) => (
            <LeaderboardRow key={entry.userId} entry={entry} rank={index + 4} />
          ))}
        </div>
      )}
    </div>
  );
}

function PodiumColumn({ entry, place }: { entry: StudyGroupLeaderboardEntry; place: number }) {
  const size = place === 1 ? 64 : 52;
  return (
    <ProfileTapTarget
      href={profileHref(entry)}
      label={memberLabel(entry)}
      className={`flex flex-1 flex-col items-center transition-transform duration-100 active:scale-95 ${place === 1 ? '-mt-2' : 'mt-2'}`}
    >
      <div className="relative">
        <ProfileAvatar
          avatarUrl={entry.avatarUrl}
          initial={memberInitial(entry)}
          color={profileAvatarColor(entry.accountId ?? entry.userId)}
          size={size}
          radius={size / 2}
          fontSize={place === 1 ? 26 : 20}
        />
        <span
          className="absolute -bottom-1 -right-1 inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] font-display text-[12px] font-extrabold text-[var(--solid-ink)]"
          style={{ backgroundColor: MEDALS[place - 1] }}
        >
          {place}
        </span>
      </div>
      <div className={`mt-2 max-w-full truncate text-center text-[11px] font-extrabold ${entry.isViewer ? 'text-[var(--color-accent)]' : 'text-[var(--solid-ink)]'}`}>
        {memberLabel(entry)}
      </div>
      <div className="font-mono text-[12px] font-extrabold tabular-nums text-[var(--solid-ink)]">
        {entry.quizCount}
      </div>
      <div className="font-mono text-[9px] font-bold uppercase tracking-wide text-[var(--color-muted)]">問</div>
    </ProfileTapTarget>
  );
}

function LeaderboardRow({ entry, rank }: { entry: StudyGroupLeaderboardEntry; rank: number }) {
  return (
    <ProfileTapTarget
      href={profileHref(entry)}
      label={memberLabel(entry)}
      className={`flex items-center gap-3 rounded-[12px] border-2 px-3 py-2 transition-all duration-100 active:translate-x-px active:translate-y-px ${entry.isViewer ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)]' : 'border-[var(--color-border)] bg-[var(--color-surface)]'}`}
    >
      <span className="w-5 shrink-0 text-center font-mono text-[13px] font-extrabold tabular-nums text-[var(--color-muted)]">
        {rank}
      </span>
      <ProfileAvatar
        avatarUrl={entry.avatarUrl}
        initial={memberInitial(entry)}
        color={profileAvatarColor(entry.accountId ?? entry.userId)}
        size={36}
        radius={18}
        fontSize={14}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-extrabold text-[var(--solid-ink)]">
          {memberLabel(entry)}
        </div>
        {entry.masteredCount > 0 && (
          <div className="text-[10px] font-bold text-[var(--color-muted)]">
            マスター {entry.masteredCount}語
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <span className="font-mono text-[14px] font-extrabold tabular-nums text-[var(--solid-ink)]">
          {entry.quizCount}
        </span>
        <span className="ml-0.5 text-[10px] font-bold text-[var(--color-muted)]">問</span>
      </div>
    </ProfileTapTarget>
  );
}

/** 自分の順位（1始まり）。ランキングに載っていなければ null。 */
export function findViewerRank(leaderboard: StudyGroupLeaderboardEntry[]): number | null {
  const index = leaderboard.findIndex((entry) => entry.isViewer);
  return index >= 0 ? index + 1 : null;
}

export function LeaderboardEmptyHint() {
  return (
    <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11.5px] font-bold text-[var(--color-muted)]">
      <Icon name="schedule" size={14} />
      毎週月曜0時にリセット
    </p>
  );
}
