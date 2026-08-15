'use client';

/**
 * グループ内マッチメイキング。
 *
 * 待機列は通常の対戦と同じテーブルだが、`groupId` 付きで投げると同じグループ
 * のメンバーとしかマッチしない（サーバー側の `pair_group_battle_match` が
 * メンバーシップを検証する）。対戦が始まったら通常の対戦画面へ渡す。
 *
 * 出題元はグループに追加された単語帳（本棚）で、各プレイヤー個人の単語帳は
 * 使わない。そのためこの画面には単語帳の選択がなく、単語帳が0冊のグループでは
 * そもそもマッチングを始めさせない。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  BattleGroupSetupCard,
  BattleNotice,
  BattleScreen,
  BattleScreenHeader,
  BattleWaitingPanel,
} from '@/components/battle';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/use-auth';
import {
  BATTLE_DEFAULT_QUESTION_COUNT,
  BATTLE_DEFAULT_ROUND_DURATION_MS,
  BATTLE_MATCH_POLL_INTERVAL_MS,
} from '@/lib/battle/config';
import { loadGroupOverview } from '@/lib/shared-projects/group-overview-cache';
import type { SharedProjectCard, StudyGroupSummary } from '@/lib/shared-projects/types';

const QUESTION_COUNT_OPTIONS = [
  { label: '5', value: 5 },
  { label: '10', value: 10 },
  { label: '20', value: 20 },
];
const ROUND_DURATION_OPTIONS = [
  { label: '10秒', value: 10_000 },
  { label: '15秒', value: 15_000 },
  { label: '20秒', value: 20_000 },
];

export default function GroupBattlePage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params?.groupId ?? '';
  const router = useRouter();
  const { isAuthenticated, isPro, loading: authLoading } = useAuth();

  const [group, setGroup] = useState<StudyGroupSummary | null>(null);
  const [books, setBooks] = useState<SharedProjectCard[]>([]);
  const [booksLoading, setBooksLoading] = useState(true);
  const [questionCount, setQuestionCount] = useState(BATTLE_DEFAULT_QUESTION_COUNT);
  const [roundDurationMs, setRoundDurationMs] = useState(BATTLE_DEFAULT_ROUND_DURATION_MS);
  const [matching, setMatching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matchingRef = useRef(false);
  matchingRef.current = matching;

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    loadGroupOverview(groupId, (payload) => {
      if (cancelled) return;
      setGroup(payload.group);
      setBooks(payload.projects);
      setBooksLoading(false);
    }).catch(() => {
      // 出題元が読めないままマッチングさせると、対戦開始時に初めて
      // 「単語が足りない」と分かることになるので、ここでは伏せずに出す。
      if (!cancelled) {
        setBooksLoading(false);
        setError('グループの単語帳を読み込めませんでした。');
      }
    });
    return () => { cancelled = true; };
  }, [groupId]);

  const totalWordCount = useMemo(
    () => books.reduce((sum, card) => sum + (card.wordCount ?? 0), 0),
    [books],
  );
  const setupBooks = useMemo(
    () => books.map((card) => ({ id: card.project.id, title: card.project.title })),
    [books],
  );
  const hasBooks = books.length > 0;

  const startMatching = useCallback(async () => {
    if (!groupId) return;
    setError(null);
    setBusy(true);
    try {
      // 単語帳を送らないのは意図的。出題はサーバー側でグループの本棚から作る。
      const response = await fetch('/api/battle/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, questionCount, roundDurationMs }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error ?? 'マッチングに失敗しました。');
      }
      if (payload.matched && payload.roomId) {
        router.push(`/battle/${payload.roomId}`);
        return;
      }
      setMatching(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'マッチングに失敗しました。');
    } finally {
      setBusy(false);
    }
  }, [groupId, questionCount, roundDurationMs, router]);

  const cancelMatching = useCallback(async () => {
    setMatching(false);
    await fetch('/api/battle/match', { method: 'DELETE' }).catch(() => {});
  }, []);

  // 待機中は、サーバーがペアにしてくれた部屋をポーリングで拾う。
  useEffect(() => {
    if (!matching) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch('/api/battle/match', { cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        if (payload?.matched && payload.roomId && matchingRef.current) {
          router.push(`/battle/${payload.roomId}`);
        }
      } catch {
        // 1回落ちても待ち続ける。
      }
    }, BATTLE_MATCH_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [matching, router]);

  const groupPath = `/groups/${encodeURIComponent(groupId)}`;
  const header = (
    <BattleScreenHeader
      eyebrow="GROUP BATTLE"
      title={group ? `${group.name} で対戦` : 'グループ対戦'}
      backHref={groupPath}
    />
  );

  if (authLoading) {
    return (
      <BattleScreen header={header} center>
        <div className="flex items-center justify-center gap-2 py-10 text-[var(--color-muted)]">
          <Icon name="progress_activity" size={20} className="animate-spin" />
          <span className="text-sm font-bold">読み込み中...</span>
        </div>
      </BattleScreen>
    );
  }

  if (!isAuthenticated) {
    return (
      <BattleScreen header={header} center>
        <BattleNotice
          icon="lock"
          title="ログインが必要です"
          description="グループ内の対戦にはログインが必要です。"
          action={{ label: 'ログイン', href: '/login' }}
        />
      </BattleScreen>
    );
  }

  if (!isPro) {
    return (
      <BattleScreen header={header} center>
        <BattleNotice
          icon="workspace_premium"
          title="Proプラン限定の機能です"
          description="リアルタイム対戦はProプラン限定です。対戦でコインは消費しません。"
          action={{ label: 'Proプランを見る', href: '/subscription' }}
          secondaryAction={{ label: 'グループに戻る', href: groupPath }}
        />
      </BattleScreen>
    );
  }

  if (matching) {
    return (
      <BattleScreen header={header} center>
        <BattleWaitingPanel
          title="グループの相手を探しています..."
          description="同じグループのメンバーが対戦を始めると、自動でマッチします。"
          onCancel={cancelMatching}
        >
          <div className="rounded-[14px] border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-left">
            <div className="font-mono text-[9.5px] font-bold tracking-[0.06em] text-[var(--color-muted)]">
              MATCH SETTINGS
            </div>
            <div className="mt-1 text-[13px] font-bold text-[var(--solid-ink)]">
              {questionCount}問 · 1問{Math.round(roundDurationMs / 1000)}秒
              {hasBooks && ` · グループの単語帳${books.length}冊`}
            </div>
          </div>
        </BattleWaitingPanel>
      </BattleScreen>
    );
  }

  return (
    <BattleScreen header={header} bodyClassName="py-4" center>
      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-[12px] border-2 border-[var(--color-error)] bg-[var(--color-error-light)] p-3">
          <Icon name="error" size={16} className="mt-[1px] shrink-0 text-[var(--color-error)]" />
          <p className="min-w-0 flex-1 text-[12.5px] font-bold leading-[1.6] text-[var(--color-error)]">
            {error}
          </p>
        </div>
      )}

      <BattleGroupSetupCard
        books={setupBooks}
        booksLoading={booksLoading}
        totalWordCount={totalWordCount}
        questionCount={questionCount}
        questionCountOptions={QUESTION_COUNT_OPTIONS}
        onQuestionCountChange={setQuestionCount}
        roundDurationMs={roundDurationMs}
        roundDurationOptions={ROUND_DURATION_OPTIONS}
        onRoundDurationChange={setRoundDurationMs}
        disabled={busy}
      />

      <button
        type="button"
        onClick={startMatching}
        disabled={busy || booksLoading || !hasBooks}
        className="mt-4 flex h-[58px] w-full items-center justify-center gap-2 rounded-[16px] border-2 border-[var(--color-accent-ink)] bg-[var(--color-accent)] font-display text-[16px] font-black text-white shadow-[3px_4px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-[2px_3px_0_var(--solid-ink)] disabled:opacity-50 disabled:shadow-none"
      >
        <Icon name="swords" size={20} />
        グループ内でマッチング
      </button>
      <p className="mt-2 text-center text-[11.5px] leading-[1.6] text-[var(--color-muted)]">
        同じグループのメンバーとだけマッチします。
        <br />
        出題はグループに追加された単語帳からです。
      </p>
      {!booksLoading && !hasBooks && (
        <Link
          href={`${groupPath}/bookshelf`}
          className="mt-3 flex h-[46px] w-full items-center justify-center gap-1.5 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] font-display text-[13px] font-extrabold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
        >
          <Icon name="library_add" size={16} />
          単語帳をグループに追加する
        </Link>
      )}
    </BattleScreen>
  );
}
