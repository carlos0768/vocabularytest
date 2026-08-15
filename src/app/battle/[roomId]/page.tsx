'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useBattleRoom } from '@/hooks/use-battle-room';
import { Icon } from '@/components/ui/Icon';
import {
  BattleChoiceButton,
  BattleHeaderButton,
  BattleInviteCode,
  BattleLeaveConfirm,
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
  const [rematchPending, setRematchPending] = useState(false);
  const [rematchError, setRematchError] = useState<string | null>(null);
  const startRequestedRef = useRef(false);

  // 対戦の入り口。グループ内対戦はグループの対戦画面、それ以外はロビー。
  const battleHomeHref = room?.groupId
    ? `/groups/${encodeURIComponent(room.groupId)}/battle`
    : '/battle';

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
    setConfirmLeave(false);
    await leaveBattle();
    router.push(battleHomeHref);
  }, [battleHomeHref, leaveBattle, router]);

  /**
   * 「もう一度対戦する」。ロビーへ戻さず、同じ相手・同じ設定の部屋へ直接移る。
   * 先に押した側は相手待ちの部屋で待ち、後から押した側が入ると自動で始まる。
   */
  const handleRematch = useCallback(async () => {
    if (rematchPending) return;
    setRematchError(null);
    setRematchPending(true);
    try {
      const response = await fetch(`/api/battle/rooms/${roomId}/rematch`, { method: 'POST' });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success || !payload.roomId) {
        throw new Error(payload?.error ?? '再戦の準備に失敗しました。');
      }
      // replace: 決着画面へ「戻る」で引き返せてしまわないようにする。
      router.replace(`/battle/${payload.roomId}`);
    } catch (err) {
      setRematchError(err instanceof Error ? err.message : '再戦の準備に失敗しました。');
      setRematchPending(false);
    }
  }, [rematchPending, roomId, router]);

  const header = (
    <BattleScreenHeader eyebrow="REALTIME BATTLE" title="単語対戦" backHref={battleHomeHref} />
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
          onRematch={() => void handleRematch()}
          rematchPending={rematchPending}
          rematchError={rematchError}
          backHref={battleHomeHref}
          backLabel={room.groupId ? 'グループの対戦に戻る' : '対戦トップに戻る'}
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
              ? room.rematchOfRoomId
                ? '相手が「もう一度対戦する」を押すと、自動で始まります。'
                : '相手が招待コードで参加すると、自動で対戦が始まります。'
              : room.groupId
                ? 'グループの単語帳から問題を作っています。数秒で始まります。'
                : '出題者の単語帳から問題を作っています。数秒で始まります。'
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
    <>
      <BattleScreen
        fill
        bodyClassName="pt-3"
        header={
          <BattleScreenHeader
            eyebrow="REALTIME BATTLE"
            title={viewer.opponent ? `vs ${viewer.opponent.displayName}` : '単語対戦'}
            right={
              <BattleHeaderButton
                icon="flag"
                label="対戦を降参する"
                tone="danger"
                onClick={() => setConfirmLeave(true)}
              />
            }
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
      >
        {currentQuestion ? (
          <>
            {/* 上段=出題、下段=ボタン盤。画面の高さを2つで分け合う */}
            <div className="flex min-h-[120px] flex-1 items-center justify-center py-2">
              <BattleQuestionCard
                prompt={currentQuestion.prompt}
                round={currentQuestion.roundIndex + 1}
              />
            </div>

            {/* 決着表示は高さを確保した枠に出す（盤面がずれると早押しの邪魔になる） */}
            <div className="flex h-[40px] shrink-0 items-center justify-center">
              <BattleRoundStatus outcome={outcome} />
            </div>

            {/* 4択は2×2のボタン盤。親指の届く下半分を使い、面を大きく取る */}
            <div className="grid min-h-[200px] flex-[1.15] grid-cols-2 grid-rows-2 gap-2.5">
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
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center gap-2 text-[var(--color-muted)]">
            <Icon name="progress_activity" size={20} className="animate-spin" />
            <span className="text-sm font-bold">
              {questions.length === 0 ? '問題を読み込んでいます...' : '次の問題を準備しています...'}
            </span>
          </div>
        )}
      </BattleScreen>

      <BattleLeaveConfirm
        isOpen={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        onConfirm={handleLeave}
      />
    </>
  );
}
