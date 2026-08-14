'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { BATTLE_ROUND_REVEAL_MS } from '@/lib/battle/config';
import { canViewerAnswer, getRemainingMs } from '@/lib/battle/room-state';
import type { BattleAnswerResult, BattleQuestion, BattleRoom } from '@/lib/battle/types';

/** Backstop refetch in case a realtime event is dropped. */
const BATTLE_RECONCILE_INTERVAL_MS = 4_000;
const BATTLE_TICK_MS = 100;

type BattleState = {
  room: BattleRoom | null;
  questions: BattleQuestion[];
  loading: boolean;
  error: string | null;
};

export type UseBattleRoomResult = BattleState & {
  currentQuestion: BattleQuestion | null;
  remainingMs: number;
  hasAnswered: boolean;
  canAnswer: boolean;
  selectedChoice: number | null;
  lastResult: BattleAnswerResult | null;
  submitAnswer: (choiceIndex: number) => Promise<void>;
  leaveBattle: () => Promise<void>;
  refresh: () => Promise<void>;
};

export function useBattleRoom(roomId: string, userId: string | null): UseBattleRoomResult {
  const [state, setState] = useState<BattleState>({
    room: null,
    questions: [],
    loading: true,
    error: null,
  });
  const [now, setNow] = useState(() => Date.now());
  const [answeredRounds, setAnsweredRounds] = useState<Set<number>>(() => new Set());
  // Tagged with the round they belong to so a new round clears them by derivation
  // rather than by an effect that would fire an extra render.
  const [selection, setSelection] = useState<{ round: number; choiceIndex: number } | null>(null);
  const [result, setResult] = useState<{ round: number; value: BattleAnswerResult } | null>(null);

  // Guards so the advance/timeout RPCs fire once per round, not once per tick.
  const timeoutRequestedRef = useRef<number | null>(null);
  const advanceRequestedRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/battle/rooms/${roomId}`, { cache: 'no-store' });
      const payload = await response.json();

      if (!mountedRef.current) return;

      if (!response.ok || !payload.success) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: payload.error ?? '対戦情報の取得に失敗しました。',
        }));
        return;
      }

      setState({
        room: payload.room as BattleRoom,
        questions: (payload.questions ?? []) as BattleQuestion[],
        loading: false,
        error: null,
      });
    } catch {
      if (!mountedRef.current) return;
      setState((prev) => ({ ...prev, loading: false, error: '通信に失敗しました。' }));
    }
  }, [roomId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // `refresh` awaits the fetch before it touches state, so nothing is set
    // synchronously here -- the rule cannot see through the async boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  // Realtime: the room row carries the scores and status, the question rows
  // carry round transitions and the revealed answer.
  useEffect(() => {
    if (!isSupabaseConfigured() || !userId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`battle-room-${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'battle_rooms', filter: `id=eq.${roomId}` },
        () => { void refresh(); },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'battle_questions', filter: `room_id=eq.${roomId}` },
        () => { void refresh(); },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel).catch(() => {
        // ignore
      });
    };
  }, [roomId, userId, refresh]);

  // Reconciliation poll + refresh when the tab comes back into view.
  useEffect(() => {
    const status = state.room?.status;
    if (status === 'finished' || status === 'cancelled') return;

    const interval = setInterval(() => { void refresh(); }, BATTLE_RECONCILE_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [state.room?.status, refresh]);

  useEffect(() => {
    const status = state.room?.status;
    if (status === 'finished' || status === 'cancelled') return;

    const interval = setInterval(() => setNow(Date.now()), BATTLE_TICK_MS);
    return () => clearInterval(interval);
  }, [state.room?.status]);

  const currentQuestion = useMemo(() => {
    if (!state.room) return null;
    return state.questions.find((item) => item.roundIndex === state.room?.currentRound) ?? null;
  }, [state.questions, state.room]);

  const currentRound = state.room?.currentRound ?? -1;
  const selectedChoice = selection?.round === currentRound ? selection.choiceIndex : null;
  const lastResult = result?.round === currentRound ? result.value : null;

  const remainingMs = useMemo(() => {
    if (!state.room || !currentQuestion) return 0;
    if (currentQuestion.resolvedAt) return 0;
    return getRemainingMs(currentQuestion, state.room.roundDurationMs, now);
  }, [state.room, currentQuestion, now]);

  const hasAnswered = currentQuestion ? answeredRounds.has(currentQuestion.roundIndex) : false;

  const canAnswer = useMemo(() => {
    if (!state.room || !userId) return false;
    return canViewerAnswer({
      room: state.room,
      question: currentQuestion,
      userId,
      hasAnswered,
      now,
    });
  }, [state.room, currentQuestion, userId, hasAnswered, now]);

  const submitAnswer = useCallback(async (choiceIndex: number) => {
    const room = state.room;
    if (!room || !currentQuestion || !isSupabaseConfigured()) return;

    // Optimistic lockout: one attempt per round, so block the UI immediately.
    setSelection({ round: currentQuestion.roundIndex, choiceIndex });
    setAnsweredRounds((prev) => new Set(prev).add(currentQuestion.roundIndex));

    const supabase = createClient();
    const { data, error } = await supabase.rpc('submit_battle_answer', {
      p_room_id: room.id,
      p_round_index: currentQuestion.roundIndex,
      p_choice_index: choiceIndex,
    });

    if (!mountedRef.current) return;

    if (error) {
      // The attempt never landed -- let the player try again while time remains.
      setAnsweredRounds((prev) => {
        const next = new Set(prev);
        next.delete(currentQuestion.roundIndex);
        return next;
      });
      setSelection(null);
      return;
    }

    setResult({ round: currentQuestion.roundIndex, value: data as BattleAnswerResult });
    void refresh();
  }, [state.room, currentQuestion, refresh]);

  // Timer expiry. Both clients may call; the server re-checks the deadline.
  useEffect(() => {
    const room = state.room;
    if (!room || !currentQuestion || room.status !== 'in_progress') return;
    if (currentQuestion.resolvedAt || remainingMs > 0) return;
    if (timeoutRequestedRef.current === currentQuestion.roundIndex) return;
    if (!isSupabaseConfigured()) return;

    timeoutRequestedRef.current = currentQuestion.roundIndex;
    const supabase = createClient();
    void supabase
      .rpc('resolve_battle_round_timeout', {
        p_room_id: room.id,
        p_round_index: currentQuestion.roundIndex,
      })
      .then(() => refresh());
  }, [state.room, currentQuestion, remainingMs, refresh]);

  // Round advance after the reveal pause. Idempotent on the server.
  useEffect(() => {
    const room = state.room;
    if (!room || !currentQuestion || room.status !== 'in_progress') return;
    if (!currentQuestion.resolvedAt) return;
    if (advanceRequestedRef.current === currentQuestion.roundIndex) return;
    if (!isSupabaseConfigured()) return;

    advanceRequestedRef.current = currentQuestion.roundIndex;
    const timer = setTimeout(() => {
      const supabase = createClient();
      void supabase
        .rpc('advance_battle_round', {
          p_room_id: room.id,
          p_from_round: currentQuestion.roundIndex,
        })
        .then(() => refresh());
    }, BATTLE_ROUND_REVEAL_MS);

    return () => clearTimeout(timer);
  }, [state.room, currentQuestion, refresh]);

  const leaveBattle = useCallback(async () => {
    if (!state.room || !isSupabaseConfigured()) return;
    const supabase = createClient();
    await supabase.rpc('abandon_battle', { p_room_id: state.room.id });
    await refresh();
  }, [state.room, refresh]);

  return {
    ...state,
    currentQuestion,
    remainingMs,
    hasAnswered,
    canAnswer,
    selectedChoice,
    lastResult,
    submitAnswer,
    leaveBattle,
    refresh,
  };
}
