'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/use-auth';
import { useProjects } from '@/hooks/use-projects';
import { BattleScreenHeader } from '@/components/battle/BattleScreenHeader';
import { BattleStatusPanel } from '@/components/battle/BattleStatusPanel';
import { BattleButton, BattleLinkButton } from '@/components/battle/BattleButton';
import { BattleInviteCard } from '@/components/battle/BattleInviteCard';
import {
  BattleSettingsFields,
  BattleWordbookField,
} from '@/components/battle/BattleLobbyForm';
import {
  BATTLE_DEFAULT_QUESTION_COUNT,
  BATTLE_DEFAULT_ROUND_DURATION_MS,
  BATTLE_MATCH_POLL_INTERVAL_MS,
  normalizeInviteCode,
} from '@/lib/battle/config';
import type { BattleRoom } from '@/lib/battle/types';

type LobbyMode = 'idle' | 'matching' | 'hosting';

const QUESTION_COUNT_OPTIONS = [5, 10, 20] as const;
const ROUND_DURATION_OPTIONS = [10_000, 15_000, 20_000] as const;

export default function BattleLobbyPage() {
  const router = useRouter();
  const { isAuthenticated, isPro, loading: authLoading } = useAuth();
  const { projects, loading: projectsLoading } = useProjects();

  const [projectId, setProjectId] = useState('');
  const [questionCount, setQuestionCount] = useState<number>(BATTLE_DEFAULT_QUESTION_COUNT);
  const [roundDurationMs, setRoundDurationMs] = useState<number>(BATTLE_DEFAULT_ROUND_DURATION_MS);
  const [mode, setMode] = useState<LobbyMode>('idle');
  const [hostedRoom, setHostedRoom] = useState<BattleRoom | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const modeRef = useRef<LobbyMode>('idle');
  modeRef.current = mode;

  useEffect(() => {
    if (!projectId && projects.length > 0) {
      setProjectId(projects[0].id);
    }
  }, [projects, projectId]);

  const hasProject = useMemo(
    () => projects.some((project) => project.id === projectId),
    [projects, projectId],
  );

  const postJson = useCallback(async (url: string, body: unknown) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
      throw new Error(payload?.error ?? '通信に失敗しました。');
    }
    return payload;
  }, []);

  const startRandomMatch = useCallback(async () => {
    if (!hasProject) return;
    setError(null);
    setBusy(true);
    try {
      const payload = await postJson('/api/battle/match', {
        projectId,
        questionCount,
        roundDurationMs,
      });

      if (payload.matched && payload.roomId) {
        router.push(`/battle/${payload.roomId}`);
        return;
      }
      setMode('matching');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'マッチングに失敗しました。');
    } finally {
      setBusy(false);
    }
  }, [hasProject, projectId, questionCount, roundDurationMs, postJson, router]);

  const cancelRandomMatch = useCallback(async () => {
    setMode('idle');
    await fetch('/api/battle/match', { method: 'DELETE' }).catch(() => {});
  }, []);

  // 待機中はサーバーがペアリングしたルームをポーリングで拾う。
  useEffect(() => {
    if (mode !== 'matching') return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch('/api/battle/match', { cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        if (payload?.matched && payload.roomId && modeRef.current === 'matching') {
          router.push(`/battle/${payload.roomId}`);
        }
      } catch {
        // 1回落ちても待機は続ける。
      }
    }, BATTLE_MATCH_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [mode, router]);

  const createFriendRoom = useCallback(async () => {
    if (!hasProject) return;
    setError(null);
    setBusy(true);
    try {
      const payload = await postJson('/api/battle/rooms', {
        projectId,
        questionCount,
        roundDurationMs,
      });
      setHostedRoom(payload.room as BattleRoom);
      setMode('hosting');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ルームの作成に失敗しました。');
    } finally {
      setBusy(false);
    }
  }, [hasProject, projectId, questionCount, roundDurationMs, postJson]);

  // ホストは相手がコードで入室するまでここで待つ。
  useEffect(() => {
    if (mode !== 'hosting' || !hostedRoom) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/battle/rooms/${hostedRoom.id}`, { cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        if (payload?.room?.guest) router.push(`/battle/${hostedRoom.id}`);
      } catch {
        // ignore
      }
    }, BATTLE_MATCH_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [mode, hostedRoom, router]);

  const joinFriendRoom = useCallback(async () => {
    if (!hasProject) return;
    const normalized = normalizeInviteCode(joinCode);
    if (!normalized) {
      setError('招待コードは6文字です。');
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const payload = await postJson('/api/battle/join', { inviteCode: normalized, projectId });
      router.push(`/battle/${(payload.room as BattleRoom).id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '参加に失敗しました。');
    } finally {
      setBusy(false);
    }
  }, [hasProject, projectId, joinCode, postJson, router]);

  const shell = (children: React.ReactNode, header?: React.ReactNode) => (
    <div className="relative flex min-h-screen flex-col bg-[var(--color-background)] pb-[110px] font-[var(--font-body)]">
      {header ?? <BattleScreenHeader eyebrow="BATTLE" title="単語対戦" fallbackHref="/" />}
      {children}
    </div>
  );

  if (authLoading) {
    return shell(<BattleStatusPanel spinning title="読み込み中" />);
  }

  if (!isAuthenticated) {
    return shell(
      <BattleStatusPanel
        icon="lock"
        title="ログインが必要です"
        description="リアルタイム対戦を遊ぶにはログインしてください。"
        actions={<BattleLinkButton href="/login" icon="login">ログイン</BattleLinkButton>}
      />,
    );
  }

  if (!isPro) {
    return shell(
      <BattleStatusPanel
        icon="crown"
        title="Proプラン限定の機能です"
        description="リアルタイム対戦はProプラン限定です。対戦でコインは消費しません。"
        actions={<BattleLinkButton href="/pricing" icon="crown">Proプランを見る</BattleLinkButton>}
      />,
    );
  }

  if (mode === 'matching') {
    return shell(
      <BattleStatusPanel
        spinning
        title="対戦相手を探しています"
        description="見つかり次第、自動で対戦が始まります。"
        actions={
          <BattleButton variant="outline" icon="close" onClick={cancelRandomMatch}>
            キャンセル
          </BattleButton>
        }
      />,
      <BattleScreenHeader
        eyebrow="RANDOM MATCH"
        title="マッチング中"
        onBack={cancelRandomMatch}
      />,
    );
  }

  if (mode === 'hosting' && hostedRoom?.inviteCode) {
    const leaveHosting = () => {
      setMode('idle');
      setHostedRoom(null);
    };

    return shell(
      <BattleStatusPanel
        spinning
        title="相手を待っています"
        description="このコードを相手に伝えてください。参加すると自動で始まります。"
        actions={
          <BattleButton variant="outline" icon="close" onClick={leaveHosting}>
            キャンセル
          </BattleButton>
        }
      >
        <BattleInviteCard inviteCode={hostedRoom.inviteCode} />
      </BattleStatusPanel>,
      <BattleScreenHeader eyebrow="FRIEND MATCH" title="招待コード" onBack={leaveHosting} />,
    );
  }

  return shell(
    <div className="px-[18px] pb-8 pt-4">
      <div className="mb-6 flex items-start gap-3 rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--color-accent)] p-4 text-white shadow-[2px_3px_0_var(--solid-ink)]">
        <Icon name="bolt" size={24} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-display text-[15px] font-black leading-tight">早押し4択バトル</p>
          <p className="mt-1 text-[12px] leading-relaxed opacity-90">
            先に正解した方が1ポイント。1問につき回答は1人1回だけです。
          </p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2 rounded-[12px] border-2 border-[var(--color-error)] bg-[var(--color-error-light)] px-3.5 py-3 text-[13px] text-[var(--color-error)]"
        >
          <Icon name="error" size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mb-7 grid gap-5">
        <BattleWordbookField
          projects={projects}
          loading={projectsLoading}
          value={projectId}
          onChange={setProjectId}
        />
        <BattleSettingsFields
          questionCount={questionCount}
          onQuestionCountChange={setQuestionCount}
          questionCountOptions={QUESTION_COUNT_OPTIONS}
          roundDurationMs={roundDurationMs}
          onRoundDurationChange={setRoundDurationMs}
          roundDurationOptions={ROUND_DURATION_OPTIONS}
        />
      </div>

      <BattleButton
        icon="shuffle"
        disabled={busy || !hasProject}
        onClick={startRandomMatch}
        className="mb-7"
      >
        ランダムマッチ
      </BattleButton>

      <section className="rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-4 shadow-[2px_3px_0_var(--solid-ink)]">
        <div className="mb-3.5 flex items-center gap-1.5">
          <Icon name="group" size={14} className="text-[var(--color-muted)]" />
          <h2 className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
            フレンド対戦
          </h2>
        </div>

        <BattleButton
          variant="outline"
          icon="add"
          disabled={busy || !hasProject}
          onClick={createFriendRoom}
          className="mb-3.5"
        >
          招待コードを作る
        </BattleButton>

        <div className="flex gap-2">
          <input
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
            placeholder="コード"
            maxLength={8}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            aria-label="招待コード"
            className="min-w-0 flex-1 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-background)] px-3 py-3 text-center font-display text-[18px] font-black uppercase tracking-[0.2em] text-[var(--solid-ink)] placeholder:text-[13px] placeholder:font-bold placeholder:tracking-normal placeholder:text-[var(--color-muted)]"
          />
          <button
            type="button"
            onClick={joinFriendRoom}
            disabled={busy || !hasProject || joinCode.length === 0}
            className="shrink-0 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-5 font-display text-[14px] font-bold text-[var(--color-background)] shadow-[2px_3px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-[1px_2px_0_var(--solid-ink)] disabled:opacity-45 disabled:shadow-none"
          >
            参加
          </button>
        </div>
      </section>
    </div>,
  );
}
