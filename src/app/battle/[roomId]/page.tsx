'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useBattleRoom } from '@/hooks/use-battle-room';
import { BattleScreenHeader } from '@/components/battle/BattleScreenHeader';
import { BattleStatusPanel } from '@/components/battle/BattleStatusPanel';
import { BattleScoreboard } from '@/components/battle/BattleScoreboard';
import { BattleTimerBar } from '@/components/battle/BattleTimerBar';
import { BattlePromptCard } from '@/components/battle/BattlePromptCard';
import { BattleChoiceList } from '@/components/battle/BattleChoiceList';
import {
  BattleRoundFeedback,
  type BattleRoundOutcome,
} from '@/components/battle/BattleRoundFeedback';
import { BattleResultPanel } from '@/components/battle/BattleResultPanel';
import { BattleButton, BattleLinkButton } from '@/components/battle/BattleButton';
import { BattleInviteCard } from '@/components/battle/BattleInviteCard';
import {
  getBattleProgressLabel,
  getBattleResultForViewer,
  getViewerParticipants,
} from '@/lib/battle/room-state';

function BattleShell({
  header,
  children,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-[var(--color-background)] font-[var(--font-body)]">
      {header}
      {children}
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

  // 両席が埋まったらホストが問題セットを生成する。
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
    return (
      <BattleShell header={<BattleScreenHeader eyebrow="BATTLE" title="対戦" />}>
        <BattleStatusPanel spinning title="読み込み中" />
      </BattleShell>
    );
  }

  if (error || !room || !viewer) {
    return (
      <BattleShell header={<BattleScreenHeader eyebrow="BATTLE" title="対戦" />}>
        <BattleStatusPanel
          icon="error"
          title="対戦が見つかりません"
          description={error ?? undefined}
          actions={<BattleLinkButton href="/battle" icon="arrow_back">対戦トップへ</BattleLinkButton>}
        />
      </BattleShell>
    );
  }

  const finished = room.status === 'finished' || room.status === 'cancelled';

  if (finished) {
    return (
      <BattleShell header={<BattleScreenHeader eyebrow="RESULT" title="対戦結果" fallbackHref="/battle" />}>
        <div className="flex flex-1 flex-col justify-center px-[18px] py-8">
          <BattleResultPanel
            result={getBattleResultForViewer(room, userId ?? '')}
            outcome={room.outcome}
            cancelled={room.status === 'cancelled'}
            self={viewer.self}
            opponent={viewer.opponent}
          />
          <div className="mt-8">
            <BattleLinkButton href="/battle" icon="replay">もう一度対戦する</BattleLinkButton>
          </div>
        </div>
      </BattleShell>
    );
  }

  if (room.status !== 'in_progress') {
    const waitingForOpponent = !room.guest;

    return (
      <BattleShell
        header={
          <BattleScreenHeader
            eyebrow={room.mode === 'friend' ? 'FRIEND MATCH' : 'RANDOM MATCH'}
            title={waitingForOpponent ? '相手を待っています' : '対戦準備中'}
            onBack={handleLeave}
          />
        }
      >
        <BattleStatusPanel
          spinning
          title={waitingForOpponent ? '相手を待っています' : '問題を準備しています'}
          description={
            waitingForOpponent
              ? 'このコードを相手に伝えてください。'
              : 'お互いの単語帳から問題を作成しています。'
          }
          actions={
            <BattleButton variant="outline" icon="logout" onClick={handleLeave}>
              退出する
            </BattleButton>
          }
        >
          {waitingForOpponent && room.inviteCode ? (
            <BattleInviteCard inviteCode={room.inviteCode} />
          ) : null}
          {startError && (
            <p role="alert" className="mt-4 text-[13px] text-[var(--color-error)]">
              {startError}
            </p>
          )}
        </BattleStatusPanel>
      </BattleShell>
    );
  }

  const resolved = Boolean(currentQuestion?.resolvedAt);
  const answeredBy = currentQuestion?.answeredBy ?? null;

  const roundOutcome: BattleRoundOutcome = !currentQuestion
    ? 'live'
    : resolved
      ? answeredBy === userId
        ? 'won'
        : answeredBy
          ? 'lost'
          : hasAnswered
            ? 'missed'
            : 'timeout'
      : hasAnswered
        ? 'waiting'
        : 'live';

  const scoredSeat = resolved && answeredBy
    ? answeredBy === userId ? 'self' : 'opponent'
    : null;

  return (
    <BattleShell
      header={
        <BattleScreenHeader
          eyebrow={room.mode === 'friend' ? 'FRIEND MATCH' : 'RANDOM MATCH'}
          title="早押しバトル"
          onBack={handleLeave}
        />
      }
    >
      <div className="flex flex-1 flex-col gap-4 px-[18px] pb-8 pt-3">
        <BattleScoreboard self={viewer.self} opponent={viewer.opponent} scoredSeat={scoredSeat} />

        <BattleTimerBar
          remainingMs={remainingMs}
          totalMs={room.roundDurationMs}
          progressLabel={getBattleProgressLabel(room)}
          paused={resolved}
        />

        {currentQuestion ? (
          <>
            <BattlePromptCard prompt={currentQuestion.prompt} />

            <BattleRoundFeedback outcome={roundOutcome} answer={currentQuestion.answer} />

            <BattleChoiceList
              choices={currentQuestion.choices}
              selectedIndex={selectedChoice}
              correctIndex={currentQuestion.correctIndex}
              resolved={resolved}
              canAnswer={canAnswer}
              onSelect={(index) => void submitAnswer(index)}
            />
          </>
        ) : (
          <BattleStatusPanel spinning title="問題を読み込んでいます" />
        )}

        <button
          type="button"
          onClick={handleLeave}
          className="mt-auto pt-4 text-center font-display text-[12px] font-bold text-[var(--color-muted)] underline underline-offset-2"
        >
          対戦を降参する
        </button>
      </div>
    </BattleShell>
  );
}
