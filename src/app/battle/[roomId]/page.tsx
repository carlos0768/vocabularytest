'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useBattleRoom } from '@/hooks/use-battle-room';
import {
  getBattleProgressLabel,
  getBattleResultForViewer,
  getViewerParticipants,
} from '@/lib/battle/room-state';
import type { BattleParticipant } from '@/lib/battle/types';

function ScoreBadge({ participant, label }: { participant: BattleParticipant | null; label: string }) {
  return (
    <div className="flex-1 text-center">
      <p className="mb-1 truncate text-xs text-[var(--color-muted)]">{label}</p>
      <p className="mb-1 truncate text-sm font-semibold">{participant?.displayName ?? '待機中'}</p>
      <p className="text-3xl font-bold">{participant?.score ?? 0}</p>
    </div>
  );
}

export default function BattleRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;

  const {
    room,
    questions,
    loading,
    error,
    currentQuestion,
    remainingMs,
    hasAnswered,
    canAnswer,
    selectedChoice,
    submitAnswer,
    leaveBattle,
    refresh,
  } = useBattleRoom(roomId, userId);

  const [startError, setStartError] = useState<string | null>(null);
  const startRequestedRef = useRef(false);

  const viewer = useMemo(
    () => (room && userId ? getViewerParticipants(room, userId) : null),
    [room, userId],
  );

  // The host generates the question set once both seats are filled.
  useEffect(() => {
    if (!room || !userId) return;
    if (room.status !== 'ready' || !room.guest) return;
    if (room.host.userId !== userId || startRequestedRef.current) return;

    startRequestedRef.current = true;
    fetch(`/api/battle/rooms/${roomId}/start`, { method: 'POST' })
      .then((response) => response.json().catch(() => null))
      .then((payload) => {
        if (payload && !payload.success) {
          setStartError(payload.error ?? '対戦の開始に失敗しました。');
          startRequestedRef.current = false;
        }
        void refresh();
      })
      .catch(() => {
        startRequestedRef.current = false;
      });
  }, [room, userId, roomId, refresh]);

  const handleLeave = useCallback(async () => {
    await leaveBattle();
    router.push('/battle');
  }, [leaveBattle, router]);

  if (authLoading || loading) {
    return <main className="p-6 text-center text-[var(--color-muted)]">読み込み中...</main>;
  }

  if (error || !room || !viewer) {
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <p className="mb-6 text-sm text-[var(--color-muted)]">{error ?? '対戦が見つかりません。'}</p>
        <Link href="/battle" className="inline-block rounded-xl bg-[var(--color-foreground)] px-6 py-3 font-semibold text-white">
          対戦トップへ
        </Link>
      </main>
    );
  }

  if (room.status === 'finished' || room.status === 'cancelled') {
    const result = getBattleResultForViewer(room, userId ?? '');
    const heading =
      room.status === 'cancelled'
        ? '対戦は中止されました'
        : result === 'win' ? '勝ち！' : result === 'lose' ? '負け...' : '引き分け';

    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center p-6 text-center">
        <h1 className="mb-2 text-3xl font-bold">{heading}</h1>
        {room.outcome === 'abandoned' && (
          <p className="mb-6 text-sm text-[var(--color-muted)]">相手が退出しました。</p>
        )}

        <div className="mb-10 flex w-full items-start gap-4 pt-6">
          <ScoreBadge participant={viewer.self} label="あなた" />
          <span className="pt-6 text-2xl font-bold text-[var(--color-muted)]">-</span>
          <ScoreBadge participant={viewer.opponent} label="相手" />
        </div>

        <Link href="/battle" className="w-full rounded-xl bg-[var(--color-foreground)] py-4 text-lg font-bold text-white">
          もう一度対戦する
        </Link>
      </main>
    );
  }

  if (room.status === 'waiting' || room.status === 'ready' || room.status === 'preparing') {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center p-6 text-center">
        <div className="mb-6 h-10 w-10 animate-spin rounded-full border-4 border-[var(--color-surface-secondary)] border-t-[var(--color-foreground)]" />
        <h1 className="mb-2 text-lg font-bold">
          {room.guest ? '問題を準備しています...' : '相手を待っています...'}
        </h1>
        {room.inviteCode && !room.guest && (
          <p className="mb-6 font-mono text-3xl font-bold tracking-[0.3em]">{room.inviteCode}</p>
        )}
        {startError && <p className="mb-6 text-sm text-red-600">{startError}</p>}
        <button
          type="button"
          onClick={handleLeave}
          className="rounded-xl border-2 border-[var(--color-foreground)] px-6 py-3 font-semibold"
        >
          退出する
        </button>
      </main>
    );
  }

  const resolved = Boolean(currentQuestion?.resolvedAt);
  const correctIndex = currentQuestion?.correctIndex ?? null;
  const wonRound = currentQuestion?.answeredBy && currentQuestion.answeredBy === userId;
  const secondsLeft = Math.ceil(remainingMs / 1000);

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col p-6">
      <header className="mb-6">
        <div className="mb-4 flex items-start gap-4">
          <ScoreBadge participant={viewer.self} label="あなた" />
          <span className="pt-6 text-2xl font-bold text-[var(--color-muted)]">-</span>
          <ScoreBadge participant={viewer.opponent} label="相手" />
        </div>
        <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
          <span>{getBattleProgressLabel(room)}</span>
          <span className={remainingMs < 3000 && !resolved ? 'font-bold text-red-600' : ''}>
            残り {secondsLeft}秒
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-secondary)]">
          <div
            className="h-full bg-[var(--color-foreground)] transition-[width] duration-100 ease-linear"
            style={{ width: `${Math.max(0, (remainingMs / room.roundDurationMs) * 100)}%` }}
          />
        </div>
      </header>

      <section className="mb-8 flex flex-1 flex-col items-center justify-center">
        <p className="mb-2 text-xs text-[var(--color-muted)]">この単語の意味は？</p>
        <h1 className="text-center text-4xl font-bold break-words">{currentQuestion?.prompt ?? ''}</h1>

        {resolved && (
          <p className="mt-4 text-sm font-semibold">
            {wonRound ? '正解！ +1' : currentQuestion?.answeredBy ? '相手が正解しました' : '時間切れ'}
          </p>
        )}
      </section>

      <section className="mb-6 grid gap-3">
        {(currentQuestion?.choices ?? []).map((choice, index) => {
          const isCorrect = resolved && correctIndex === index;
          const isMyWrongPick = resolved && selectedChoice === index && correctIndex !== index;

          return (
            <button
              key={`${currentQuestion?.roundIndex}-${index}`}
              type="button"
              disabled={!canAnswer}
              onClick={() => submitAnswer(index)}
              className={`w-full rounded-xl border-2 p-4 text-left font-semibold transition-colors ${
                isCorrect
                  ? 'border-green-600 bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300'
                  : isMyWrongPick
                    ? 'border-red-600 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300'
                    : selectedChoice === index
                      ? 'border-[var(--color-foreground)] bg-[var(--color-surface-secondary)]'
                      : 'border-[var(--color-foreground)]'
              } ${!canAnswer && !resolved ? 'opacity-60' : ''}`}
            >
              {choice}
            </button>
          );
        })}
      </section>

      {hasAnswered && !resolved && (
        <p className="mb-4 text-center text-sm text-[var(--color-muted)]">
          相手の回答を待っています...
        </p>
      )}

      <button
        type="button"
        onClick={handleLeave}
        className="mb-2 text-center text-xs text-[var(--color-muted)] underline"
      >
        対戦を降参する
      </button>

      {questions.length === 0 && (
        <p className="text-center text-xs text-[var(--color-muted)]">問題を読み込んでいます...</p>
      )}
    </main>
  );
}
