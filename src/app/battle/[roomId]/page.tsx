'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useBattleRoom } from '@/hooks/use-battle-room';
import { Icon } from '@/components/ui/Icon';
import {
  BattleChoiceButton,
  BattleInviteCode,
  BattleNotice,
  BattleQuestionCard,
  BattleResultPanel,
  BattleRoundStatus,
  BattleScoreboard,
  BattleScreen,
  BattleScreenHeader,
  BattleWaitingPanel,
  type BattleChoiceState,
  type BattleRoundOutcome,
} from '@/components/battle';
import {
  getBattleProgressLabel,
  getBattleResultForViewer,
  getViewerParticipants,
} from '@/lib/battle/room-state';

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
    lastResult,
    submitAnswer,
    leaveBattle,
    refresh,
  } = useBattleRoom(roomId, userId);

  const [startError, setStartError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
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

  const header = (
    <BattleScreenHeader eyebrow="REALTIME BATTLE" title="単語対戦" backHref="/battle" />
  );

  if (authLoading || loading) {
    return (
      <BattleScreen header={header} center>
        <div className="flex items-center justify-center gap-2 py-10 text-[var(--color-muted)]">
          <Icon name="progress_activity" size={20} className="animate-spin" />
          <span className="text-sm font-bold">対戦を読み込んでいます...</span>
        </div>
      </BattleScreen>
    );
  }

  if (error || !room || !viewer) {
    return (
      <BattleScreen header={header} center>
        <BattleNotice
          icon="error"
          title="対戦が見つかりません"
          description={error ?? 'この対戦はすでに終了しているか、参加していない対戦です。'}
          action={{ label: '対戦トップへ', href: '/battle' }}
        />
      </BattleScreen>
    );
  }

  // ---- 決着 ----
  if (room.status === 'finished' || room.status === 'cancelled') {
    return (
      <BattleScreen header={header} bodyClassName="py-5" center>
        <BattleResultPanel
          result={getBattleResultForViewer(room, userId ?? '')}
          cancelled={room.status === 'cancelled'}
          abandoned={room.outcome === 'abandoned'}
          self={viewer.self}
          opponent={viewer.opponent}
        />
      </BattleScreen>
    );
  }

  // ---- 相手待ち / 問題準備中 ----
  if (room.status === 'waiting' || room.status === 'ready' || room.status === 'preparing') {
    const waitingForGuest = !room.guest;
    return (
      <BattleScreen header={header} center>
        <BattleWaitingPanel
          title={waitingForGuest ? '相手を待っています...' : '問題を準備しています...'}
          description={
            waitingForGuest
              ? '相手が招待コードで参加すると、自動で対戦が始まります。'
              : 'お互いの単語帳から問題を作っています。数秒で始まります。'
          }
          onCancel={handleLeave}
          cancelLabel="退出する"
        >
          {room.inviteCode && waitingForGuest && <BattleInviteCode code={room.inviteCode} />}
          {startError && (
            <p className="mt-4 text-center text-[12.5px] font-bold text-[var(--color-error)]">
              {startError}
            </p>
          )}
        </BattleWaitingPanel>
      </BattleScreen>
    );
  }

  // ---- 対戦中 ----
  const resolved = Boolean(currentQuestion?.resolvedAt);
  const correctIndex = currentQuestion?.correctIndex ?? null;
  const answeredByMe = Boolean(currentQuestion?.answeredBy && currentQuestion.answeredBy === userId);
  const missedRound =
    hasAnswered && !resolved && Boolean(lastResult?.accepted && !lastResult.correct);

  const outcome: BattleRoundOutcome = resolved
    ? answeredByMe
      ? 'won'
      : currentQuestion?.answeredBy
        ? 'lost'
        : 'timeout'
    : missedRound
      ? 'missed'
      : hasAnswered
        ? 'answered'
        : 'live';

  const choiceState = (index: number): BattleChoiceState => {
    if (resolved) {
      if (correctIndex === index) return 'correct';
      if (selectedChoice === index) return 'wrong';
      return 'muted';
    }
    if (selectedChoice === index) return 'selected';
    return canAnswer ? 'idle' : 'locked';
  };

  return (
    <BattleScreen
      bodyClassName="py-3.5"
      header={
        <BattleScreenHeader
          eyebrow="REALTIME BATTLE"
          title={viewer.opponent ? `vs ${viewer.opponent.displayName}` : '単語対戦'}
          onBack={() => setConfirmLeave(true)}
        >
          <BattleScoreboard
            self={viewer.self}
            opponent={viewer.opponent}
            progressLabel={getBattleProgressLabel(room)}
            timer={{
              remainingMs,
              durationMs: room.roundDurationMs,
              paused: resolved,
            }}
          />
        </BattleScreenHeader>
      }
      footer={
        confirmLeave ? (
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-[12px] font-bold text-[var(--color-muted)]">
              降参すると相手の勝ちになります。
            </p>
            <button
              type="button"
              onClick={() => setConfirmLeave(false)}
              className="h-9 shrink-0 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 text-[12.5px] font-bold text-[var(--solid-ink)]"
            >
              続ける
            </button>
            <button
              type="button"
              onClick={handleLeave}
              className="h-9 shrink-0 rounded-[10px] border-2 border-[var(--color-error)] bg-[var(--color-error)] px-3 text-[12.5px] font-bold text-white"
            >
              降参する
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmLeave(true)}
            className="mx-auto flex h-9 items-center gap-1 text-[12px] font-bold text-[var(--color-muted)]"
          >
            <Icon name="flag" size={14} />
            対戦を降参する
          </button>
        )
      }
    >
      {currentQuestion ? (
        <>
          <BattleQuestionCard
            prompt={currentQuestion.prompt}
            round={currentQuestion.roundIndex + 1}
          />

          <div className="mt-3.5 flex flex-col gap-2.5">
            {currentQuestion.choices.map((choice, index) => (
              <BattleChoiceButton
                key={`${currentQuestion.roundIndex}-${index}`}
                label={choice}
                index={index}
                state={choiceState(index)}
                onSelect={() => submitAnswer(index)}
              />
            ))}
          </div>

          {outcome !== 'live' && (
            <div className="mt-3.5">
              <BattleRoundStatus outcome={outcome} />
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center justify-center gap-2 py-14 text-[var(--color-muted)]">
          <Icon name="progress_activity" size={20} className="animate-spin" />
          <span className="text-sm font-bold">
            {questions.length === 0 ? '問題を読み込んでいます...' : '次の問題を準備しています...'}
          </span>
        </div>
      )}
    </BattleScreen>
  );
}
