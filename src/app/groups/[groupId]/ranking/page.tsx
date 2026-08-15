'use client';

/**
 * グループの今週のランキング（表彰台 + 全員分の行）。
 * ハブの「ランキング」タイルから遷移する。
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  GroupPageEmpty,
  GroupPageLoading,
  GroupPageShell,
} from '@/components/groups/GroupPageShell';
import {
  GroupLeaderboard,
  LeaderboardEmptyHint,
  findViewerRank,
} from '@/components/groups/GroupLeaderboard';
import { loadGroupOverview } from '@/lib/shared-projects/group-overview-cache';
import type { StudyGroupLeaderboardEntry, StudyGroupSummary } from '@/lib/shared-projects/types';

export default function GroupRankingPage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params?.groupId ?? '';

  const [group, setGroup] = useState<StudyGroupSummary | null>(null);
  const [leaderboard, setLeaderboard] = useState<StudyGroupLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;

    loadGroupOverview(groupId, (payload) => {
      if (cancelled) return;
      setGroup(payload.group);
      setLeaderboard(payload.leaderboard);
      setLoading(false);
    })
      .catch(() => {
        if (!cancelled) setError('ランキングを読み込めませんでした。');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [groupId]);

  const totalQuiz = useMemo(
    () => leaderboard.reduce((sum, entry) => sum + entry.quizCount, 0),
    [leaderboard],
  );
  const viewerRank = useMemo(() => findViewerRank(leaderboard), [leaderboard]);

  return (
    <GroupPageShell
      eyebrow="WEEKLY RANKING"
      title={group?.name ?? 'ランキング'}
      backHref={`/groups/${encodeURIComponent(groupId)}`}
    >
      {loading && leaderboard.length === 0 ? (
        <GroupPageLoading />
      ) : error ? (
        <GroupPageEmpty icon="error" message={error} />
      ) : (
        <>
          {/* 自分の位置とグループ全体の量を横1行のサマリーで見せる */}
          <div className="mb-4 grid grid-cols-2 gap-2">
            <SummaryCell
              label="YOUR RANK"
              value={viewerRank ? `${viewerRank}位` : '—'}
              accent="#FFC800"
            />
            <SummaryCell label="GROUP TOTAL" value={`${totalQuiz}問`} />
          </div>

          <GroupLeaderboard leaderboard={leaderboard} />
          <LeaderboardEmptyHint />
        </>
      )}
    </GroupPageShell>
  );
}

function SummaryCell({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-[14px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-2.5">
      <div className="font-mono text-[9px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
        {label}
      </div>
      <div
        className="font-display text-[20px] font-black leading-tight text-[var(--solid-ink)]"
        style={accent ? { color: 'var(--solid-ink)', textDecorationColor: accent } : undefined}
      >
        {value}
      </div>
    </div>
  );
}
