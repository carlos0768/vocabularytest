'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/use-auth';
import { useBattleRoom } from '@/hooks/use-battle-room';
import { BattleScreen, BattleHeaderAction } from '@/components/battle/BattleScreen';
import { BattleNotice } from '@/components/battle/BattleNotice';
import { BattleScoreboard } from '@/components/battle/BattleScoreboard';
import { BattleRoundTimer } from '@/components/battle/BattleRoundTimer';
import { BattleQuestionCard, type BattleRoundOutcome } from '@/components/battle/BattleQuestionCard';
import { BattleChoiceList } from '@/components/battle/BattleChoiceList';
import { BattleResultView } from '@/components/battle/BattleResultView';
import { BattleWaitingView } from '@/components/battle/BattleWaitingView';
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

  // 対戦中の退出は不戦敗になるので、誤タップで負けないよう一度だけ確認する。
  const handleForfeit = useCallback(() => {
    if (!window.confirm('対戦を降参します。よろしいですか？')) return;
    void handleLeave();
  }, [handleLeave]);

  if (authLoading || loading) {
    return (
      <BattleScreen eyebrow="BATTLE" title="対戦" center showBack={false}>
        <div className="flex items-center justify-center gap-2 text-[var(--color-muted)]">
          <Icon name="progress_activity" size={20} className="animate-spin" />
          <span className="text-sm font-bold">読み込み中...</span>
        </div>
      </BattleScreen>
    );
  }

  if (error || !room || !viewer) {
    return (
      <BattleScreen eyebrow="BATTLE" title="対戦" center backHref="/battle">
        <BattleNotice
          icon="error"
          title="対戦が見つかりません"
          description={error ?? 'この対戦はすでに終了しているか、参加していません。'}
          actionLabel="対戦トップへ"
          actionHref="/battle"
        />
      </BattleScreen>
    );
  }

  if (room.status === 'finished' || room.status === 'cancelled') {
    return (
      <BattleScreen eyebrow="RESULT" title="対戦結果" showBack={false} icon="flag">
        <BattleResultView
          result={getBattleResultForViewer(room, userId ?? '')}
          cancelled={room.status === 'cancelled'}
          abandoned={room.outcome === 'abandoned'}
          self={viewer.self}
          opponent={viewer.opponent}
        />
      </BattleScreen>
    );
  }

  if (room.status === 'waiting' || room.status === 'ready' || room.status === 'preparing') {
    return (
      <BattleScreen
        eyebrow={room.guest ? 'PREPARING' : 'WAITING'}
        title={room.guest ? 'まもなく開始' : '相手を待っています'}
        center
        showBack={false}
        icon="hourglass_top"
      >
        <BattleWaitingView
          self={viewer.self}
          opponent={viewer.opponent}
          inviteCode={room.inviteCode}
          error={startError}
          onLeave={handleLeave}
        />
      </BattleScreen>
    );
  }

  const resolved = Boolean(currentQuestion?.resolvedAt);
  const outcome: BattleRoundOutcome = !resolved
    ? null
    : currentQuestion?.answeredBy === userId
      ? 'won'
      : currentQuestion?.answeredBy
        ? 'lost'
        : 'timeout';

  return (
    <BattleScreen
      eyebrow="BATTLE"
      title={`${getBattleProgressLabel(room)} 問目`}
      showBack={false}
      icon="swords"
      action={<BattleHeaderAction label="降参" icon="flag" tone="danger" onClick={handleForfeit} />}
      subHeader={
        <div className="flex flex-col gap-2">
          <BattleScoreboard
            self={viewer.self}
            opponent={viewer.opponent}
            leaderUserId={resolved ? currentQuestion?.answeredBy ?? null : null}
          />
          <BattleRoundTimer
            roundLabel={getBattleProgressLabel(room)}
            remainingMs={remainingMs}
            roundDurationMs={room.roundDurationMs}
            resolved={resolved}
          />
        </div>
      }
    >
      {currentQuestion ? (
        <div className="flex flex-1 flex-col justify-center gap-4 pb-6">
          <BattleQuestionCard
            prompt={currentQuestion.prompt}
            outcome={outcome}
            answer={currentQuestion.answer}
          />

          <BattleChoiceList
            choices={currentQuestion.choices}
            roundKey={currentQuestion.roundIndex}
            canAnswer={canAnswer}
            resolved={resolved}
            selectedIndex={selectedChoice}
            correctIndex={currentQuestion.correctIndex}
            onSelect={(index) => void submitAnswer(index)}
          />

          {hasAnswered && !resolved && (
            <p className="text-center text-[12.5px] font-bold text-[var(--color-muted)]">
              相手の回答を待っています...
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center gap-2 text-[var(--color-muted)]">
          <Icon name="progress_activity" size={20} className="animate-spin" />
          <span className="text-sm font-bold">
            {questions.length === 0 ? '問題を読み込んでいます...' : '次の問題を準備しています...'}
          </span>
        </div>
      )}
    </BattleScreen>
  );
}
